'use strict';

const path = require('node:path');
const packageJson = require('../../package.json');
const { Store } = require('./store');
const { RuntimeLogger } = require('./logger');
const { InterfaceState } = require('./interface-state');
const { CommandRegistry } = require('./command-registry');
const { MineflayerClient } = require('./mineflayer-client');
const { ActivityManager } = require('./activity-manager');
const { ConnectionService, validateServer } = require('./connection-service');
const { InventoryService } = require('./inventory-service');

const REMOTE_CAPABILITIES = new Set(['status', 'chat', 'movement', 'inventory', 'combat', 'world']);

class ApplicationRuntime {
  constructor({ rootPath, userDataPath, emit }) {
    this.rootPath = rootPath;
    this.emit = emit;
    this.logger = new RuntimeLogger(emit);
    this.interface = new InterfaceState(emit, this.logger);
    this.store = new Store(path.join(userDataPath, 'mineprompt.json'), () => this.publishSnapshot());
    this.activities = new ActivityManager(() => this.publishSnapshot());
    this.client = new MineflayerClient({
      logger: this.logger,
      interfaceState: this.interface,
      store: this.store,
      getCommands: () => this.commands,
      activities: this.activities,
      onSnapshot: () => this.publishSnapshot()
    });
    this.connections = new ConnectionService({ client: this.client, store: this.store, logger: this.logger, interfaceState: this.interface });
    this.inventory = new InventoryService({ getClient: () => this.client, onChange: () => this.publishSnapshot() });
    this.commands = new CommandRegistry({
      rootPath,
      privateCommandsPath: path.join(userDataPath, 'commands'),
      logger: this.logger,
      getContext: () => this.commandContext()
    });
  }

  async init() {
    await this.store.init();
    this.commands.setCommands('global');
    this.logger.log(`MinePrompt ${packageJson.version} is ready. Type "help" to see available commands.`);
    this.publishSnapshot();
    return this;
  }

  commandContext() {
    return Object.freeze({
      activities: this.activities,
      bot: this.client.bot,
      chatMessageClass: this.client.chatMessageClass,
      client: this.client,
      commands: this.commands,
      connections: this.connections,
      interfaceState: this.interface,
      inventory: this.inventory,
      logger: this.logger,
      store: this.store,
      execute: (input, origin) => this.commands.execute(input, origin)
    });
  }

  async execute(input) {
    return this.commands.execute(input, { type: 'terminal' });
  }

  async complete(input) {
    return this.commands.complete(input);
  }

  async connect(options) {
    await this.connections.connect(options);
    return { ok: true };
  }

  async disconnect() {
    await this.client.disconnect();
    return { ok: true };
  }

  async reloadCommands() {
    this.commands.reload();
    this.publishSnapshot();
    return { ok: true };
  }

  async inventoryAction(request) {
    if (!Number.isInteger(request?.connectionId) || !Object.hasOwn(request, 'windowId')) throw new Error('The inventory view is missing session details.');
    const result = await this.inventory.execute(request);
    this.logger.log(result.message);
    return { ok: true, ...result };
  }

  preferences() {
    const settings = this.store.snapshot().settings;
    return {
      resourcePackPolicy: settings.resourcePackPolicy === 'accept' ? 'accept' : 'deny',
      externalPlayerHeadsEnabled: settings.externalPlayerHeadsEnabled === true,
      remoteCommandsEnabled: settings.remoteCommandsEnabled === true,
      remoteCommandPlayers: Array.isArray(settings.remoteCommandPlayers) ? settings.remoteCommandPlayers : [],
      remoteCommandCapabilities: Array.isArray(settings.remoteCommandCapabilities)
        ? settings.remoteCommandCapabilities.filter((value) => REMOTE_CAPABILITIES.has(value))
        : [],
      automaticReconnectEnabled: settings.automaticReconnectEnabled === true,
      reconnectAttempts: Number.isInteger(settings.reconnectAttempts) ? settings.reconnectAttempts : 3
    };
  }

  async saveProfile(profile) {
    const authentication = profile?.authentication;
    if (![true, false, 'microsoft', 'offline'].includes(authentication)) throw new Error('Select a valid authentication mode.');
    const saved = await this.store.saveAccount({
      originalUsername: profile?.originalUsername,
      username: profile?.username,
      authentication: authentication === true || authentication === 'microsoft'
    });
    return { ok: true, profile: saved };
  }

