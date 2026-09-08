'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const { authenticationCachePath } = require('./data-paths');

function authenticationMode(value) {
  if (value === undefined || value === true || value === 'true' || value === 'microsoft') return 'microsoft';
  if (value === false || value === 'false' || value === 'offline') return 'offline';
  throw new Error('Authentication must be "microsoft" or "offline".');
}

function validateConnection(input) {
  if (!input || typeof input !== 'object') throw new TypeError('Connection details are required.');
  const username = String(input.username ?? '').trim();
  const host = String(input.host ?? '').trim();
  const port = Number(input.port ?? 25565);
  const auth = authenticationMode(input.auth);
  const version = String(input.version ?? '').trim();
  const fakeHost = String(input.fakeHost ?? '').trim();
  if (!username || username.length > 254) throw new Error('A valid account name or email address is required.');
  if (!host || /\s|\//u.test(host) || /^[^:]+:\d+$/u.test(host)) throw new Error('Enter a hostname or IP address without a protocol or port.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be an integer from 1 to 65535.');
  if (version.length > 32) throw new Error('The server version is too long.');
  if (fakeHost && (/\s|\//u.test(fakeHost) || fakeHost.length > 253)) throw new Error('Enter a valid handshake address.');
  return { username, host, port, auth, version, fakeHost };
}

class ConnectionService {
  constructor({ client, store, logger }) {
    this.client = client;
    this.store = store;
    this.logger = logger;
  }

  async connect(input, reply = (message) => this.logger.log(message)) {
    if (this.client.bot) throw new Error(`Already connected as ${this.client.bot.username || 'a client'}. Disconnect first.`);
    const details = validateConnection(input);
    const cachePrefix = details.username.toUpperCase().replace(/[^A-Z0-9@._-]/gu, '_').slice(0, 64) || 'ACCOUNT';
    const cacheHash = crypto.createHash('sha256').update(details.username.toLowerCase()).digest('hex').slice(0, 8);
    const connectionOptions = {
      username: details.username,
      accountUsername: details.username,
      host: details.host,
      port: details.port,
      auth: details.auth,
      profilesFolder: path.join(authenticationCachePath(), `${cachePrefix}-${cacheHash}`),
      fakeHost: details.fakeHost || details.host,
      logErrors: false,
      onMsaCode(data) {
        reply(`[Microsoft] Open ${data.verification_uri} and enter code ${data.user_code}.`);
      }
    };
    if (details.version && details.version.toLowerCase() !== 'auto') connectionOptions.version = details.version;
    await this.store.addConnection(details);
    reply(`[Connect] Opening ${details.host}:${details.port} as ${details.username} (${details.auth}).`);
    await this.client.startClient(connectionOptions);
    return details;
  }

  async reconnect(reply) {
    const details = await this.store.getConnection();
    if (!details) throw new Error('No previous connection is available.');
    return this.connect(details, reply);
  }
}

module.exports = { ConnectionService, authenticationMode, validateConnection };
