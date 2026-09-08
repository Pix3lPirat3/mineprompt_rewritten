'use strict';

module.exports = {
  command: 'scoreboard',
  usage: 'scoreboard',
  description: 'Print all visible scoreboard lines.',
  requires: { entity: true, console: true },

  execute(sender) {
    const lines = Object.values(bot.scoreboard || {})
      .filter(Boolean)
      .flatMap((scoreboard) => scoreboard.items || [])
      .map((line) => line.displayName?.toString?.() || String(line.name || ''))
      .filter(Boolean);
    return sender.reply(lines.length ? lines.join('\n') : '[Scoreboard] No lines are visible.');
  }
};
