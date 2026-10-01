'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('lists and removes only an exact authentication cache folder', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mineprompt-cache-'));
  const folder = 'PLAYER@EXAMPLE.COM-a1b2c3d4';
  await fs.mkdir(path.join(directory, folder));
  await fs.writeFile(path.join(directory, folder, 'token.json'), '{}', 'utf8');
  process.env.MINEPROMPT_AUTH_CACHE = directory;
  const modulePath = require.resolve('../commands/global/cache');
  delete require.cache[modulePath];
  const cache = require(modulePath);
  context.after(async () => {
    delete process.env.MINEPROMPT_AUTH_CACHE;
    delete require.cache[modulePath];
    await fs.rm(directory, { recursive: true, force: true });
  });

  const replies = [];
  const sender = { reply: (message) => replies.push(message) };
  await cache.execute(sender, 'cache', ['list']);
  assert.match(replies.at(-1), /PLAYER@EXAMPLE\.COM-a1b2c3d4/u);
  await cache.execute(sender, 'cache', ['delete', folder.toLowerCase()]);
  assert.match(replies.at(-1), /Removed cached authentication/u);
  await assert.rejects(fs.access(path.join(directory, folder)));

  await cache.execute(sender, 'cache', ['delete', '..']);
  assert.equal(replies.at(-1), '[Cache] No cache exists for ...');
});
