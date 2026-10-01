'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const net = require('node:net');
const path = require('node:path');
const { ApplicationRuntime } = require('./application-runtime');
const { hostEndpoint, tokenPath } = require('./host-endpoint');
const { nodeProcessSessionFactory } = require('./node-process-session');
const { HOST_METHOD_NAMES } = require('./transport-methods');

const HOST_METHODS = new Set(HOST_METHOD_NAMES);

function writeMessage(socket, message) {
  socket.write(`${JSON.stringify(message)}\n`);
}

function consumeMessages(socket, receive) {
  let buffer = '';
  socket.setEncoding('utf8');
  socket.on('data', (chunk) => {
    buffer += chunk;
    if (buffer.length > 4 * 1024 * 1024) {
      socket.destroy(new Error('Runtime message limit exceeded.'));
      return;
    }
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line) {
        try { receive(JSON.parse(line)); } catch { socket.destroy(new Error('Invalid runtime message.')); }
      }
      newline = buffer.indexOf('\n');
    }
  });
}

function probe(endpoint, timeout = 300) {
  return new Promise((resolve) => {
    const socket = net.createConnection(endpoint);
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeout);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

async function loadToken(dataPath) {
  const file = tokenPath(dataPath);
  await fs.mkdir(dataPath, { recursive: true });
  try {
    const token = (await fs.readFile(file, 'utf8')).trim();
    if (!/^[a-f0-9]{64}$/u.test(token)) throw new Error('The runtime authentication token is invalid.');
    return token;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const token = crypto.randomBytes(32).toString('hex');
    await fs.writeFile(file, `${token}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    return token;
  }
}

class HostServer {
  constructor({ rootPath, userDataPath, originalConsole = console, sessionFactory = null }) {
    this.rootPath = path.resolve(rootPath);
    this.userDataPath = path.resolve(userDataPath);
    this.originalConsole = originalConsole;
    this.sessionFactory = sessionFactory || nodeProcessSessionFactory(this.rootPath);
    this.endpoint = hostEndpoint(this.userDataPath);
    this.server = null;
    this.runtime = null;
    this.token = null;
    this.clients = new Set();
  }

  async start() {
    if (await probe(this.endpoint)) throw new Error('A MinePrompt host is already running for this data directory.');
    if (process.platform !== 'win32') await fs.unlink(this.endpoint).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    this.token = await loadToken(this.userDataPath);
    this.runtime = await new ApplicationRuntime({
      rootPath: this.rootPath,
      userDataPath: this.userDataPath,
      originalConsole: this.originalConsole,
      sessionFactory: this.sessionFactory,
      emit: (channel, payload) => this.broadcast({ type: 'event', channel, payload })
    }).init();
    try {
      this.server = net.createServer((socket) => this.accept(socket));
      await new Promise((resolve, reject) => {
        this.server.once('error', reject);
        this.server.listen(this.endpoint, () => {
          this.server.off('error', reject);
          resolve();
        });
      });
      if (process.platform !== 'win32') await fs.chmod(this.endpoint, 0o600);
    } catch (error) {
      await this.runtime.close();
      this.runtime = null;
      this.server = null;
      throw error;
    }
    return this;
  }

  accept(socket) {
    this.clients.add(socket);
    socket.on('close', () => this.clients.delete(socket));
    socket.on('error', () => this.clients.delete(socket));
    consumeMessages(socket, (message) => void this.handle(socket, message));
  }

  async handle(socket, message) {
    if (message?.type !== 'request' || typeof message.id !== 'string') return;
    if (message.token !== this.token) {
      writeMessage(socket, { type: 'response', id: message.id, ok: false, error: 'Runtime authentication failed.' });
      return;
    }
    try {
      if (!HOST_METHODS.has(message.method) || typeof this.runtime?.[message.method] !== 'function') throw new Error('Runtime method is not available.');
      const value = await this.runtime[message.method](...(Array.isArray(message.args) ? message.args : []));
      writeMessage(socket, { type: 'response', id: message.id, ok: true, value });
    } catch (error) {
      writeMessage(socket, { type: 'response', id: message.id, ok: false, error: error.message });
    }
  }

  broadcast(message) {
    for (const client of this.clients) {
      if (!client.destroyed) writeMessage(client, message);
    }
  }

  async close() {
    for (const client of this.clients) client.destroy();
    this.clients.clear();
    if (this.server) await new Promise((resolve) => { this.server.close(resolve); });
    this.server = null;
    if (this.runtime) await this.runtime.close();
    this.runtime = null;
    if (process.platform !== 'win32') await fs.unlink(this.endpoint).catch(() => {});
  }
}

module.exports = { HOST_METHODS, HostServer, consumeMessages, loadToken, probe, writeMessage };