  async removeProfile(username) {
    const removed = await this.store.removeAccount(username);
    if (!removed) throw new Error('The profile no longer exists.');
    return { ok: true };
  }

  async saveServer(profile) {
    const server = validateServer(profile);
    const saved = await this.store.saveServer({
      originalName: profile?.originalName,
      name: profile?.name,
      ...server
    });
    return { ok: true, server: saved };
  }

  async removeServer(name) {
    const removed = await this.store.removeServer(name);
    if (!removed) throw new Error('The server profile no longer exists.');
    return { ok: true };
  }

  async savePreferences(preferences) {
    const resourcePackPolicy = preferences?.resourcePackPolicy;
    if (!['accept', 'deny'].includes(resourcePackPolicy)) throw new Error('Invalid resource-pack policy.');
    const players = Array.isArray(preferences?.remoteCommandPlayers) ? preferences.remoteCommandPlayers : [];
    const capabilities = Array.isArray(preferences?.remoteCommandCapabilities) ? preferences.remoteCommandCapabilities : [];
    const remoteCommandPlayers = players.map((name) => String(name).trim()).filter(Boolean).filter((name, index, values) =>
      values.findIndex((candidate) => candidate.toLowerCase() === name.toLowerCase()) === index);
    if (remoteCommandPlayers.some((name) => !/^[A-Za-z0-9_]{1,16}$/u.test(name))) {
      throw new Error('Remote player names may contain only letters, numbers, and underscores.');
    }
    if (capabilities.some((value) => !REMOTE_CAPABILITIES.has(value))) throw new Error('A remote command permission is invalid.');
    const reconnectAttempts = Number(preferences?.reconnectAttempts ?? 3);
    if (!Number.isInteger(reconnectAttempts) || reconnectAttempts < 1 || reconnectAttempts > 10) throw new Error('Reconnect attempts must be an integer from 1 to 10.');
    await this.store.setSettings({
      resourcePackPolicy,
      externalPlayerHeadsEnabled: preferences.externalPlayerHeadsEnabled === true,
      remoteCommandsEnabled: preferences.remoteCommandsEnabled === true,
      remoteCommandPlayers,
      remoteCommandCapabilities: [...new Set(capabilities)],
      automaticReconnectEnabled: preferences.automaticReconnectEnabled === true,
      reconnectAttempts
    });
    return { ok: true, preferences: this.preferences() };
  }

  snapshot() {
    return {
      version: packageJson.version,
      state: this.interface.snapshot(),
      accounts: this.store.snapshot().accounts,
      servers: this.store.snapshot().servers,
      preferences: this.preferences(),
      activities: this.activities.snapshot(),
      session: this.client.snapshot(),
      commands: this.commands.commands_array.map((command) => ({
        command: command.command,
        aliases: command.aliases || [],
        category: command.category,
        capability: command.capability,
        description: command.description || '',
        usage: command.usage || command.command,
        requiresConnection: Boolean(command.requires?.entity)
      }))
    };
  }

  diagnostics() {
    const data = this.store.snapshot();
    const sensitive = [
      ...data.accounts.map((account) => account.username),
      ...data.servers.flatMap((server) => [server.name, server.host, server.fakeHost])
    ].filter(Boolean).sort((left, right) => right.length - left.length);
    const redact = (message) => sensitive.reduce((value, secret) => value.replaceAll(secret, '[redacted]'), String(message));
    return {
      application: { version: packageJson.version, platform: process.platform, architecture: process.arch },
      state: {
        status: this.interface.state.status,
        lastError: redact(this.interface.state.lastError || '')
      },
      activities: this.activities.snapshot().map(({ id, label, startedAt }) => ({ id, label, startedAt })),
      logs: this.logger.recent().filter((entry) => entry.level !== 'log').map((entry) => ({ ...entry, message: redact(entry.message) }))
    };
  }

  publishSnapshot() {
    this.emit('snapshot', this.snapshot());
  }

  async close() {
    this.activities.stopAll();
    await this.client.close();
    await this.store.close();
  }
}

module.exports = { ApplicationRuntime };
