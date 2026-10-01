'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ActionDispatcher } = require('../src/main/action-dispatcher');

test('validates, evaluates, executes, and audits registered actions', async () => {
  const audit = [];
  const dispatcher = new ActionDispatcher({ audit: (event) => audit.push(event) });
  dispatcher.register({
    id: 'test.echo',
    inputSchema: {
      type: 'object',
      properties: { value: { type: 'string', minLength: 1 } },
      required: ['value'],
      additionalProperties: false
    },
    execute: ({ request }) => request.value
  });
  dispatcher.registerPolicy('blocked-value', ({ request }) => request?.value === 'blocked' ? { enabled: false, reason: 'Blocked by policy.' } : null);
  assert.equal(await dispatcher.execute('test.echo', { value: 'ready' }), 'ready');
  await assert.rejects(dispatcher.execute('test.echo', { value: '' }), /must NOT have fewer/u);
  await assert.rejects(dispatcher.execute('test.echo', { value: 'blocked' }), /Blocked by policy/u);
  assert.equal(audit.length, 3);
  assert.equal(audit[0].status, 'completed');
  assert.equal(audit[1].status, 'failed');
  assert.equal(audit[2].status, 'failed');
});
