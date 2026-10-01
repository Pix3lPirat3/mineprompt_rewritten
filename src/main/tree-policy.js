'use strict';

const { normalizeMiningPolicy, parseMiningFlags } = require('./mining-policy');

const LEAF_SUPPORT = Object.freeze(['never', 'safe', 'always']);
const LOG_SUPPORT = Object.freeze(['never', 'stump']);
const REPLANT = Object.freeze(['never', 'available', 'required']);
const TREE_FAILURE = Object.freeze(['stop', 'skip']);

function boundedInteger(value, fallback, minimum, maximum, name) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
  return number;
}

function normalizeTreePolicy(input = {}) {
  const leafSupport = String(input.leafSupport || 'safe').toLowerCase();
  const logSupport = String(input.logSupport || 'stump').toLowerCase();
  const replant = String(input.replant || 'never').toLowerCase();
  const onFailure = String(input.onFailure || 'stop').toLowerCase();
  if (!LEAF_SUPPORT.includes(leafSupport)) throw new Error(`Leaf support must be one of: ${LEAF_SUPPORT.join(', ')}.`);
  if (!LOG_SUPPORT.includes(logSupport)) throw new Error(`Log support must be one of: ${LOG_SUPPORT.join(', ')}.`);
  if (!REPLANT.includes(replant)) throw new Error(`Replant policy must be one of: ${REPLANT.join(', ')}.`);
  if (!TREE_FAILURE.includes(onFailure)) throw new Error(`Tree failure policy must be one of: ${TREE_FAILURE.join(', ')}.`);
  return Object.freeze({
    ...normalizeMiningPolicy(input),
    leafSupport,
    logSupport,
    collectDrops: input.collectDrops !== false,
    collectionRadius: boundedInteger(input.collectionRadius, 12, 1, 32, 'Drop collection radius'),
    replant,
    onFailure,
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
    else if (argument === '--collection-radius') tree.collectionRadius = next();
    else if (argument === '--collect') tree.collectDrops = true;
    else if (argument === '--no-collect') tree.collectDrops = false;
    else if (argument === '--replant') tree.replant = next();
    else if (argument === '--on-failure') tree.onFailure = next();
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
  const collection = policy.collectDrops ? `collect drops within ${policy.collectionRadius} blocks` : 'leave drops';
  const replant = policy.replant === 'never' ? 'no replanting' : policy.replant === 'required' ? 'replanting required' : 'replant when saplings are available';
  const failure = policy.onFailure === 'skip' ? 'skip unreachable trees' : 'stop on tree failure';
  return `${logs}; ${leaves}; ${collection}; ${replant}; ${failure}; ${policy.requireNatural ? 'natural trees required' : 'uncertain trees allowed'}`;
}

module.exports = { LEAF_SUPPORT, LOG_SUPPORT, REPLANT, TREE_FAILURE, normalizeTreePolicy, parseTreeFlags, treePolicyText };
