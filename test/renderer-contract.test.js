'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('renderer mounts through the typed application entry point', () => {
  const html = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');
  const application = fs.readFileSync(path.join(root, 'src', 'renderer', 'App.tsx'), 'utf8');
  assert.match(html, /id="root"/u);
  assert.match(html, /src="\/main\.tsx"/u);
  assert.match(application, /<PlayerRibbon/u);
  assert.match(application, /<TargetRibbon/u);
  assert.match(application, /<InventoryWorkspace/u);
  assert.match(application, /<TerminalDock/u);
});

test('preload requests have matching trusted IPC handlers', () => {
  const { IPC_EVENT_CHANNELS, IPC_REQUESTS, createIpcRequests } = require('../src/main/ipc-contract');
  const { HostClient } = require('../src/main/host-client');
  const preload = fs.readFileSync(path.join(root, 'src', 'js', 'preload.js'), 'utf8');
  const electron = fs.readFileSync(path.join(root, 'src', 'electron.js'), 'utf8');
  const calls = [];
  const api = createIpcRequests((channel, ...args) => calls.push([channel, ...args]));
  assert.equal(new Set(IPC_REQUESTS.map((entry) => entry.api)).size, IPC_REQUESTS.length);
  assert.equal(new Set(IPC_REQUESTS.map((entry) => entry.channel)).size, IPC_REQUESTS.length);
  assert.deepEqual(IPC_REQUESTS.filter((entry) => typeof HostClient.prototype[entry.method] !== 'function'), []);
  assert.equal(IPC_EVENT_CHANNELS.includes('snapshot'), true);
  assert.match(preload, /createIpcRequests/u);
  assert.match(electron, /for \(const request of IPC_REQUESTS\)/u);
  const specialRequests = [...preload.matchAll(/ipcRenderer\.invoke\('([^']+)'/gu)].map((match) => match[1]);
  const specialHandlers = [...electron.matchAll(/ipcMain\.handle\('([^']+)'/gu)].map((match) => match[1]);
  assert.deepEqual(specialRequests.toSorted(), specialHandlers.toSorted());
  api.execute('ping', 'primary');
  assert.deepEqual(calls, [['mineprompt:execute', 'ping', 'primary']]);
});

test('inventory texture map resolves representative item types', () => {
  const map = require('../src/js/item-texture-map');
  const { ItemTextureResolver } = require('../src/js/item-texture-resolver');
  const resolver = new ItemTextureResolver(map);
  assert.equal(map.shield, 'faithful/blocks/dark_oak_planks');
  assert.equal(map.oak_stairs, 'faithful/blocks/oak_planks');
  assert.equal(map.player_head, 'heads/wood_question');
  assert.equal(resolver.candidates('stone').candidates[0].source, 'img/faithful/blocks/stone.png');
  assert.equal(resolver.candidates('cobblestone').candidates[0].source, 'img/faithful/blocks/cobblestone.png');
  assert.equal(resolver.candidates('candle').candidates[0].source, 'img/faithful/items/candle.png');
  for (const target of Object.values(map)) {
    assert.equal(fs.existsSync(path.join(root, 'src', 'img', `${target}.png`)), true, `Missing texture ${target}`);
  }
});

test('includes every dynamic Faithful interface texture', () => {
  const gui = path.join(root, 'src', 'img', 'faithful', 'gui');
  const assets = [
    ...['pink', 'blue', 'red', 'green', 'yellow', 'purple', 'white'].flatMap((color) => [`boss_bar/${color}_background.png`, `boss_bar/${color}_progress.png`]),
    ...[6, 10, 12, 20].flatMap((count) => [`boss_bar/notched_${count}_background.png`, `boss_bar/notched_${count}_progress.png`]),
    'hud/air.png',
    'hud/air_bursting.png',
    'hud/air_empty.png',
    'hud/effect_background.png',
    'hud/effect_background_ambient.png',
    'hud/hotbar.png',
    'workstation/brewing_bubbles.png',
    'workstation/brewing_fuel.png',
    'workstation/brewing_progress.png',
    'workstation/furnace_burn.png',
    'workstation/furnace_lit.png'
  ];
  assert.deepEqual(assets.filter((asset) => !fs.existsSync(path.join(gui, asset))), []);
});
