'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getEventListeners } = require('node:events');
const { cleanWorkflow } = require('../src/main/workflow-model');
const { WorkflowRunner, abortableDelay } = require('../src/main/workflow-runtime');

test('validates declarative workflow nodes and resources', () => {
  const workflow = cleanWorkflow({
    id: 'greet',
    name: 'Greet',
    repeat: 2,
    resources: ['chat', 'chat'],
    steps: [{ id: 'hello', type: 'command', command: 'chat hello' }]
  });
  assert.deepEqual(workflow.resources, ['chat']);
  assert.equal(workflow.steps[0].command, 'chat hello');
  assert.throws(() => cleanWorkflow({ name: 'Broken', steps: [{ type: 'wait', durationMs: 1 }] }), /out of range/u);
});

test('runs workflow steps through the automation state machine', async () => {
  const commands = [];
  let runner;
  const automation = {
    start(options) {
      runner = options.run(new AbortController().signal, { update() {} });
      return { id: options.id, state: 'running' };
    },
    stop() { return true; },
    close() {}
  };
  const workflowRunner = new WorkflowRunner({
    automation,
    commands: { execute: async (command) => { commands.push(command); return { ok: true }; } },
    logger: { log() {}, info() {} }
  });
  const result = workflowRunner.run({
    id: 'sequence',
    name: 'Sequence',
    repeat: 2,
    steps: [{ id: 'command', type: 'command', command: 'ping' }, { id: 'wait', type: 'wait', durationMs: 50 }]
  }, 'bot-one');
  await runner;
  assert.equal(result.activityId, 'workflow:sequence');
  assert.deepEqual(commands, ['ping', 'ping']);
});

test('releases completed wait listeners', async () => {
  const controller = new AbortController();
  await abortableDelay(50, controller.signal);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});
