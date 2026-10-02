'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const nbt = require('prismarine-nbt');
const { gzipSync } = require('node:zlib');
const { BlueprintLibrary } = require('../src/main/blueprint-library');

function fixture() {
  return gzipSync(nbt.writeUncompressed(nbt.comp({
    Version: nbt.int(2),
    DataVersion: nbt.int(4671),
    Width: nbt.short(2),
    Height: nbt.short(1),
    Length: nbt.short(1),
    Palette: nbt.comp({ 'minecraft:air': nbt.int(0), 'minecraft:stone': nbt.int(1) }),
    BlockData: nbt.byteArray([1, 0])
  })));
}

test('persists normalized blueprints by content hash without retaining source paths', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mineprompt-blueprints-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const logs = [];
  const library = await new BlueprintLibrary({ directory, logger: { warn: (message) => logs.push(message) } }).init();
  const imported = await library.importBuffer(fixture(), { sourceFile: path.join(directory, 'secret', 'house.schem'), name: 'House' });
  assert.equal(imported.id.length, 16);
  assert.equal(library.list()[0].materialCount, 1);
  assert.equal(library.inspect(imported.id).sourceFile, 'house.schem');
  await assert.rejects(library.importBuffer(fixture(), { sourceFile: 'copy.schem', name: 'Copy' }), /already imported/u);
  await library.close();
  const restored = await new BlueprintLibrary({ directory, logger: { warn: (message) => logs.push(message) } }).init();
  assert.equal(restored.list()[0].hash, imported.hash);
  assert.equal(restored.materials('House').materials[0].name, 'stone');
  assert.equal(await restored.remove(imported.id), true);
  assert.deepEqual(restored.list(), []);
  await restored.close();
  assert.deepEqual(logs, []);
});
