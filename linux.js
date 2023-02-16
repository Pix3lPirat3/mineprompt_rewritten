var stringSimilarity = require("string-similarity");
let commander = require('./src/js/commander.js');
commander.setCommands(__dirname + '/commands/mineflayer')

var readline = require('readline'),
    rl = readline.createInterface(process.stdin, process.stdout);

rl.setPrompt('console-client » ');
rl.prompt();

rl.on('line', function(line) {
    line = line.trim();

    const args = line.trim().split(/ +/g);
    const command = args.shift().toLowerCase();

    let command_module = getCommand(command);
    if(!command_module) return console.log('Unknown command. Type "help" for help.');

    command_module.execute(true, command, args)

    rl.prompt();
}).on('close', function() {
    console.log('LINUX - Goodbye!');
    process.exit(0);
});

function getCommand(input) {
    return Object.values(commander.commands).find(command => command.command === input)
}

function executeCommand(input) {

    const args = line.trim().split(/ +/g);
    const cmd = args.shift().toLowerCase();

      if (input === '') return;

      let command_module = Object.values(commander.commands).find(c => c.command === cmd || c?.aliases?.includes(cmd));
      if (!command_module) {
        // The command was not found, let's see if we can suggest a close match (NOT including aliases - so we don't use the shortcut)
        let commands_array = Object.values(commander.commands).map(c => c.command); // ['connect', 'exit', 'inventory'] 
        if (!commands_array.length) return console.log(`[Console] There were no commands loaded, check your commands.`); // The commands lib was empty, do nothing.
        let close_ratings = stringSimilarity.findBestMatch(cmd, commands_array); // Match the closest match to `string` in `arr(ay)` (Returns Object)

        let close_matches = close_ratings.ratings.sort((a, b) => b.rating - a.rating);
        let option_show_matches_max = 3; // Option to show the max number of close_matches
        if (close_matches.length) return console.log(`[Console] Did you mean: ${close_matches.slice(0, option_show_matches_max).map(m => m.target).join(', ')}`)

        if (!close_match) return console.log('[Console] Unknown command. Type "help" for help.');
        console.log(closest_match)
        console.log(`[Console] Did you mean: ${closest_match}`)
      }

      if (!bot && command_module.requiresEntity) return console.log(`[${command_module.command}] This command requires the bot to be spawned.`)
        // Passed Checks : Execute Command

      // sender, command, args
      var command = $.terminal.parse_command(input)
      command_module.execute(true, cmd, command.args)


    }
