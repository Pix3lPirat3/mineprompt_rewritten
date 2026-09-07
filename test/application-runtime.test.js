'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { ApplicationRuntime } = require('../src/main/application-runtime');

test('runs global commands through the application runtime', async (context) => {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'mineprompt-runtime-'));
  const events = [];
  const runtime = await new ApplicationRuntime({
    rootPath: path.resolve(__dirname, '..'),
    userDataPath,
    emit: (type, payload) => events.push({ type, payload })
  }).init();
  context.after(async () => {
    await runtime.close();
    await fs.rm(userDataPath, { recursive: true, force: true });
  });

  assert.equal(runtime.snapshot().commands.length, 8);
  assert.equal((await runtime.execute('account add "Test Player" offline')).ok, true);
  assert.equal((await runtime.execute('settings resource-packs accept')).ok, true);
  assert.deepEqual(runtime.snapshot().accounts, [{ username: 'Test Player', authentication: false }]);
  assert.equal(await runtime.store.getSetting('resourcePackPolicy'), 'accept');
  assert.equal(events.some((event) => event.type === 'snapshot'), true);
});
