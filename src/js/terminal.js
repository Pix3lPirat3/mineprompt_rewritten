const parseSentence = require('minimist-string');
var stringSimilarity = require("string-similarity");
let commander = require('./js/commander.js');
commander.setCommands('mineflayer');

// define a new console (PRODUCTION?)
let log_old = console;

var console = (function(arguments) {
  return {
    log: function(arguments) {
      log_old.log(arguments)
      term.echo(arguments);
      // Your code
    },
    info: function(arguments) {
      log_old.log(arguments)
      term.echo(arguments);
      // Your code
    },
    warn: function(arguments) {
      log_old.log(arguments)
      term.echo(arguments);
      // Your code
    },
    error: function(arguments) {
      log_old.log(arguments)
      term.echo(arguments);
      // Your code
    }
  };
}(window.console));

//Then redefine the old console
window.console = console;

/*
let commander = {
  commands: null, // Stored as an Object, with keys being the command name, and values being options { 'connect': { args: [], options: [] } }
}
*/

// TODO : Use Array.prototype.some() to get 'Closest Result'

var term = $('#terminal').terminal(async function onCommandSubmit(input) {
  if (input === '') return;
  var command = $.terminal.parse_command(input)
  let cmd = command.name;

  let command_module = commander.getCommand(cmd);

  if (!command_module) {
    // The command was not found, let's see if we can suggest a close match (NOT including aliases - so we don't use the shortcut)
    let close_matches = commander.getCloseMatches(cmd, 3);
    if (!close_matches.length) return console.log('[Console] Unknown command. Type "help" for help.');
    return console.log(`[Console] Did you mean: ${close_matches.join(', ')}`)
  }

  if (!bot && command_module.requires?.entity) return console.log(`[${command_module.command}] This command requires the bot to be spawned.`)
    // Passed Checks : Execute Command
  // sender, command, args
  var command = $.terminal.parse_command(input)

  command_module.execute({type: 'terminal', reply: commander.reply.toTerminal}, cmd, command.args)

}, {
  completion: function() {
    var term = this;
    // return promise if completion need to be asynnc
    // in this example it's not needed, you can just retrun an array
    return new Promise(async function(resolve) {
      var command = term.get_command(); // command line input
      var cmd = command.match(/^([^\s]*)/)[0]; // Grab the first word
      let command_module = commander.commands_array.find(c => c.command === cmd || c?.aliases?.includes(cmd));

      // On the first word, if there's no matching modules - then return the list of all commands & aliases
      if (!command_module) return resolve(commander.commands_array.map(c => [c.command, c.aliases]).flat(2).filter(e => e !== undefined));
      if (command_module.requires?.entity && !bot) return; // If bot is required, and no bot is found, don't do anything
      if (!command.match(/\s/)) return resolve([]); // There is a command, but no space - don't generate a list yet
      var cursor = term.before_cursor(true); // Grab the word the user is actively typing
      if (!cursor) return resolve([]); // It's just a space

      if (command_module.autocomplete) {
        let parsed_command = $.terminal.parse_command(command);
        let autocomplete = await command_module.autocomplete(true, parsed_command.command, parsed_command)
        resolve(autocomplete)
      }

      //if (bot !== null && bot?.players) list = list.concat(Object.keys(bot?.players)) // Add player names to autocomplete

      resolve([])
    });
  },
  keymap: {
    "CTRL+R": function() {
      commander.reload();
      // TODO : Optional 'startClient(bot.lastOptions)' when pressing CTRL + R (Ask for confirmation, 5s delay due to Bukkit's connection-delay)
      return false;
    }
  },
  autocompleteMenu: true,
  greetings: `
Console Client v1.0.0
  `,
  name: 'Mineflayer Console Client',
  prompt: 'Console » '
});