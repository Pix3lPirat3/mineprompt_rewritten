module.exports = {
  command: 'disconnect',
  usage: 'disconnect',
  description: 'Gracefully disconnect from the server.',
  requiresEntity: true,
  execute: function(sender, command, args) {
    sender.reply('[Quit] Now exiting the server..')
    bot.end();
  }
}