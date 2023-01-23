module.exports = {
  command: 'jump',
  usage: 'jump',
  description: 'Have the bot jump.',
  requires: {
    entity: true
  },
  author: 'Pix3lPirat3',
  execute: function(sender, command, args) {
    bot.setControlState('jump', true);
    bot.setControlState('jump', false)
  }
}