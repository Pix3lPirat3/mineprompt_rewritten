'use strict';

module.exports = {
  command: 'coinflip',
  usage: 'coinflip',
  description: 'Flip a virtual coin.',
  requires: { entity: true },

  execute(sender, command, args) {
    if (args.length) return sender.reply(`[CoinFlip] Usage: ${this.usage}`);
    const face = Math.random() < 0.5 ? 'heads' : 'tails';
    return sender.reply(`[CoinFlip] ${face[0].toUpperCase()}${face.slice(1)}.`);
  }
};
