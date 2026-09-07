module.exports = {
  command: 'jump',
  usage: 'jump',
  description: 'Have the bot jump.',
  requires: {
    entity: true
  },
  author: 'Pix3lPirat3',
  execute: async function(sender, command, args) {
    bot.setControlState('jump', true);
    await bot.waitForTicks(1);
    bot.setControlState('jump', false);
    return sender.reply('[Jump] Jumped.');
  }
}
