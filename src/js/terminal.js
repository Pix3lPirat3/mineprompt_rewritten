let commander = require('./js/commander.js');

var log = console.log;
var console = (function() {
  return {
    log: function() {
      var args = Array.from(arguments);
      log.apply(console, args);
      term.echo(args.join(' '));
    },
    warn: function() {
      var args = Array.from(arguments);
      log.apply(console, args);
      term.echo(args.join(' '));
    },
    error: function() {
      var args = Array.from(arguments);
      log.apply(console, args);
    },
    debug: function() {
      var args = Array.from(arguments);
      log.apply(console, args);
    }
  }
}(window.console));

var term = $('#terminal').terminal(async function onCommandSubmit(input) {
  if (input === '') return;
  var command = $.terminal.parse_command(input);
  let cmd = command.name;

  let command_module = commander.getCommand(cmd);

  if (!command_module) {
    // The command was not found, let's see if we can suggest a close match (NOT including aliases - so we don't use the shortcut)
    let close_matches = commander.getCloseMatches(cmd, 3);
    if (!close_matches?.length) return console.log(i18n.__('commander.unknown_command')); // [Console] Unknown command. Type "help" for help.
    return console.log(i18n.__('commander.suggest_commands', { suggestions: close_matches.join(', ') })); // [Console] Did you mean: ${close_matches.join(', ')}
  }

  if (!bot && command_module.requires?.entity) return console.log(i18n.__('commander.requires_entity', { command: command_module.command }));

  var command = $.terminal.parse_command(input);

  command_module.execute({type: 'terminal', reply: commander.reply.toTerminal}, cmd, command.args);

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
      resolve([]);
    });
  },
  keymap: {
    "CTRL+R": function() {
      commander.reload();
      return false;
    }
  },
  onInit: function() {
    term = this;
    commander.setCommands('global');
  },
  exit: false,
  autocompleteMenu: true,
  greetings: i18n.__('interface.greetings'),
  name: 'mineprompt',
  prompt: `${i18n.__('interface.console.prompt')} » `
});