let glob = require('glob');
let path = require('path');
global.appRoot = path.resolve(__dirname + '/../../');

module.exports = {
  commands_array: null,
  commands: {

  },
  reply: {
    toTerminal: function(arguments) {
      term.echo(arguments)
    },
    toPlayer: function(arguments) {
      bot.chat(arguments)
    }
  },
  setCommands: function(type) {
    let commander = this;
    commander.commands = {}
    let files = glob.sync(path.join(global.appRoot, `/commands/${type}/**/*.js`).replace(/\\/g, '/'));
    files = files.concat(glob.sync(path.join(global.appRoot, `/commands/global/**/*.js`).replace(/\\/g, '/')));

    for (var a = 0; a < files.length; a++) {
      let file = files[a]
        // Delete the cached files, so all code is force-updated
      delete require.cache[require.resolve(file)];

      let command = null;
      try {
        command = require(file);
      } catch (e) {
        console.log(e)
        continue;
      }

      // Check if a command is already registered with the 'command' field
      let duplicate = commander.commands[command.command];
      if (duplicate) {
        console.log(`[Warning] Duplicate command registered ("${command.command}")`)
        console.log(`    Registered ${path.basename(duplicate.path)}, Ignored: ${path.basename(file)}`)
        continue;
      }
      commander.commands[command.command] = command;
      commander.commands[command.command].path = file; // Let's register a `path` field on the command object, so we can see where duplicates are

      // Settings Manager
      /*
      category: 'Inventory',
      setting: 'inventory-drop-',
      default_value: 5,
      dropdown: true,
      dropdown_options: [{ name: '', value: ''}, { name: '', value: ''}]
      type: 'dropdown', // text, number, select (dropdown)

      // text/textbox - button, checkbox, color, date, datetime-local, email, file, hidden, image, month, number, password, radio, range, reset, search, submit, tel, text, time, url, week
      input_type: 'checkbox,' // Add button support?
      min: 1
      max: 10,
      onChange: function() {
    
      }
      }
      */
      if (command.settings) {
        // Or perhaps just a `settings` cmd `settings.{CMD}.{OPTION} {VALUE}` , then a parseSettings function for {option} and {value}..? or a parseSettings with {option} as key
        /*
        settings: {
          searchRadius: {
            type: 'Number',
            validate: function(input) {

            }
          }
        }
        */
      }

    }
    commander.commands_array = Object.values(commander.commands)
    console.log(`[Debug] Loaded ${commander.commands_array.length} commands..`)
  },
  getCommand: function(cmdOrAlias) {
    return commander.commands_array.find(c => c.command === cmdOrAlias || c?.aliases?.includes(cmdOrAlias));
  },
  getCloseMatches: function(cmd, max_matches) {
    let commands_array = Object.values(commander.commands).map(c => c.command); // ['connect', 'exit', 'inventory'] 
    if (!commands_array.length) return console.log(`[Console] There were no commands loaded, check your commands.`); // The commands lib was empty, do nothing.
    let close_ratings = stringSimilarity.findBestMatch(cmd, commands_array); // Match the closest match to `string` in `arr(ay)` (Returns Object)

    let close_matches = close_ratings.ratings.sort((a, b) => b.rating - a.rating);
    return close_matches.slice(0, max_matches).map(m => m.target);
  },
  reload: function() {
    console.log('[Console] Now reloading the client..')
      // Yes we're just calling the original function, however let's keep commander.reload seperate just incase..
    this.setCommands('mineflayer')
  },
  printHelp: function(targetCommand) {
    targetCommand = targetCommand?.toLowerCase();
    // Show specific command info
    if (targetCommand) {
      let command = commander.commands_array.find(cmd => cmd.command === targetCommand || cmd?.aliases?.includes(targetCommand));
      if (!command) return console.log(`There is no command matching "${targetCommand}"`)
      return console.log(
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

    let system_commands = commands_array.filter(cmd => !cmd.requires?.entity).map(cmd => ({ command: cmd.command, description: cmd.description || 'This command does not have a description..' })).sort((a, b) => a.command > b.command)
    console.log(`\nSystem Commands:\n` + stringTable.create(system_commands) + '\n')

    let player_commands = commands_array.filter(cmd => cmd.requires?.entity).map(cmd => ({ command: cmd.command, description: cmd.description || 'This command does not have a description..' })).sort((a, b) => a.command > b.command)
    console.log(`\nPlayer Commands:\n` + stringTable.create(player_commands) + '\n')
  }

};