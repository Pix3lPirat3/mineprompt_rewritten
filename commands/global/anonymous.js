'use strict';

module.exports = {
  command: 'anonymous',
  usage: 'anonymous [on [alias] | off | toggle]',
  description: 'Hide the connected account name in the MinePrompt interface.',
  requires: { console: true },
  autocomplete: () => ['on', 'off', 'toggle'],

  execute(sender, command, args) {
    const action = args[0]?.toLowerCase() || 'toggle';
    if (action === 'toggle') {
      if (args.length > 1) return sender.reply(`[Privacy] Usage: ${this.usage}`);
      globalThis.interface.anonymous.toggle();
      return;
    }
    if (action === 'on' || action === 'enable') {
      globalThis.interface.anonymous.enable(args.slice(1).join(' ') || undefined);
      return;
    }
    if (action === 'off' || action === 'disable') {
      if (args.length > 1) return sender.reply(`[Privacy] Usage: ${this.usage}`);
      globalThis.interface.anonymous.disable();
      return;
    }
    if (args.length === 1) {
      globalThis.interface.anonymous.enable(args[0]);
      return;
    }
    return sender.reply(`[Privacy] Usage: ${this.usage}`);
  }
};
