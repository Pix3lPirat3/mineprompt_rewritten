'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseCommandLine } = require('./command-line');

function collectJavaScriptFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      if (entry.name.startsWith('.')) return [];
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectJavaScriptFiles(fullPath);
      }
      return entry.isFile() && entry.name.endsWith('.js') ? [fullPath] : [];
    });
}

function levenshtein(left, right) {
  const rows = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = rows[0];
    rows[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const previous = rows[rightIndex];
      rows[rightIndex] = left[leftIndex - 1] === right[rightIndex - 1]
        ? diagonal
        : Math.min(diagonal, rows[rightIndex - 1], rows[rightIndex]) + 1;
      diagonal = previous;
    }
  }
  return rows[right.length];
}

function commandMetadata(file, rootPath, command) {
  const relative = path.relative(path.join(rootPath, 'commands'), file).replaceAll('\\', '/');
  const parts = relative.split('/');
  const category = command.category || (parts[0] === 'global' ? 'application' : parts.length > 2 ? parts[1] : 'general');
  const namedCapabilities = {
    animation: 'movement',
    bed: 'world',
    blockinfo: 'status',
    coinflip: 'status',
    dig: 'world',
    entities: 'status',
    jump: 'movement',
    list: 'status',
    ping: 'status',
    scoreboard: 'status',
    sneak: 'movement',
    useitem: 'inventory'
  };
  const categoryCapabilities = { chat: 'chat', combat: 'combat', inventory: 'inventory', navigation: 'movement', world: 'world' };
  const capability = command.capability || namedCapabilities[command.command] || categoryCapabilities[category] || null;
  return { category, capability };
}

class CommandRegistry {
  constructor({ rootPath, privateCommandsPath, logger, getContext }) {
    this.rootPath = rootPath;
    this.privateCommandsPath = privateCommandsPath;
    this.logger = logger;
    this.getContext = getContext;
    this.commands = Object.create(null);
    this.commands_array = [];
    this.type = 'global';
    this.reply = {
      toTerminal: (message) => this.logger.log(message)
    };
  }

  setCommands(type = 'global') {
    this.type = type;
    const directories = [path.join(this.rootPath, 'commands', 'global')];
    if (this.privateCommandsPath) directories.push(path.join(this.privateCommandsPath, 'global'));
    if (type !== 'global') directories.push(path.join(this.rootPath, 'commands', type));
    if (type !== 'global' && this.privateCommandsPath) directories.push(path.join(this.privateCommandsPath, type));
    const files = directories.flatMap(collectJavaScriptFiles);
    const commands = Object.create(null);
    const aliases = new Set();

    for (const file of files) {
      try {
        delete require.cache[require.resolve(file)];
        const command = require(file);
        if (command.command === 'template') continue;
        this.validate(command, file);
        Object.assign(command, commandMetadata(file, this.rootPath, command));
        const key = command.command.toLowerCase();
        const commandAliases = (command.aliases || []).map((alias) => String(alias).toLowerCase());
        if (commands[key] || aliases.has(key) || commandAliases.some((alias) => commands[alias] || aliases.has(alias))) {
          this.logger.warn(`[Commands] Ignored duplicate command or alias in ${path.relative(this.rootPath, file)}.`);
          continue;
        }
        Object.defineProperty(command, 'path', { value: file, enumerable: false });
        commands[key] = command;
        commandAliases.forEach((alias) => aliases.add(alias));
      } catch (error) {
        this.logger.error(`[Commands] Could not load ${path.relative(this.rootPath, file)}: ${error.message}`);
      }
    }

    this.commands = commands;
    this.commands_array = Object.values(commands);
    this.logger.info(`[Commands] Loaded ${this.commands_array.length} ${type} commands.`);
    return this.commands_array;
  }

