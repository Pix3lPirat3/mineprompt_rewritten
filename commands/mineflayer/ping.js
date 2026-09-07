module.exports = {
  command: 'ping',
  usage: 'ping [player]',
  description: 'Gets the player\'s ping according to the tablist.',
  requires: {
    entity: true
  },
  author: 'Pix3lPirat3',
  autocomplete: () => Object.keys(bot.players),
  execute: function(sender, command, args) {
    const requested = args[0] || bot.username;
    const target = Object.values(bot.players).find((player) => player.username?.toLowerCase() === requested.toLowerCase());
    if (!target) return sender.reply(`[Ping] ${requested} is not in the tab list.`);
    return sender.reply(`[Ping] ${target.username}: ${target.ping} ms.`)
  }
}
