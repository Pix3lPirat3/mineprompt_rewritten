module.exports = {
  command: 'list',
  aliases: ['players', 'online'],
  description: 'List players on the server',
  requiresEntity: true,
  author: 'Pix3lPirat3',
  execute: function(sender, command, args) {
    sender.reply('\n[List] Online Players: ' + Object.keys(bot.players).join(', ') + '\n');
  }
}

// TODO: add 'whois' to print player info