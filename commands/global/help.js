let stringTable = require('string-table')

module.exports = {
  command: 'help',
  usage: 'help [command]',
  description: 'Shows the help menu.',
  author: 'Pix3lPirat3',
  requires: {
    console: true
  },
  autocomplete: function(command, args) {
    // Return an Array of commands and aliases
    return Object.values(commander.commands).map(c => [c.command, c.aliases]).flat(2).filter(e => e !== undefined);
  },
  execute: function(sender, command, args) {
    if(sender.type === 'player') return sender.reply(i18n.__('commands.help.console_only'));
    let targetCommand = args[0]?.toLowerCase();
    // Show specific command info
    if (targetCommand) {
      let command = commander.commands_array.find(cmd => cmd.command === targetCommand || cmd?.aliases?.includes(targetCommand));
      if (!command) return sender.reply(i18n.__('commands.help.unknown_command'))
      return sender.reply(i18n.__('commands.help.command', { command: command }))
    }

    // System/Console Commands, Player Commands

    let max_usage_length = 60;

    let system_commands = commander.commands_array.filter(cmd => !cmd.requires?.entity).map(cmd => ({ command: cmd.command, usage: cmd.usage?.substring(0, max_usage_length), description: cmd.description || 'This command does not have a description..' })).sort((a, b) => a.command.localeCompare(b.command))
    sender.reply(i18n.__('commands.help.system_commands', { table: stringTable.create(system_commands) }))
    
    let player_commands = commander.commands_array.filter(cmd => cmd.requires?.entity).map(cmd => ({ command: cmd.command, usage: cmd.usage?.substring(0, max_usage_length), description: cmd.description || 'This command does not have a description..' })).sort((a, b) => a.command.localeCompare(b.command))
    sender.reply(i18n.__('commands.help.player_commands', { table: stringTable.create(player_commands) }))

    sender.reply(`> Get a specific command's details by running "help <command>"`)
  }
}