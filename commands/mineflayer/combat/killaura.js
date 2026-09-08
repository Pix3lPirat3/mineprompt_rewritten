'use strict';

const state = {
  timer: null,
  running: false,
  whitelist: [],
  attackDelay: 1000
};

function stop() {
  state.running = false;
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
}

function schedule(callback, delay) {
  state.timer = setTimeout(callback, delay);
}

async function tick() {
  if (!state.running || !bot?.entity) return stop();
  const entity = bot.nearestEntity((candidate) => {
    const allowed = state.whitelist.includes('*') || state.whitelist.includes(candidate.name);
    return allowed && candidate.isValid && bot.entity.position.distanceTo(candidate.position) < 3.5;
  });

  if (!entity || bot.usingHeldItem) return schedule(tick, 100);
  try {
    await bot.lookAt(entity.position.offset(0, 0.5, 0));
    if (state.running && entity.isValid && bot.entityAtCursor()?.id === entity.id) await bot.attack(entity);
  } catch (error) {
    console.debug(`[Killaura] ${error.message}`);
  }
  if (state.running) schedule(tick, state.attackDelay);
}

module.exports = {
  command: 'killaura',
  usage: 'killaura <start|stop> <mob1,mob2|*> [delay-ms]',
  description: 'Attack nearby entities matching an explicit allowlist.',
  requires: { entity: true },
  autocomplete: () => ['start', 'stop'],
  reload: { pre: stop },

  execute(sender, command, args) {
    const action = args[0]?.toLowerCase();
    if (action === 'stop') {
      stop();
      return sender.reply('[Killaura] Stopped.');
    }
    if (action !== 'start' || !args[1]) return sender.reply(`[Killaura] Usage: ${this.usage}`);
    const delay = Number(args[2] ?? 1000);
    if (!Number.isInteger(delay) || delay < 100 || delay > 60000) return sender.reply('[Killaura] Delay must be an integer from 100 to 60000 ms.');
    const whitelist = args[1].split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean);
    if (!whitelist.length) return sender.reply('[Killaura] Provide at least one entity name.');
    stop();
    state.whitelist = whitelist;
    state.attackDelay = delay;
    state.running = true;
    schedule(tick, 0);
    return sender.reply(`[Killaura] Started for ${whitelist.join(', ')} at ${delay} ms.`);
  }
};
