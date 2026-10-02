'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { loadEngine } = require('../src/main/engine-loader');

async function moduleFile(root, name, source) {
  const directory = path.join(root, 'node_modules', name);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({ name, version: '1.0.0', main: 'index.js' }), 'utf8');
  await fs.writeFile(path.join(directory, 'index.js'), source, 'utf8');
}

test('loads an isolated engine dependency set from its profile root', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mineprompt-engine-loader-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'engine' }), 'utf8');
  await moduleFile(root, 'mineflayer', "module.exports={createBot:()=>({engine:'custom'})}");
  await moduleFile(root, 'mineflayer-pathfinder', "module.exports={pathfinder:function customPathfinder(){},Movements:class CustomMovements{}}");
  await moduleFile(root, 'prismarine-chat', "module.exports=registry=>class ChatMessage{static registry=registry}");
  const engine = loadEngine({ id: 'preview-123', profile: 'preview', name: 'Preview', edition: 'bedrock', revision: '123', root });
  assert.equal(engine.createBot().engine, 'custom');
  assert.equal(engine.pathfinder.name, 'customPathfinder');
  assert.equal(engine.chatFactory('bedrock').registry, 'bedrock');
  assert.equal(engine.edition, 'bedrock');
});

test('does not mix bundled modules into an incomplete custom engine', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mineprompt-engine-loader-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'engine' }), 'utf8');
  await moduleFile(root, 'mineflayer', 'module.exports={createBot:()=>({})}');
  assert.throws(() => loadEngine({ id: 'incomplete', root }), /mineflayer-pathfinder/u);
});
