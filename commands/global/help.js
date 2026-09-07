'use strict';

const { createTextTable } = require('../../src/main/text-table');

module.exports = {
  command: 'help',
  usage: 'help [command]',
  description: 'Show available commands or details for one command.',
  requires: { console: true },
  autocomplete: () => commander.commands_array.flatMap((entry) => [entry.command, ...(entry.aliases || [])]),

  execute(sender, command, args) {
    const requested = args[0];
    if (requested) {
      const target = commander.getCommand(requested);
      if (!target) return sender.reply(`[Help] No command matches "${requested}".`);
      return sender.reply([
        `${target.command}${target.aliases?.length ? ` (${target.aliases.join(', ')})` : ''}`,
        target.description || 'No description available.',
        `Usage: ${target.usage || target.command}`,
        `Connection required: ${target.requires?.entity ? 'yes' : 'no'}`,
        `Terminal only: ${target.requires?.console ? 'yes' : 'no'}`
      ].join('\n'));
    }

    const rows = commander.commands_array
      .map((entry) => ({
        command: entry.command,
        usage: entry.usage || entry.command,
        description: entry.description || ''
      }))
      .sort((a, b) => a.command.localeCompare(b.command));
    sender.reply(`${createTextTable(rows)}\n\nUse "help <command>" for details.`);
  }
};
