'use strict';

const path = require('node:path');
const packageJson = require('../../package.json');
const { Store } = require('./store');
const { RuntimeLogger } = require('./logger');
const { InterfaceState } = require('./interface-state');
const { CommandRegistry } = require('./command-registry');
const { MineflayerClient } = require('./mineflayer-client');
const { ActivityManager } = require('./activity-manager');
const { ConnectionService } = require('./connection-service');

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
      activities: this.activities
    });
    this.connections = new ConnectionService({ client: this.client, store: this.store, logger: this.logger });
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

  async reloadCommands() {
    this.commands.reload();
    this.publishSnapshot();
    return { ok: true };
  }

  preferences() {
    const settings = this.store.snapshot().settings;
    return {
      resourcePackPolicy: settings.resourcePackPolicy === 'accept' ? 'accept' : 'deny',
      externalPlayerHeadsEnabled: settings.externalPlayerHeadsEnabled === true,
      remoteCommandsEnabled: settings.remoteCommandsEnabled === true,
      remoteCommandPlayers: Array.isArray(settings.remoteCommandPlayers) ? settings.remoteCommandPlayers : []
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

  async savePreferences(preferences) {
    const resourcePackPolicy = preferences?.resourcePackPolicy;
    if (!['accept', 'deny'].includes(resourcePackPolicy)) throw new Error('Invalid resource-pack policy.');
    const players = Array.isArray(preferences?.remoteCommandPlayers) ? preferences.remoteCommandPlayers : [];
    const remoteCommandPlayers = players.map((name) => String(name).trim()).filter(Boolean).filter((name, index, values) =>
      values.findIndex((candidate) => candidate.toLowerCase() === name.toLowerCase()) === index);
    if (remoteCommandPlayers.some((name) => !/^[A-Za-z0-9_]{1,16}$/u.test(name))) {
      throw new Error('Remote player names may contain only letters, numbers, and underscores.');
    }
    await this.store.setSettings({
      resourcePackPolicy,
      externalPlayerHeadsEnabled: preferences.externalPlayerHeadsEnabled === true,
      remoteCommandsEnabled: preferences.remoteCommandsEnabled === true,
      remoteCommandPlayers
    });
    return { ok: true, preferences: this.preferences() };
  }

  snapshot() {
    return {
      version: packageJson.version,
      state: this.interface.snapshot(),
      accounts: this.store.snapshot().accounts,
      preferences: this.preferences(),
      activities: this.activities.snapshot(),
      commands: this.commands.commands_array.map((command) => ({
        command: command.command,
        aliases: command.aliases || [],
        description: command.description || '',
        usage: command.usage || command.command,
        requiresConnection: Boolean(command.requires?.entity)
      }))
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
