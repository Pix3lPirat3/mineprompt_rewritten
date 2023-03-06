let glob = require('glob');
let path = require('path');
let stringSimilarity = require('string-similarity')
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
    let files = [];
    files = files.concat(glob.sync(path.join(global.appRoot, `/commands/global/**/*.js`).replace(/\\/g, '/'), { cache: false }));
    if (type !== 'global') files = files.concat(glob.sync(path.join(global.appRoot, `/commands/${type}/**/*.js`).replace(/\\/g, '/'), { cache: false }));

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
        console.log(i18n.__('commander.duplicate', { command: command.command, registered: path.basename(duplicate.path), ignored: path.basename(file) }))
        continue;
      }
      commander.commands[command.command] = command;
      commander.commands[command.command].path = file; // Let's register a `path` field on the command object, so we can see where duplicates are

    }
    commander.commands_array = Object.values(commander.commands)
    console.debug(i18n.__('commander.commands_loaded', { type: type, amount: commander.commands_array.length }))
  },
  loadCommand: function() { // by name AND path ? for in-line and back-end usage

  },
  unloadCommand: function() {

  },
  reloadCommand: function() {

  },
  getCommand: function(cmdOrAlias) {
    return commander.commands_array.find(c => c.command === cmdOrAlias || c?.aliases?.includes(cmdOrAlias));
  },
  getCloseMatches: function(cmd, max_matches) {
    let commands_array = Object.values(commander.commands).map(c => c.command); // ['connect', 'exit', 'inventory'] 
    if (!commands_array?.length) return []; // The commands lib was empty, do nothing.
    let close_ratings = stringSimilarity.findBestMatch(cmd, commands_array); // Match the closest match to `string` in `arr(ay)` (Returns Object)

    let close_matches = close_ratings.ratings.sort((a, b) => b.rating - a.rating);
    return close_matches.slice(0, max_matches).map(m => m.target);
  },
  reload: function() {
    mineflayer.reload();
    console.log(i18n.__('commander.reloading', { commands: commander.commands_array.length }))

    commander.commands_array.forEach(cmd => cmd?.reload?.pre?.())

    // TODO : WARNING : May have to await setCommands somehow to wait for commands to fully complete
    this.setCommands('mineflayer')

    commander.commands_array.forEach(cmd => cmd?.reload?.post?.())

    console.log(i18n.__('commander.reloaded', { commands: commander.commands_array.length }))

  }

};