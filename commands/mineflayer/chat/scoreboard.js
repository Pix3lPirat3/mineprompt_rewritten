module.exports = {
  command: 'scoreboard',
  usage: 'scoreboard',
  description: 'Prints the scoreboard to the console.',
  requires: {
    entity: true
  },
  author: 'Pix3lPirat3',
  execute: function(sender, command, args) {
    Object.values(bot.scoreboard).filter(i => i !== undefined).forEach(function(scoreboard) {
        scoreboard.items.forEach(function(line) {
            console.terminal(line.displayName.toAnsi())
            console.debug(line.displayName.toString())
        });
    });
  }
}