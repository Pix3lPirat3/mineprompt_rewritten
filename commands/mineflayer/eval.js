'use strict';

module.exports = {
  command: 'eval',
  aliases: ['js'],
  usage: 'eval <JavaScript>',
  description: 'Run intentionally unsafe JavaScript inside the selected bot process.',
  risk: 'dangerous',
  approval: 'required',
  capability: 'debug',
  requires: { entity: true, console: true },

  async execute(sender, command, args, { debug }) {
    const input = String(sender.input || '').trim();
    const boundary = input.search(/\s/u);
    const code = boundary >= 0 ? input.slice(boundary).trim() : args.join(' ');
    if (!code) return sender.reply(`[Debug] Usage: ${this.usage}`);
    const result = await debug.evaluate({ code });
    return sender.reply(`[Debug] ${result.type}${result.truncated ? ' (truncated)' : ''}\n${result.text}`);
  }
};
