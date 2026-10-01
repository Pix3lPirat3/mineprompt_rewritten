'use strict';

const crypto = require('node:crypto');
const { normalizeMiningPolicy, MiningPolicyError, parseMiningFlags } = require('./mining-policy');

function presetName(value) {
  const name = String(value || '').trim().replace(/\s+/gu, ' ');
  if (!name || name.length > 48) throw new MiningPolicyError('invalid-preset', 'Mining policy names must contain 1 to 48 characters.');
  if ([...name].some((character) => character.codePointAt(0) < 32 || character.codePointAt(0) === 127)) {
    throw new MiningPolicyError('invalid-preset', 'Mining policy names cannot contain control characters.');
  }
  return name;
}

function cleanStoredPreset(input) {
  if (!input || typeof input !== 'object' || typeof input.id !== 'string' || typeof input.name !== 'string') return null;
  try {
    return Object.freeze({ id: input.id, name: presetName(input.name), policy: normalizeMiningPolicy(input.policy) });
  } catch {
    return null;
  }
}

function cleanStoredPresets(value) {
  if (!Array.isArray(value)) return [];
  const uniqueIds = new Set();
  const uniqueNames = new Set();
  return value.flatMap((input) => {
    const preset = cleanStoredPreset(input);
    const name = preset?.name.toLowerCase();
    if (!preset || !preset.id || uniqueIds.has(preset.id) || uniqueNames.has(name)) return [];
    uniqueIds.add(preset.id);
    uniqueNames.add(name);
    return [preset];
  }).slice(0, 50).sort((left, right) => left.name.localeCompare(right.name));
}

function createPreset(input, existing = []) {
  const name = presetName(input?.name);
  const requestedId = String(input?.id || '').trim();
  const current = requestedId ? existing.find((entry) => entry.id === requestedId) : null;
  if (requestedId && !current) throw new MiningPolicyError('missing-preset', 'The mining policy no longer exists.');
  const duplicate = existing.find((entry) => entry.id !== requestedId && entry.name.toLowerCase() === name.toLowerCase());
  if (duplicate) throw new MiningPolicyError('duplicate-preset', `${name} is already saved.`);
  return Object.freeze({ id: current?.id || crypto.randomUUID(), name, policy: normalizeMiningPolicy(input?.policy) });
}

function findPreset(presets, reference) {
  const target = String(reference || '').trim().toLowerCase();
  if (!target) return null;
  return presets.find((preset) => preset.id.toLowerCase() === target || preset.name.toLowerCase() === target) || null;
}

function resolveMiningPolicy(policyInput = {}, presets = [], reference = null) {
  if (!reference) return normalizeMiningPolicy(policyInput);
  const preset = findPreset(presets, reference);
  if (!preset) throw new MiningPolicyError('missing-preset', `Mining policy "${reference}" was not found.`);
  return normalizeMiningPolicy({ ...preset.policy, ...policyInput });
}

function parsePresetMiningFlags(argumentsList, data = {}) {
  const parsed = parseMiningFlags(argumentsList);
  const reference = parsed.preset || data.activeMiningPresetId || null;
  return {
    positional: parsed.positional,
    preset: reference ? findPreset(data.miningPresets || [], reference) : null,
    policy: resolveMiningPolicy(parsed.overrides, data.miningPresets || [], reference)
  };
}

module.exports = { cleanStoredPreset, cleanStoredPresets, createPreset, findPreset, parsePresetMiningFlags, presetName, resolveMiningPolicy };
