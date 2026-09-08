'use strict';

function remainingDurability(item, bot) {
  const maximum = bot.registry.itemsByName[item.name]?.maxDurability;
  if (!maximum) return Number.POSITIVE_INFINITY;
  const damage = bot.registry.version['<']('1.13')
    ? item.metadata || 0
    : item.nbt?.value?.Damage?.value || 0;
  return maximum - damage;
}

function start(bot, activities, logger, reply) {
  let running = true;
  let timer = null;
  const stop = () => {
    running = false;
    if (timer) clearTimeout(timer);
  };
  const tick = async () => {
    if (!running || !bot.entity) return activities.stop('consistentmine');
    try {
      const block = bot.blockAtCursor(4);
      if (block) {
        const pickaxe = bot.inventory.items().find((item) => item.name.includes('pickaxe') && remainingDurability(item, bot) > 10);
        if (!pickaxe) {
          activities.stop('consistentmine');
          return reply('[ConsistentMine] Stopped because no safe pickaxe is available.');
        }
        if (bot.heldItem?.slot !== pickaxe.slot) await bot.equip(pickaxe, 'hand');
        await bot.dig(block, 'ignore', 'raycast');
      }
    } catch (error) {
      logger.warn(`[ConsistentMine] ${error.message}`);
    }
    if (running) timer = setTimeout(tick, 100);
  };
  activities.register('consistentmine', {
    label: 'Consistent mine',
    detail: 'Protecting tools below 11 durability',
    stop
  });
  timer = setTimeout(tick, 0);
}

module.exports = {
  command: 'consistentmine',
  usage: 'consistentmine <start|stop>',
  description: 'Repeatedly mine the block under the cursor while preserving tools.',
  requires: { entity: true },
  autocomplete: () => ['start', 'stop'],

  execute(sender, command, args, { activities, bot, logger }) {
    const action = args[0]?.toLowerCase();
    if (action === 'stop') {
      activities.stop('consistentmine');
      return sender.reply('[ConsistentMine] Stopped.');
    }
    if (action !== 'start') return sender.reply(`[ConsistentMine] Usage: ${this.usage}`);
    if (activities.has('consistentmine')) return sender.reply('[ConsistentMine] Already running.');
    start(bot, activities, logger, sender.reply);
    return sender.reply('[ConsistentMine] Started. Tools with 10 or fewer durability points will not be used.');
  }
};
