'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const EMPTY_DATA = Object.freeze({
  version: 1,
  accounts: [],
  settings: {},
  connections: []
});

function cleanData(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    version: 1,
    accounts: Array.isArray(source.accounts)
      ? source.accounts.filter((account) => account && typeof account.username === 'string').map((account) => ({
          username: account.username,
          authentication: account.authentication === true || account.authentication === 'microsoft'
        }))
      : [],
    settings: source.settings && typeof source.settings === 'object' && !Array.isArray(source.settings)
      ? source.settings
      : {},
    connections: Array.isArray(source.connections)
      ? source.connections.filter((entry) => entry && typeof entry === 'object' && typeof entry.host === 'string').slice(-20)
      : []
  };
}

class Store {
  constructor(filePath, onChange = () => {}) {
    this.filePath = filePath;
    this.onChange = onChange;
    this.data = structuredClone(EMPTY_DATA);
    this.writeQueue = Promise.resolve();
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      this.data = cleanData(JSON.parse(await fs.readFile(this.filePath, 'utf8')));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        const backup = `${this.filePath}.corrupt-${Date.now()}`;
        await fs.rename(this.filePath, backup).catch(() => {});
      }
      this.data = structuredClone(EMPTY_DATA);
      await this.persist();
    }
    return this;
  }

  snapshot() {
    return structuredClone(this.data);
  }

  persist() {
    const payload = `${JSON.stringify(this.data, null, 2)}\n`;
    const temporaryPath = `${this.filePath}.tmp`;
    this.writeQueue = this.writeQueue.catch(() => {}).then(async () => {
      await fs.writeFile(temporaryPath, payload, { encoding: 'utf8', mode: 0o600 });
      await fs.rename(temporaryPath, this.filePath);
    });
    return this.writeQueue;
  }

  async changed() {
    await this.persist();
    this.onChange(this.snapshot());
  }

  async addConnection(connection) {
    if (!connection || typeof connection !== 'object') return;
    this.data.connections.push(structuredClone(connection));
    this.data.connections = this.data.connections.slice(-20);
    await this.changed();
  }

  async getConnection() {
    return structuredClone(this.data.connections.at(-1));
  }

  async addAccount(username, authentication) {
    const cleanUsername = String(username ?? '').trim();
    if (!cleanUsername) throw new Error('An account username is required.');
    if (this.data.accounts.some((account) => account.username.toLowerCase() === cleanUsername.toLowerCase())) {
      return false;
    }
    this.data.accounts.push({ username: cleanUsername, authentication: Boolean(authentication) });
    this.data.accounts.sort((a, b) => a.username.localeCompare(b.username));
    await this.changed();
    return true;
  }

  async saveAccount({ originalUsername, username, authentication }) {
    const cleanUsername = String(username ?? '').trim();
    const hasControlCharacters = [...cleanUsername].some((character) => {
      const code = character.codePointAt(0);
      return code < 32 || code === 127;
    });
    if (!cleanUsername || cleanUsername.length > 254 || hasControlCharacters) {
      throw new Error('Enter a valid account name or Microsoft email address.');
    }
    const original = String(originalUsername ?? '').trim().toLowerCase();
    const duplicate = this.data.accounts.find((account) =>
      account.username.toLowerCase() === cleanUsername.toLowerCase() && account.username.toLowerCase() !== original);
    if (duplicate) throw new Error(`${cleanUsername} is already saved.`);
    const account = original
      ? this.data.accounts.find((entry) => entry.username.toLowerCase() === original)
      : null;
    if (original && !account) throw new Error('The profile no longer exists.');
    if (account) {
      account.username = cleanUsername;
      account.authentication = Boolean(authentication);
    } else {
      this.data.accounts.push({ username: cleanUsername, authentication: Boolean(authentication) });
    }
    this.data.accounts.sort((a, b) => a.username.localeCompare(b.username));
    await this.changed();
    return { username: cleanUsername, authentication: Boolean(authentication) };
  }

  async removeAccount(username) {
    const target = String(username ?? '').toLowerCase();
    const previousLength = this.data.accounts.length;
    this.data.accounts = this.data.accounts.filter((account) => account.username.toLowerCase() !== target);
    if (this.data.accounts.length === previousLength) return false;
    await this.changed();
    return true;
  }

  async renameAccount(from, to) {
    const account = await this.getAccount(from);
    if (!account || !to || account.username === to) return false;
    const target = await this.getAccount(to);
    if (target && target !== account) {
      target.authentication ||= account.authentication;
      this.data.accounts = this.data.accounts.filter((entry) => entry !== account);
    } else {
      account.username = to;
    }
    this.data.accounts.sort((left, right) => left.username.localeCompare(right.username));
    await this.changed();
    return true;
  }

  async getAccount(username) {
    const target = String(username ?? '').toLowerCase();
    return this.data.accounts.find((account) => account.username.toLowerCase() === target);
  }

  async getAccounts() {
    return structuredClone(this.data.accounts);
  }

  async getSetting(setting) {
    return this.data.settings[setting];
  }

  async setSetting(setting, value) {
    this.data.settings[setting] = value;
    await this.changed();
  }

  async setSettings(settings) {
    Object.assign(this.data.settings, settings);
    await this.changed();
  }

  async close() {
    await this.writeQueue;
  }
}

module.exports = { Store, cleanData };
