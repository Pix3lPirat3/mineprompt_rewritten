'use strict';

const { normalizeMiningPolicy, parseMiningFlags } = require('./mining-policy');

const LEAF_SUPPORT = Object.freeze(['never', 'safe', 'always']);
const LOG_SUPPORT = Object.freeze(['never', 'stump']);

function boundedInteger(value, fallback, minimum, maximum, name) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
  return number;
}

function normalizeTreePolicy(input = {}) {
  const leafSupport = String(input.leafSupport || 'safe').toLowerCase();
  const logSupport = String(input.logSupport || 'stump').toLowerCase();
  if (!LEAF_SUPPORT.includes(leafSupport)) throw new Error(`Leaf support must be one of: ${LEAF_SUPPORT.join(', ')}.`);
  if (!LOG_SUPPORT.includes(logSupport)) throw new Error(`Log support must be one of: ${LOG_SUPPORT.join(', ')}.`);
  return Object.freeze({
    ...normalizeMiningPolicy(input),
    leafSupport,
    logSupport,
    radius: boundedInteger(input.radius, 32, 1, 64, 'Tree search radius'),
    maxTrees: boundedInteger(input.maxTrees, 32, 1, 128, 'Maximum trees'),
    requireNatural: input.requireNatural !== false
  });
}

function parseTreeFlags(argumentsList = []) {
  const tree = {};
  const miningArguments = [];
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = String(argumentsList[index]);
    const next = () => {
      const value = argumentsList[index + 1];
      if (value === undefined || String(value).startsWith('--')) throw new Error(`${argument} requires a value.`);
      index += 1;
      return value;
    };
    if (argument === '--leaf-support') tree.leafSupport = next();
    else if (argument === '--log-support') tree.logSupport = next();
    else if (argument === '--radius') tree.radius = next();
    else if (argument === '--max-trees') tree.maxTrees = next();
    else if (argument === '--allow-uncertain') tree.requireNatural = false;
    else miningArguments.push(argument);
  }
  const parsed = parseMiningFlags(miningArguments);
  return { positional: parsed.positional, preset: parsed.preset, overrides: { ...parsed.overrides, ...tree }, policy: normalizeTreePolicy({ ...parsed.policy, ...tree }) };
}

function treePolicyText(policyInput = {}) {
  const policy = normalizeTreePolicy(policyInput);
  const leaves = policy.leafSupport === 'never' ? 'no leaf climbing' : policy.leafSupport === 'safe' ? 'persistent leaf climbing' : 'leaf climbing allowed';
  const logs = policy.logSupport === 'stump' ? 'stump climbing' : 'ground routes only';
  return `${logs}; ${leaves}; ${policy.requireNatural ? 'natural trees required' : 'uncertain trees allowed'}`;
}

module.exports = { LEAF_SUPPORT, LOG_SUPPORT, normalizeTreePolicy, parseTreeFlags, treePolicyText };
