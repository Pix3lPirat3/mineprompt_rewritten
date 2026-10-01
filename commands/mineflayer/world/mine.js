'use strict';

const { policyText } = require('../../../src/main/mining-policy');
const { parsePresetMiningFlags } = require('../../../src/main/mining-presets');

const FLAGS = ['--preset', '--tool', '--low', '--min-durability', '--allow-fluid-adjacent', '--allow-falling', '--include', '--exclude', '--reach', '--max-blocks'];

function coordinates(values) {
  const numbers = values.map(Number);
  if (numbers.some((value) => !Number.isFinite(value))) throw new Error('Coordinates must be numbers.');
  return numbers.map(Math.trunc);
}

module.exports = {
  command: 'mine',
  usage: 'mine <once [x y z]|region x1 y1 z1 x2 y2 z2|chunk [depth]|stop|status> [mining flags]',
  description: 'Mine safely with configurable tool, durability, hazard, and reach policies.',
  requires: { entity: true },
  risk: 'dangerous',
  capability: 'world',
  approval: 'recommended',
  autocomplete: (command, args, { store }, completion = {}) => {
    const presetIndex = args.lastIndexOf('--preset');
    if (presetIndex >= 0 && (presetIndex === args.length - 1 && completion.trailingSpace || presetIndex === args.length - 2 && !completion.trailingSpace)) {
      return (store?.snapshot?.().miningPresets || []).map((preset) => preset.name);
    }
    return ['once', 'region', 'chunk', 'stop', 'status', ...FLAGS];
  },

  async execute(sender, command, args, { activities, bot, dispatchTargetAction, mining, store }) {
    const action = args[0]?.toLowerCase();
    if (action === 'stop') {
      const stopped = activities.stop('regionmine') || activities.stop('consistentmine');
      return sender.reply(stopped ? '[Mine] Stopped.' : '[Mine] No mining activity is running.');
    }
    if (action === 'status') {
      const status = mining.status();
      if (!status) return sender.reply('[Mine] No region mine has run in this session.');
      return sender.reply(`[Mine] ${status.state.mined} mined, ${status.state.skipped} safely skipped, ${status.region.size} selected. ${policyText(status.policy)}.`);
    }
    let parsed;
    try { parsed = parsePresetMiningFlags(args.slice(1), store?.snapshot?.() || {}); } catch (error) { return sender.reply(`[Mine] ${error.message}`); }
    try {
      if (action === 'once') {
        const position = parsed.positional.length ? coordinates(parsed.positional.slice(0, 3)) : null;
        if (parsed.positional.length && parsed.positional.length !== 3) throw new Error('Mine once requires either no coordinates or exactly x y z.');
        const result = await dispatchTargetAction({ actionId: 'block.dig', target: position ? 'position' : 'cursor', position: position ? { x: position[0], y: position[1], z: position[2] } : undefined, policy: parsed.policy }, sender);
        return sender.reply(`${result.message} ${policyText(parsed.policy)}.`);
      }
      if (action === 'region') {
        if (parsed.positional.length !== 6) throw new Error('Region mining requires x1 y1 z1 x2 y2 z2.');
        const value = coordinates(parsed.positional);
        const result = mining.startRegion({ x: value[0], y: value[1], z: value[2] }, { x: value[3], y: value[4], z: value[5] }, parsed.policy);
        return sender.reply(`[Mine] Started ${result.region.size} block region. ${policyText(result.policy)}.`);
      }
      if (action === 'chunk') {
        if (parsed.positional.length > 1) throw new Error('Chunk mining accepts one optional depth.');
        const depth = parsed.positional.length ? Number(parsed.positional[0]) : 1;
        if (!Number.isInteger(depth) || depth < 1 || depth > 16) throw new Error('Chunk depth must be an integer from 1 to 16.');
        const origin = bot.entity.position.floored();
        const minX = Math.floor(origin.x / 16) * 16;
        const minZ = Math.floor(origin.z / 16) * 16;
        const result = mining.startRegion({ x: minX, y: origin.y - depth + 1, z: minZ }, { x: minX + 15, y: origin.y, z: minZ + 15 }, parsed.policy);
        return sender.reply(`[Mine] Started current chunk at depth ${depth}, ${result.region.size} blocks. ${policyText(result.policy)}.`);
      }
    } catch (error) {
      return sender.reply(`[Mine] ${error.message}`);
    }
    return sender.reply(`[Mine] Usage: ${this.usage}`);
  }
};
