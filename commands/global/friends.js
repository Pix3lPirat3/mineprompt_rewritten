'use strict';

module.exports = {
  command: 'friends',
  aliases: ['friend'],
  usage: 'friends [list|add <name>|remove <name>|check <name>]',
  description: 'Review and manage protected player relationships.',
  category: 'relationships',
  risk: 'dangerous',
  approval: 'required',
  requires: { console: true },

  autocomplete(command, args, { bot, relationships }) {
    if (args.length <= 1) return ['list', 'add', 'remove', 'check'];
    const operation = args[0]?.toLowerCase();
    if (operation === 'remove') return relationships.friendNames();
    if (operation === 'add' || operation === 'check') return Object.keys(bot?.players || {});
    return [];
  },

  async execute(sender, command, args, { relationships }) {
    const operation = args[0]?.toLowerCase() || 'list';
    if (operation === 'list') {
      const friends = relationships.friendNames();
      return sender.reply(`[Friends] ${friends.length ? friends.join(', ') : 'None saved.'}`);
    }
    const username = args[1];
    if (!username) return sender.reply(`[Friends] Usage: ${this.usage}`);
    if (operation === 'add') {
      const relationship = await relationships.add({ kind: 'friend', username });
      return sender.reply(`[Friends] ${relationship.username} is protected.`);
    }
    if (operation === 'remove') {
      const removed = await relationships.remove('friend', username);
      return sender.reply(`[Friends] ${removed ? `${username} is no longer protected.` : `${username} was not saved.`}`);
    }
    if (operation === 'check') {
      return sender.reply(`[Friends] ${username} is ${relationships.isFriend(username) ? '' : 'not '}protected.`);
    }
    return sender.reply(`[Friends] Usage: ${this.usage}`);
  }
};
