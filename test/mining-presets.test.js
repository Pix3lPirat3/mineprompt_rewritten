'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanStoredPresets, createPreset, parsePresetMiningFlags, resolveMiningPolicy } = require('../src/main/mining-presets');

test('validates named policies without converting older shapes', () => {
  const presets = cleanStoredPresets([
    { id: 'safe', name: 'Safe Quarry', policy: { minimumDurability: 30 } },
    { name: 'Legacy shape', minimumDurability: 10 },
    { id: 'duplicate', name: 'safe quarry', policy: {} }
  ]);
  assert.equal(presets.length, 1);
  assert.equal(presets[0].policy.minimumDurability, 30);
});

test('resolves active and explicit named policies with flag overrides', () => {
  const preset = createPreset({ name: 'Safe Quarry', policy: { tool: 'held', minimumDurability: 30, allowFalling: false } });
  const data = { miningPresets: [preset], activeMiningPresetId: preset.id };
  const active = parsePresetMiningFlags(['0', '64', '0'], data);
  assert.equal(active.policy.tool, 'held');
  assert.equal(active.policy.minimumDurability, 30);
  const explicit = parsePresetMiningFlags(['--preset', 'Safe Quarry', '--min-durability', '50'], { miningPresets: [preset], activeMiningPresetId: null });
  assert.equal(explicit.policy.minimumDurability, 50);
  assert.equal(explicit.preset.id, preset.id);
  assert.throws(() => resolveMiningPolicy({}, [preset], 'Missing'), /not found/u);
});
