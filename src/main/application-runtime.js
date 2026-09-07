'use strict';

const path = require('node:path');
const packageJson = require('../../package.json');
const { Store } = require('./store');
const { RuntimeLogger } = require('./logger');
const { InterfaceState } = require('./interface-state');
const { CommandRegistry } = require('./command-registry');
const { MineflayerClient } = require('./mineflayer-client');

class ApplicationRuntime {
  constructor({ rootPath, userDataPath, emit }) {
    this.rootPath = rootPath;
    this.emit = emit;
    this.logger = new RuntimeLogger(emit);
    this.interface = new InterfaceState(emit, this.logger);
    this.store = new Store(path.join(userDataPath, 'mineprompt.json'), () => this.publishSnapshot());
    this.client = new MineflayerClient({
      logger: this.logger,
      interfaceState: this.interface,
      store: this.store,
      getCommands: () => this.commands
    });
    this.commands = new CommandRegistry({
      rootPath,
      logger: this.logger,
      getBot: () => this.client.bot,
      getClient: () => this.client
    });
    this.originalConsole = global.console;
  }

  async init() {
    await this.store.init();
    this.installCommandEnvironment();
    this.commands.setCommands('global');
    this.logger.log(`MinePrompt ${packageJson.version} is ready. Type "help" to see available commands.`);
    this.publishSnapshot();
    return this;
  }

  installCommandEnvironment() {
    const define = (name, getter, setter) => Object.defineProperty(global, name, {
      configurable: true,
      enumerable: false,
      get: getter,
      set: setter
    });

    global.console = this.logger.facade();
    global.appRoot = this.rootPath;
    define('bot', () => this.client.bot, (value) => { this.client.bot = value; });
    define('ChatMessage', () => this.client.chatMessageClass);
    define('database', () => this.store);
    define('interface', () => this.interface);
    define('mineflayer', () => this.client);
    define('commander', () => this.commands);
    define('term', () => ({ exec: (input) => this.execute(input) }));
  }

  async execute(input) {
    return this.commands.execute(input, { type: 'terminal' });
  }

  async complete(input) {
    return this.commands.complete(input);
  }

  async reloadCommands() {
    this.commands.reload();
    this.publishSnapshot();
    return { ok: true };
  }

  snapshot() {
    return {
      version: packageJson.version,
      state: this.interface.snapshot(),
      accounts: this.store.snapshot().accounts,
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
    await this.client.close();
    await this.store.close();
    global.console = this.originalConsole;
  }
}

module.exports = { ApplicationRuntime };
