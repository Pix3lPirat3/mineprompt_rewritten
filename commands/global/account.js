'use strict';

module.exports = {
  command: 'account',
  aliases: ['accounts'],
  usage: 'account <add|remove|list> [username] [microsoft|offline]',
  description: 'Manage saved account profiles.',
  requires: { console: true },

  async execute(sender, command, args, { store }) {
    const action = args[0]?.toLowerCase();
    if (!action) return sender.reply(`[Account] Usage: ${this.usage}`);

    if (action === 'list') {
      const accounts = await store.getAccounts();
      if (!accounts.length) return sender.reply('[Account] No profiles are saved.');
      return sender.reply(accounts.map((account) => `- ${account.username} (${account.authentication ? 'microsoft' : 'offline'})`).join('\n'));
    }

    const username = args[1]?.trim();
    if (!username) return sender.reply(`[Account] A username is required. Usage: ${this.usage}`);

    if (action === 'add') {
      const mode = args[2]?.toLowerCase();
      if (!['microsoft', 'offline', 'true', 'false'].includes(mode)) {
        return sender.reply('[Account] Authentication must be "microsoft" or "offline".');
      }
      const added = await store.addAccount(username, mode === 'microsoft' || mode === 'true');
      return sender.reply(added ? `[Account] Saved ${username}.` : `[Account] ${username} is already saved.`);
    }

    if (action === 'remove') {
      const removed = await store.removeAccount(username);
      return sender.reply(removed ? `[Account] Removed ${username}.` : `[Account] ${username} was not found.`);
    }

    return sender.reply(`[Account] Unknown action "${action}". Usage: ${this.usage}`);
  }
};
