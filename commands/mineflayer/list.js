'use strict';

module.exports = {
  command: 'list',
  usage: 'list',
  aliases: ['players', 'online'],
  description: 'List players in the server tab list.',
  requires: { entity: true },

  execute(sender, command, args, { bot }) {
    if (args.length) return sender.reply(`[Players] Usage: ${this.usage}`);
    const players = Object.values(bot.players)
      .map((player) => player.username)
      .filter(Boolean)
      .toSorted((left, right) => left.localeCompare(right));
    return sender.reply(`[Players] ${players.length ? players.join(', ') : 'No players are listed.'}`);
  }
};
