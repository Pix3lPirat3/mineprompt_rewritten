'use strict';

const state = { running: false, timer: null };

function stop() {
  state.running = false;
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
}

function remainingDurability(item) {
  const maximum = bot.registry.itemsByName[item.name]?.maxDurability;
  if (!maximum) return Number.POSITIVE_INFINITY;
  const damage = bot.registry.version['<']('1.13')
    ? item.metadata || 0
    : item.nbt?.value?.Damage?.value || 0;
  return maximum - damage;
}

module.exports = {
  command: 'consistentmine',
  usage: 'consistentmine <start|stop>',
  description: 'Repeatedly mine the block under the cursor while preserving tools.',
  requires: { entity: true },
  autocomplete: () => ['start', 'stop'],
  reload: { pre: stop },

  execute(sender, command, args) {
    const action = args[0]?.toLowerCase();
    if (action === 'stop') {
      stop();
      return sender.reply('[ConsistentMine] Stopped.');
    }
    if (action !== 'start') return sender.reply(`[ConsistentMine] Usage: ${this.usage}`);
    if (state.running) return sender.reply('[ConsistentMine] Already running.');

    state.running = true;
    sender.reply('[ConsistentMine] Started. Tools with 10 or fewer durability points will not be used.');
    const tick = async () => {
      if (!state.running || !bot?.entity) return stop();
      try {
        const block = bot.blockAtCursor(4);
        if (block) {
          const pickaxe = bot.inventory.items().find((item) => item.name.includes('pickaxe') && remainingDurability(item) > 10);
          if (!pickaxe) {
            stop();
            return sender.reply('[ConsistentMine] Stopped because no safe pickaxe is available.');
          }
          if (bot.heldItem?.slot !== pickaxe.slot) await bot.equip(pickaxe, 'hand');
          await bot.dig(block, 'ignore', 'raycast');
        }
      } catch (error) {
        console.warn(`[ConsistentMine] ${error.message}`);
      }
      if (state.running) state.timer = setTimeout(tick, 100);
    };
    state.timer = setTimeout(tick, 0);
  }
};
