'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const nbt = require('prismarine-nbt');
const { gzipSync } = require('node:zlib');
const { boundedBlockEntities, importedBlueprint } = require('../src/main/blueprint-importer');

function varints(values) {
  const bytes = [];
  for (let value of values) {
    do {
      let byte = value & 0x7f;
      value >>>= 7;
      if (value) byte |= 0x80;
      bytes.push(byte);
    } while (value);
  }
  return bytes;
}

function spongeFixture(blocks = [0, 1, 2, 1]) {
  return gzipSync(nbt.writeUncompressed(nbt.comp({
    Version: nbt.int(2),
    DataVersion: nbt.int(4671),
    Width: nbt.short(2),
    Height: nbt.short(1),
    Length: nbt.short(2),
    Offset: nbt.intArray([1, 0, -1]),
    Palette: nbt.comp({
      'minecraft:air': nbt.int(0),
      'minecraft:repeater[delay=4,facing=north,locked=true,powered=true]': nbt.int(1),
      'minecraft:turtle_egg[eggs=2,hatch=1]': nbt.int(2)
    }),
    BlockData: nbt.byteArray(varints(blocks)),
    BlockEntities: nbt.list({ type: 'compound', value: [] }),
    Metadata: nbt.comp({ Name: nbt.string('State Test') })
  })));
}

function mceditFixture() {
  return gzipSync(nbt.writeUncompressed(nbt.comp({
    Materials: nbt.string('Alpha'),
    Width: nbt.short(2),
    Height: nbt.short(1),
    Length: nbt.short(1),
    Blocks: nbt.byteArray([5, 5]),
    Data: nbt.byteArray([0, 1]),
    TileEntities: nbt.list({ type: 'compound', value: [] }),
    Entities: nbt.list({ type: 'compound', value: [] })
  })));
}

test('imports Sponge palettes without corrupting integer block properties', () => {
  const first = importedBlueprint(spongeFixture(), { sourceFile: 'states.schem' });
  const second = importedBlueprint(spongeFixture(), { sourceFile: 'renamed.schem', name: 'Another name' });
  assert.equal(first.version, '1.21.11');
  assert.equal(first.name, 'State Test');
  assert.equal(first.hash, second.hash);
  assert.equal(first.palette[1].state, 'minecraft:repeater[delay=4,facing=north,locked=true,powered=true]');
  assert.equal(first.palette[1].name, 'repeater');
  assert.equal(first.palette[2].state, 'minecraft:turtle_egg[eggs=2,hatch=1]');
  assert.deepEqual(first.offset, { x: 1, y: 0, z: -1 });
  assert.equal(first.materials.reduce((sum, material) => sum + material.count, 0), 3);
});

test('requires explicit versions and preserves legacy metadata variants', () => {
  assert.throws(() => importedBlueprint(mceditFixture()), /explicit Minecraft version/u);
  const blueprint = importedBlueprint(mceditFixture(), { version: '1.12.2', name: 'Legacy planks' });
  assert.equal(blueprint.sourceFormat, 'mcedit');
  assert.equal(blueprint.palette.length, 2);
  assert.equal(blueprint.palette[0].state, 'minecraft:planks');
  assert.equal(blueprint.palette[1].state, 'minecraft:planks[legacy_metadata=1]');
  assert.deepEqual(blueprint.palette.map((entry) => entry.legacy), [{ id: 5, metadata: 0 }, { id: 5, metadata: 1 }]);
  assert.equal(blueprint.materials[0].count, 2);
});

test('rejects malformed palette references before registration', () => {
  assert.throws(() => importedBlueprint(spongeFixture([0, 1, 8, 1])), /missing palette entry/u);
});

test('rejects missing and out-of-bounds Sponge block entity positions', () => {
  const dimensions = { x: 2, y: 2, z: 2 };
  assert.throws(() => boundedBlockEntities([{ Id: 'minecraft:chest' }], dimensions, { requirePosition: true }), /missing its position/u);
  assert.throws(() => boundedBlockEntities([{ Id: 'minecraft:chest', Pos: [2, 0, 0] }], dimensions, { requirePosition: true }), /invalid position/u);
});

test('requires an available registry version for Sponge validation', () => {
  assert.throws(() => importedBlueprint(spongeFixture(), { version: '99.99.99' }), /not available for schematic validation/u);
});
