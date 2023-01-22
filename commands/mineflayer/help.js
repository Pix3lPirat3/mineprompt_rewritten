let stringTable = require('string-table')

module.exports = {
  command: 'help',
  description: 'Shows the help menu.',
  requiresEntity: false,
  autocomplete: function(command, args, cursor) {
    // Return an Array of commands and aliases
    return Object.values(commander.commands).map(c => [c.command, c.aliases]).flat(2).filter(e => e !== undefined);
  },
  execute: function(sender, command, args) {
    if(sender.type === 'player') return sender.reply(`[Help] This command must be run from console.`);
    let targetCommand = args[0]?.toLowerCase();
    // Show specific command info
    if (targetCommand) {
      let command = commander.commands_array.find(cmd => cmd.command === targetCommand || cmd?.aliases?.includes(targetCommand));
      if (!command) return sender.reply(`There is no command matching "${targetCommand}"`)
      return sender.reply(
        `
Command ${command.command}
Version: ${command.version || '~'}
Author: ${command.author || '~'}
Repository: ${command.repository || '~'}
Aliases: ${command.aliases || '~'}
Description: ${command.description || 'There is no description for this command..'}
Usage: ${command.usage || '~'}

`)
    }

    // System/Console Commands, Player Commands

    let system_commands = commander.commands_array.filter(cmd => !cmd.requiresEntity).map(cmd => ({ command: cmd.command, description: cmd.description || 'This command does not have a description..' })).sort((a, b) => a.command > b.command)
    let system_commands_string = `\nSystem Commands:\n` + stringTable.create(system_commands) + '\n';
    if(sender.type === 'discord') system_commands_string = '```' + system_commands_string + '```';
    sender.reply(system_commands_string)

    let player_commands = commander.commands_array.filter(cmd => cmd.requiresEntity).map(cmd => ({ command: cmd.command, description: cmd.description || 'This command does not have a description..' })).sort((a, b) => a.command > b.command)
    let player_commands_string = `\nPlayer Commands:\n` + stringTable.create(player_commands) + '\n'
    if(sender.type === 'discord') player_commands_string = '```' + player_commands_string + '```';
    sender.reply(player_commands_string)
  }
}