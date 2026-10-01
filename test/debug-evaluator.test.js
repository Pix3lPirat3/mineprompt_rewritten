'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DebugEvaluator, debugValue } = require('../src/main/debug-evaluator');

test('evaluates live expressions and serializes cycles for transport', async () => {
  const bot = { inventory: { slots: [{ name: 'diamond_sword' }] } };
  bot.self = bot;
  const messages = [];
  const evaluator = new DebugEvaluator({ context: () => ({ bot }), logger: { warn: (message) => messages.push(message) } });
  const result = await evaluator.evaluate({ code: 'bot', depth: 6, entries: 50 });
  assert.equal(result.ok, true);
  assert.equal(result.value.inventory.slots[0].name, 'diamond_sword');
  assert.equal(result.value.self, '[Circular: $]');
  assert.match(result.text, /diamond_sword/u);
  assert.equal(messages.length, 1);
});

test('supports awaited expressions and statement bodies', async () => {
  const evaluator = new DebugEvaluator({ context: () => ({ value: 20 }), logger: { warn() {} } });
  assert.equal((await evaluator.evaluate({ code: 'await Promise.resolve(value + 2)' })).value, 22);
  assert.equal((await evaluator.evaluate({ code: 'const doubled = value * 2; return doubled' })).value, 40);
  await assert.rejects(evaluator.evaluate({ code: 'await new Promise(() => {})', timeout: 100 }), /exceeded 100 ms/u);
});

test('bounds debug object depth and entries', () => {
  const result = debugValue({ values: [1, 2, 3], nested: { next: { value: true } } }, { depth: 2, entries: 2 });
  assert.equal(result.truncated, true);
  assert.deepEqual(result.value.values, [1, 2]);
});
