'use strict';

const ACTION_NAMES = Object.freeze({
  inspect: 'player.inspect',
  follow: 'player.follow',
  goto: 'player.goto',
  look: 'player.look',
  message: 'player.message',
  attack: 'player.attack'
});

module.exports = {
  command: 'player',
  usage: 'player <name> [actions|inspect|follow|goto|look|message <text>|attack [--override-friend-protection]]',
  description: 'Inspect or interact with an online player through shared player actions.',
  requires: { entity: true },

  autocomplete(command, args, { bot, actions }) {
    if (args.length <= 1) return Object.keys(bot.players || {});
    if (args.length === 2) {
      const player = Object.values(bot.players || {}).find((entry) => entry.username?.toLowerCase() === args[0].toLowerCase());
      if (!player) return [];
      const available = actions.describe(bot, player.username).filter((action) => action.enabled || action.overrideAllowed);
      return ['actions', ...Object.entries(ACTION_NAMES).filter(([, id]) => available.some((action) => action.id === id)).map(([name]) => name)];
    }
    if (args.length === 3 && args[1]?.toLowerCase() === 'attack') return ['--override-friend-protection'];
    return [];
  },

  async execute(sender, command, args, { actions, bot, dispatchPlayerAction }) {
    if (!args[0]) return sender.reply(`[Player] Usage: ${this.usage}`);
    const username = Object.values(bot.players || {}).find((entry) => entry.username?.toLowerCase() === args[0].toLowerCase())?.username;
    if (!username) return sender.reply(`[Player] ${args[0]} is not online.`);
    const actionName = args[1]?.toLowerCase() || 'actions';
    if (actionName === 'actions') {
      const available = actions.describe(bot, username);
      return sender.reply(available.map((action) => `${action.label}: ${action.enabled ? 'available' : action.reason}`).join('\n'));
    }
    const actionId = ACTION_NAMES[actionName];
    if (!actionId) return sender.reply(`[Player] Usage: ${this.usage}`);
    const overrideFriendProtection = actionName === 'attack' && args.slice(2).includes('--override-friend-protection');
    const message = actionName === 'message' ? args.slice(2).join(' ') : undefined;
    const result = await dispatchPlayerAction({ actionId, username, message, overrideFriendProtection }, sender);
    return sender.reply(result.message);
  }
};
