'use strict';

module.exports = {
  command: 'useitem',
  aliases: ['activateitem'],
  usage: 'useitem [mainhand|offhand]',
  description: 'Use the item in the selected hand.',
  requires: { entity: true },
  autocomplete: () => ['mainhand', 'offhand'],

  execute(sender, command, args, { bot }) {
    if (args.length > 1 || (args[0] && !['mainhand', 'offhand'].includes(args[0].toLowerCase()))) {
      return sender.reply(`[UseItem] Usage: ${this.usage}`);
    }
    const offhand = args[0]?.toLowerCase() === 'offhand';
    bot.activateItem(offhand);
    return sender.reply(`[UseItem] Activated the ${offhand ? 'off hand' : 'main hand'}.`);
  }
};
