module.exports = {
  command: 'disconnect',
  usage: 'disconnect',
  description: 'Gracefully disconnect from the server.',
  requires: {
    entity: true
  },
  execute: function(sender, command, args) {
    sender.reply('[Quit] Now exiting the server..')
    bot.end();
  }
}