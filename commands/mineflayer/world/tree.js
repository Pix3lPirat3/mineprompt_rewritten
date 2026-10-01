'use strict';

const { resolveMiningPolicy } = require('../../../src/main/mining-presets');
const { parseTreeFlags, treePolicyText } = require('../../../src/main/tree-policy');

const FLAGS = ['--preset', '--tool', '--low', '--min-durability', '--reach', '--max-blocks', '--leaf-support', '--log-support', '--radius', '--max-trees', '--collect', '--no-collect', '--collection-radius', '--replant', '--on-failure', '--allow-uncertain'];

function coordinates(values) {
  const numbers = values.map(Number);
  if (numbers.some((value) => !Number.isFinite(value))) throw new Error('Coordinates must be numbers.');
  return numbers.map(Math.trunc);
}

function requestTarget(positional) {
  if (!positional.length || positional[0]?.toLowerCase() === 'cursor') return { target: 'cursor' };
  if (positional[0]?.toLowerCase() === 'nearest') return { target: 'nearest' };
  if (positional.length !== 3) throw new Error('Use cursor, nearest, or exactly x y z.');
  const [x, y, z] = coordinates(positional);
  return { target: 'position', position: { x, y, z } };
}

function resolvedPolicy(parsed, store) {
  const data = store?.snapshot?.() || {};
  const mining = resolveMiningPolicy(parsed.overrides, data.miningPresets || [], parsed.preset || data.activeMiningPresetId || null);
  return {
    ...mining,
    leafSupport: parsed.policy.leafSupport,
    logSupport: parsed.policy.logSupport,
    radius: parsed.policy.radius,
    maxTrees: parsed.policy.maxTrees,
    collectDrops: parsed.policy.collectDrops,
    collectionRadius: parsed.policy.collectionRadius,
    replant: parsed.policy.replant,
    onFailure: parsed.policy.onFailure,
    requireNatural: parsed.policy.requireNatural
  };
}

module.exports = {
  command: 'tree',
  aliases: ['lumber'],
  usage: 'tree <inspect|fell> [cursor|nearest|x y z] [flags] | tree <farm|status|stop> [flags]',
  description: 'Inspect, fell, or farm trees with support-aware route planning.',
  requires: { entity: true },
  risk: 'dangerous',
  capability: 'world',
  approval: 'recommended',

  autocomplete(command, args, { store }, completion = {}) {
    const values = new Map([
      ['--leaf-support', ['never', 'safe', 'always']],
      ['--log-support', ['never', 'stump']],
      ['--replant', ['never', 'available', 'required']],
      ['--on-failure', ['stop', 'skip']],
      ['--low', ['switch', 'stop', 'skip']],
      ['--tool', ['auto', 'held', 'hand']]
    ]);
    for (const [flag, choices] of values) {
      const index = args.lastIndexOf(flag);
      if (index >= 0 && (index === args.length - 1 && completion.trailingSpace || index === args.length - 2 && !completion.trailingSpace)) return choices;
    }
    const presetIndex = args.lastIndexOf('--preset');
    if (presetIndex >= 0 && (presetIndex === args.length - 1 && completion.trailingSpace || presetIndex === args.length - 2 && !completion.trailingSpace)) {
      return (store?.snapshot?.().miningPresets || []).map((preset) => preset.name);
    }
    if (!args.length || args.length === 1 && !completion.trailingSpace) return ['inspect', 'fell', 'farm', 'status', 'stop'];
    if (['inspect', 'fell'].includes(args[0]?.toLowerCase()) && (args.length === 1 || args.length === 2 && !completion.trailingSpace)) return ['cursor', 'nearest', ...FLAGS];
    return FLAGS;
  },

  execute(sender, command, args, { store, trees }) {
    const action = String(args[0] || '').toLowerCase();
    if (action === 'status') {
      const status = trees.status();
      if (!status) return sender.reply('[Tree] No tree activity has run in this session.');
      return sender.reply(`[Tree] ${status.phase}; ${status.treesFinished}/${status.treesFound} trees; ${status.treesFailed || 0} failed; ${status.logsMined} logs mined; ${status.remainingLogs || 0} remaining; ${status.itemsCollected || 0} items collected; ${status.saplingsPlanted || 0} saplings planted; ${status.routesRejected || 0} routes rejected${status.failed ? `; ${status.failed}` : ''}.`);
    }
    if (action === 'stop') return sender.reply(trees.stop() ? '[Tree] Stopping.' : '[Tree] No tree activity is running.');
    let parsed;
    try { parsed = parseTreeFlags(args.slice(1)); } catch (error) { return sender.reply(`[Tree] ${error.message}`); }
    try {
      const policy = resolvedPolicy(parsed, store);
      if (action === 'inspect') {
        const result = trees.inspect({ ...requestTarget(parsed.positional), policy });
        return sender.reply(result.message);
      }
      if (action === 'fell') {
        const status = trees.start({ mode: 'fell', ...requestTarget(parsed.positional), policy });
        return sender.reply(`[Tree] Started a support-aware tree plan. ${treePolicyText(status.policy)}.`);
      }
      if (action === 'farm') {
        if (parsed.positional.length) throw new Error('Tree farm accepts flags instead of a positional target.');
        const status = trees.start({ mode: 'farm', policy });
        return sender.reply(`[Tree] Farming ${status.treesFound} ${status.treesFound === 1 ? 'tree' : 'trees'} within ${policy.radius} blocks. ${treePolicyText(policy)}.`);
      }
      throw new Error(`Usage: ${this.usage}`);
    } catch (error) {
      return sender.reply(`[Tree] ${error.message}`);
    }
  }
};