  validate(command, file) {
    if (!command || typeof command !== 'object') throw new TypeError('The module must export a command object.');
    if (!/^[a-z][a-z0-9-]*$/iu.test(command.command)) throw new TypeError(`Invalid command name in ${file}.`);
    if (typeof command.execute !== 'function') throw new TypeError(`Command ${command.command} has no execute function.`);
    if (command.description !== undefined && typeof command.description !== 'string') throw new TypeError(`Command ${command.command} has an invalid description.`);
    if (command.usage !== undefined && typeof command.usage !== 'string') throw new TypeError(`Command ${command.command} has invalid usage.`);
    if (command.requires !== undefined && (!command.requires || typeof command.requires !== 'object' || Array.isArray(command.requires))) {
      throw new TypeError(`Command ${command.command} has invalid requirements.`);
    }
    if (command.aliases && (!Array.isArray(command.aliases) || command.aliases.some((alias) => typeof alias !== 'string'))) {
      throw new TypeError(`Command ${command.command} has invalid aliases.`);
    }
  }

  getCommand(name) {
    const target = String(name ?? '').toLowerCase();
    return this.commands[target] || this.commands_array.find((command) =>
      command.aliases?.some((alias) => alias.toLowerCase() === target));
  }

  getCloseMatches(name, maximum = 3) {
    const target = String(name ?? '').toLowerCase();
    return this.commands_array
      .map((command) => ({ name: command.command, distance: levenshtein(target, command.command.toLowerCase()) }))
      .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))
      .slice(0, maximum)
      .map((entry) => entry.name);
  }

  async execute(input, origin = { type: 'terminal' }) {
    let parsed;
    try {
      parsed = parseCommandLine(input);
    } catch (error) {
      this.logger.warn(`[Console] ${error.message}`);
      return { ok: false, error: error.message };
    }
    if (!parsed.name) return { ok: true };

    const command = this.getCommand(parsed.name);
    if (!command) {
      const suggestions = this.getCloseMatches(parsed.name);
      const message = suggestions.length
        ? `[Console] Unknown command. Did you mean: ${suggestions.join(', ')}?`
        : '[Console] Unknown command. Type "help" for help.';
      this.logger.warn(message);
      return { ok: false, error: message };
    }

    const context = this.getContext();
    const { bot } = context;
    if (command.requires?.entity && !bot?.entity) {
      const message = `[${command.command}] This command requires an active connection.`;
      this.logger.warn(message);
      return { ok: false, error: message };
    }
    if (origin.type !== 'terminal' && command.requires?.console) {
      origin.reply?.('This command can only be run from MinePrompt.');
      return { ok: false, error: 'Console-only command.' };
    }
    if (origin.type !== 'terminal' && (!command.capability || !origin.capabilities?.includes(command.capability))) {
      origin.reply?.(`The ${command.command} command is not allowed for your remote access.`);
      return { ok: false, error: 'Remote capability denied.' };
    }

    const sender = {
      ...origin,
      reply: origin.reply || this.reply.toTerminal
    };
    try {
      await command.execute.call(command, sender, parsed.name, parsed.args, context);
      return { ok: true };
    } catch (error) {
      this.logger.error(`[${command.command}] ${error.message}`);
      this.logger.debug(error.stack);
      return { ok: false, error: error.message };
    }
  }

  async complete(input) {
    const raw = String(input ?? '');
    const hasArguments = /\s/u.test(raw.trimStart());
    if (!hasArguments) {
      const prefix = raw.trim().toLowerCase();
      return this.commands_array
        .flatMap((command) => [command.command, ...(command.aliases || [])])
        .filter((name) => name.toLowerCase().startsWith(prefix))
        .sort();
    }

    try {
      const { name, args } = parseCommandLine(raw);
      const command = this.getCommand(name);
      const context = this.getContext();
      if (!command?.autocomplete || (command.requires?.entity && !context.bot?.entity)) return [];
      const values = await command.autocomplete(name, args, context);
      return Array.isArray(values) ? [...new Set(values.map(String))].slice(0, 250) : [];
    } catch {
      return [];
    }
  }

  reload() {
    const current = [...this.commands_array];
    const context = this.getContext();
    for (const command of current) {
      try { command.reload?.pre?.call(command.reload, context); } catch (error) { this.logger.warn(error.message); }
    }
    context.activities.stopAll();
    context.client.reload();
    this.setCommands(this.type);
    for (const command of this.commands_array) {
      try { command.reload?.post?.call(command.reload, this.getContext()); } catch (error) { this.logger.warn(error.message); }
    }
  }
}

module.exports = { CommandRegistry, collectJavaScriptFiles, commandMetadata, levenshtein };
