'use strict';

const { startManagedLoop } = require('../../../src/main/managed-loop');

async function attack(bot, actions, activities, entity, overrideFriendProtection, origin) {
  if (entity.type !== 'player' || !entity.username) return bot.attack(entity);
  return actions.execute({ actionId: 'player.attack', username: entity.username, overrideFriendProtection }, { bot, activities, origin });
}

function start(bot, activities, logger, actions, whitelist, delay, overrideFriendProtection, origin) {
  startManagedLoop({
    activities,
    id: 'killaura',
    label: 'Killaura',
    detail: `${whitelist.join(', ')} every ${delay} ms${overrideFriendProtection ? ', friend override' : ''}`,
    resources: ['combat'],
    delay,
    run: async () => {
      if (!bot.entity) return false;
      const entity = bot.nearestEntity((candidate) => {
        const allowed = whitelist.includes('*') || whitelist.includes(candidate.name);
        const player = candidate.type === 'player' ? Object.values(bot.players || {}).find((entry) => entry.entity?.id === candidate.id) : null;
        const protectedFriend = player && actions.isFriend(player, bot) && !overrideFriendProtection;
        return allowed && !protectedFriend && candidate.isValid && bot.entity.position.distanceTo(candidate.position) < 3.5;
      });
      if (!entity || bot.usingHeldItem) return 100;
      await bot.lookAt(entity.position.offset(0, 0.5, 0));
      if (entity.isValid && bot.entityAtCursor()?.id === entity.id) await attack(bot, actions, activities, entity, overrideFriendProtection, origin);
      return delay;
    },
    onError: (error) => logger.debug(`[Killaura] ${error.message}`)
  });
}

module.exports = {
  command: 'killaura',
  usage: 'killaura <start|stop> <mob1,mob2|*> [delay-ms] [--override-friend-protection]',
  description: 'Attack nearby entities matching an explicit allowlist.',
  requires: { entity: true },
  autocomplete: () => ['start', 'stop'],

  execute(sender, command, args, { actions, activities, bot, logger }) {
    const action = args[0]?.toLowerCase();
    if (action === 'stop') {
      activities.stop('killaura');
      return sender.reply('[Killaura] Stopped.');
    }
    if (action !== 'start' || !args[1]) return sender.reply(`[Killaura] Usage: ${this.usage}`);
    const delayValue = args.slice(2).find((value) => value !== '--override-friend-protection');
    const delay = Number(delayValue ?? 1000);
    if (!Number.isInteger(delay) || delay < 100 || delay > 60000) return sender.reply('[Killaura] Delay must be an integer from 100 to 60000 ms.');
    const whitelist = args[1].split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean);
    if (!whitelist.length) return sender.reply('[Killaura] Provide at least one entity name.');
    const overrideFriendProtection = args.includes('--override-friend-protection');
    start(bot, activities, logger, actions, whitelist, delay, overrideFriendProtection, sender);
    return sender.reply(`[Killaura] Started for ${whitelist.join(', ')} at ${delay} ms.`);
  }
};
