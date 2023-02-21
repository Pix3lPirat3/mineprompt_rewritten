module.exports = {
  command: 'list',
  usage: 'list',
  aliases: ['players', 'online'],
  description: 'List players on the server',
  requires: {
    entity: true
  },
  author: 'Pix3lPirat3',
  execute: function(sender, command, args) {
    sender.reply('\n[List] Online Players: ' + Object.keys(bot.players).join(', ') + '\n');
  }
}