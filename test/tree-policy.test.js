'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTreePolicy, parseTreeFlags, treePolicyText } = require('../src/main/tree-policy');

test('normalizes safe tree lifecycle defaults', () => {
  const policy = normalizeTreePolicy();
  assert.equal(policy.collectDrops, true);
  assert.equal(policy.collectionRadius, 12);
  assert.equal(policy.replant, 'never');
  assert.equal(policy.onFailure, 'stop');
  assert.match(treePolicyText(policy), /collect drops within 12 blocks/u);
  assert.match(treePolicyText(policy), /no replanting/u);
});

test('parses collection and replant flags with mining options', () => {
  const parsed = parseTreeFlags(['--no-collect', '--collection-radius', '9', '--replant', 'required', '--on-failure', 'skip', '--min-durability', '18']);
  assert.equal(parsed.policy.collectDrops, false);
  assert.equal(parsed.policy.collectionRadius, 9);
  assert.equal(parsed.policy.replant, 'required');
  assert.equal(parsed.policy.onFailure, 'skip');
  assert.equal(parsed.policy.minimumDurability, 18);
});

test('rejects invalid lifecycle policy values', () => {
  assert.throws(() => normalizeTreePolicy({ replant: 'sometimes' }), /Replant policy/u);
  assert.throws(() => normalizeTreePolicy({ collectionRadius: 0 }), /Drop collection radius/u);
  assert.throws(() => normalizeTreePolicy({ onFailure: 'retry-forever' }), /Tree failure policy/u);
});
