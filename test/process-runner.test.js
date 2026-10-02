'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runProcess } = require('../src/main/process-runner');

test('captures hidden child output without a command shell', async () => {
  const result = await runProcess(process.execPath, ['-e', "process.stdout.write('ready');process.stderr.write('checked')"]);
  assert.equal(result.stdout, 'ready');
  assert.equal(result.stderr, 'checked');
});

test('bounds child output', async () => {
  await assert.rejects(
    runProcess(process.execPath, ['-e', "setInterval(() => process.stdout.write('x'.repeat(4096)), 1)"], { maximumOutput: 1024, timeout: 5000 }),
    /too much output/u
  );
});
