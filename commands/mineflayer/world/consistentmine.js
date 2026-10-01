'use strict';

const { policyText } = require('../../../src/main/mining-policy');
const { parsePresetMiningFlags } = require('../../../src/main/mining-presets');

module.exports = {
  command: 'consistentmine',
  usage: 'consistentmine <start [depth]|start x y z [depth]|stop> [mining flags]',
  description: 'Repeatedly mine one or more locked block positions while preserving tools.',
  capability: 'world',
  risk: 'dangerous',
  approval: 'recommended',
  requires: { entity: true },
  autocomplete: (command, args, { store }, completion = {}) => {
    const presetIndex = args.lastIndexOf('--preset');
    if (presetIndex >= 0 && (presetIndex === args.length - 1 && completion.trailingSpace || presetIndex === args.length - 2 && !completion.trailingSpace)) {
      return (store?.snapshot?.().miningPresets || []).map((preset) => preset.name);
    }
    return ['start', 'stop', '--preset', '--tool', '--low', '--min-durability', '--allow-fluid-adjacent', '--allow-falling', '--include', '--exclude'];
  },

  async execute(sender, command, args, { activities, dispatchTargetAction, store }) {
    const action = args[0]?.toLowerCase();
    if (action === 'stop') {
      return sender.reply(activities.stop('consistentmine') ? '[ConsistentMine] Stopped.' : '[ConsistentMine] Already stopped.');
    }
    if (action !== 'start') return sender.reply(`[ConsistentMine] Usage: ${this.usage}`);
    let parsed;
    try { parsed = parsePresetMiningFlags(args.slice(1), store?.snapshot?.() || {}); } catch (error) { return sender.reply(`[ConsistentMine] ${error.message}`); }
    const values = parsed.positional;
    let position;
    let depthArgument = values[0];
    if (values.length >= 3) {
      const coordinates = values.slice(0, 3).map(Number);
      if (coordinates.some((value) => !Number.isFinite(value))) return sender.reply('[ConsistentMine] Coordinates must be numbers.');
      position = { x: Math.trunc(coordinates[0]), y: Math.trunc(coordinates[1]), z: Math.trunc(coordinates[2]) };
      depthArgument = values[3];
    }
    const depth = depthArgument === undefined ? 1 : Number(depthArgument);
    if (!Number.isInteger(depth) || depth < 1 || depth > 16) return sender.reply('[ConsistentMine] Depth must be an integer from 1 to 16.');
    const result = await dispatchTargetAction({ actionId: depth === 1 ? 'block.mine-exact' : 'block.mine-depth', target: position ? 'position' : 'cursor', position, depth, policy: parsed.policy }, sender);
    return sender.reply(`${result.message} ${policyText(parsed.policy)}.`);
  }
};
