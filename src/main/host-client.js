'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const net = require('node:net');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { consumeMessages, writeMessage } = require('./host-server');
const { hostEndpoint, tokenPath } = require('./host-endpoint');
const { HOST_METHOD_NAMES, installRequestMethods } = require('./transport-methods');

class HostClient extends EventEmitter {
  constructor({ userDataPath, timeout = 30000 }) {
    super();
    this.userDataPath = path.resolve(userDataPath);
    this.endpoint = hostEndpoint(this.userDataPath);
    this.timeout = timeout;
    this.pending = new Map();
    this.socket = null;
    this.token = null;
    this.cached = null;
    this.external = true;
    this.closing = false;
    this.logger = {
      log: (...parts) => console.log(...parts),
      info: (...parts) => console.info(...parts),
      warn: (...parts) => console.warn(...parts),
      error: (...parts) => console.error(...parts),
      debug: (...parts) => console.debug(...parts)
    };
  }

  async open() {
    this.closing = false;
    try {
      this.token = (await fs.readFile(tokenPath(this.userDataPath), 'utf8')).trim();
      const socket = net.createConnection(this.endpoint);
      this.socket = socket;
      await new Promise((resolve, reject) => {
        const failed = (error) => {
          clearTimeout(timer);
          socket.off('connect', connected);
          reject(error);
        };
        const connected = () => {
          clearTimeout(timer);
          socket.off('error', failed);
          resolve();
        };
        const timer = setTimeout(() => {
          socket.destroy();
          failed(new Error('Timed out while connecting to the MinePrompt host.'));
        }, Math.min(this.timeout, 3000));
        socket.once('connect', connected);
        socket.once('error', failed);
      });
      consumeMessages(socket, (message) => this.receive(message));
      socket.on('error', (error) => this.failPending(error));
      socket.on('close', () => {
        const error = new Error('The MinePrompt host disconnected.');
        this.failPending(error);
        if (!this.closing) this.emit('event', 'attention', { message: error.message });
      });
      this.cached = await this.request('snapshot');
      return this;
    } catch (error) {
      this.closing = true;
      const socket = this.socket;
      this.socket = null;
      socket?.destroy();
      this.failPending(error);
      throw error;
    }
  }

  receive(message) {
    if (message?.type === 'event') {
      if (message.channel === 'snapshot') this.cached = message.payload;
      this.emit('event', message.channel, message.payload);
      this.emit(message.channel, message.payload);
      return;
    }
    if (message?.type !== 'response') return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.ok) pending.resolve(message.value);
    else pending.reject(new Error(message.error || 'Runtime request failed.'));
  }

  request(method, ...args) {
    if (!this.socket || this.socket.destroyed) return Promise.reject(new Error('The MinePrompt host is not connected.'));
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Runtime request timed out while running ${method}.`));
      }, method === 'connect' ? 180000 : this.timeout);
      this.pending.set(id, { resolve, reject, timer });
      try {
        if (!writeMessage(this.socket, { type: 'request', id, token: this.token, method, args })) throw new Error('The MinePrompt host connection is not writable.');
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  failPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  snapshot() { return structuredClone(this.cached); }

  close() {
    this.closing = true;
    this.socket?.destroy();
    this.socket = null;
    this.failPending(new Error('The MinePrompt host connection was closed.'));
    return Promise.resolve();
  }
}

installRequestMethods(HostClient.prototype, HOST_METHOD_NAMES);

module.exports = { HostClient };
