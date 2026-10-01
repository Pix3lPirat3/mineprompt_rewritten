'use strict';

module.exports = {
  command: 'ping',
  usage: 'ping [player]',
  description: 'Show a player latency from the server tab list.',
  requires: { entity: true },
  autocomplete: (command, args, { bot }) => Object.keys(bot.players),

  execute(sender, command, args, { bot }) {
    if (args.length > 1) return sender.reply(`[Ping] Usage: ${this.usage}`);
    const requested = args[0] || bot.username;
    const target = Object.values(bot.players).find((player) => player.username?.toLowerCase() === requested.toLowerCase());
    if (!target) return sender.reply(`[Ping] ${requested} is not in the tab list.`);
    const latency = Number.isFinite(target.ping) && target.ping >= 0 ? `${target.ping} ms` : 'unavailable';
    return sender.reply(`[Ping] ${target.username}: ${latency}.`);
  }
};
