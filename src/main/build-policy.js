'use strict';

const DEFAULT_PROTECTED_BLOCKS = Object.freeze(['bedrock', 'barrier', 'end_portal', 'end_portal_frame', 'end_gateway', 'command_block', 'chain_command_block', 'repeating_command_block', 'structure_block', 'jigsaw']);

function stringList(value, fallback = []) {
  if (value === undefined) return [...fallback];
  if (!Array.isArray(value)) throw new Error('Build policy block lists must be arrays.');
  return [...new Set(value.map((entry) => String(entry || '').trim().toLowerCase().replace(/^minecraft:/u, '')).filter(Boolean))].slice(0, 512);
}

function enumValue(value, values, fallback, label) {
  const normalized = String(value || fallback).toLowerCase();
  if (!values.includes(normalized)) throw new Error(`${label} must be ${values.join(', ')}.`);
  return normalized;
}

function integerValue(value, fallback, minimum, maximum, label) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
  return number;
}

function normalizeBuildPolicy(value = {}) {
  return Object.freeze({
    terrain: enumValue(value.terrain, ['preserve', 'replace', 'flatten'], 'preserve', 'Terrain policy'),
    conflicts: enumValue(value.conflicts, ['stop', 'skip', 'replace'], 'stop', 'Conflict policy'),
    air: enumValue(value.air, ['ignore', 'clear'], 'ignore', 'Air policy'),
    scaffolding: stringList(value.scaffolding, ['dirt', 'cobblestone']),
    materials: enumValue(value.materials, ['inventory', 'storage', 'both'], 'inventory', 'Material source'),
    storageZone: value.storageZone ? String(value.storageZone).trim() : null,
    maximumReplacements: integerValue(value.maximumReplacements, 4096, 0, 1048576, 'Maximum replacements'),
    maximumRange: integerValue(value.maximumRange, 256, 1, 4096, 'Maximum build range'),
    protectedBlocks: stringList(value.protectedBlocks, DEFAULT_PROTECTED_BLOCKS),
    placementDelay: integerValue(value.placementDelay, 100, 0, 60000, 'Placement delay'),
    retryLimit: integerValue(value.retryLimit, 3, 0, 32, 'Retry limit'),
    verifyBatchSize: integerValue(value.verifyBatchSize, 32, 1, 4096, 'Verification batch size'),
    onFailure: enumValue(value.onFailure, ['stop', 'skip'], 'stop', 'Failure policy')
  });
}

module.exports = { DEFAULT_PROTECTED_BLOCKS, normalizeBuildPolicy };
