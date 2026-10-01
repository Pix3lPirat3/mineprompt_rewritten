'use strict';

const { normalizeMiningPolicy, parseMiningFlags, policyText } = require('../../src/main/mining-policy');
const { findPreset } = require('../../src/main/mining-presets');

function policyDetails(preset, active) {
  const policy = preset.policy;
  const filters = [policy.include.length ? `only ${policy.include.join(', ')}` : '', policy.exclude.length ? `excluding ${policy.exclude.join(', ')}` : ''].filter(Boolean);
  return `[MiningPolicy] ${preset.name}${active ? ' (in use)' : ''}\n${policyText(policy)}\nReach ${policy.reach}; limit ${policy.maxBlocks}${filters.length ? `; ${filters.join('; ')}` : ''}.`;
}

module.exports = {
  command: 'miningpolicy',
  aliases: ['minepolicy'],
  usage: 'miningpolicy <list|show [name]|use <name|default>|save <name> [mining flags]|remove <name>>',
  description: 'Manage named mining safety and tool policies.',
  requires: { console: true },
  risk: 'restricted',

  autocomplete: (command, args, { store }, completion = {}) => {
    const names = store.snapshot().miningPresets.map((preset) => preset.name);
    if (!args.length || args.length === 1 && !completion.trailingSpace) return ['list', 'show', 'use', 'save', 'remove'];
    const action = args[0]?.toLowerCase();
    if (['show', 'use', 'remove'].includes(action) && (args.length === 1 || args.length === 2 && !completion.trailingSpace)) return action === 'use' ? ['default', ...names] : names;
    if (action === 'save' && (args.length === 1 || args.length === 2 && !completion.trailingSpace)) return names;
    return ['--tool', '--low', '--min-durability', '--allow-fluid-adjacent', '--allow-falling', '--include', '--exclude', '--reach', '--max-blocks'];
  },

  async execute(sender, command, args, { store }) {
    const data = store.snapshot();
    const action = String(args[0] || 'list').toLowerCase();
    if (action === 'list') {
      if (!data.miningPresets.length) return sender.reply('[MiningPolicy] No policies are saved.');
      return sender.reply(`[MiningPolicy] ${data.miningPresets.map((preset) => `${preset.name}${preset.id === data.activeMiningPresetId ? ' (in use)' : ''}`).join(', ')}`);
    }
    if (action === 'show') {
      const preset = findPreset(data.miningPresets, args[1] || data.activeMiningPresetId);
      if (!preset) return sender.reply('[MiningPolicy] Select a saved policy name.');
      return sender.reply(policyDetails(preset, preset.id === data.activeMiningPresetId));
    }
    if (action === 'use') {
      if (!args[1]) return sender.reply(`[MiningPolicy] Usage: ${this.usage}`);
      if (args[1].toLowerCase() === 'default') {
        await store.selectMiningPreset(null);
        return sender.reply('[MiningPolicy] Using built-in defaults.');
      }
      const preset = findPreset(data.miningPresets, args[1]);
      if (!preset) return sender.reply(`[MiningPolicy] ${args[1]} was not found.`);
      await store.selectMiningPreset(preset.id);
      return sender.reply(`[MiningPolicy] Now using ${preset.name}.`);
    }
    if (action === 'save') {
      const name = String(args[1] || '').trim();
      if (!name) return sender.reply(`[MiningPolicy] Usage: ${this.usage}`);
      const current = findPreset(data.miningPresets, name);
      let parsed;
      try { parsed = parseMiningFlags(args.slice(2)); } catch (error) { return sender.reply(`[MiningPolicy] ${error.message}`); }
      if (parsed.preset || parsed.positional.length) return sender.reply('[MiningPolicy] Policy values must use mining flags.');
      const policy = normalizeMiningPolicy({ ...(current?.policy || {}), ...parsed.overrides });
      const preset = await store.saveMiningPreset({ id: current?.id, name, policy, activate: true });
      return sender.reply(`[MiningPolicy] Saved and selected ${preset.name}.`);
    }
    if (action === 'remove') {
      const preset = findPreset(data.miningPresets, args[1]);
      if (!preset) return sender.reply(`[MiningPolicy] ${args[1] || 'That policy'} was not found.`);
      await store.removeMiningPreset(preset.id);
      return sender.reply(`[MiningPolicy] Removed ${preset.name}.`);
    }
    return sender.reply(`[MiningPolicy] Usage: ${this.usage}`);
  }
};
