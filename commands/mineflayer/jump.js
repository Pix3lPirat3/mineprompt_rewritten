module.exports = {
  command: 'jump',
  description: 'Have the bot jump.',
  requiresEntity: true,
  author: 'Pix3lPirat3',
  execute: function(sender, command, args) {
    bot.setControlState('jump', true);
    bot.setControlState('jump', false)
  }
}