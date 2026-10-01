'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const { attributeValue, createMineflayerUiState, emptyPresentation, foodSprite, formatDuration, heartSprite, hud, mineflayerUiPlugin, textValue } = require('../packages/mineflayer-ui');

function fakeBot() {
  const bot = new EventEmitter();
  bot.health = 17;
  bot.food = 14;
  bot.foodSaturation = 4;
  bot.oxygenLevel = 12;
  bot.absorptionAmount = 3;
  bot.quickBarSlot = 2;
  bot.usingHeldItem = false;
  bot.experience = { level: 8, progress: 0.5, points: 140 };
  bot.game = { gameMode: 'survival', dimension: 'overworld', hardcore: false };
  bot.entity = { attributes: { 'minecraft:generic.max_health': { value: 24 }, 'minecraft:generic.armor': { value: 6 } } };
  bot.bossBars = { dragon: { entityUUID: 'dragon', title: 'Ender Dragon', health: 0.75, dividers: 10, color: 'purple', shouldDarkenSky: true, isDragonBar: true } };
  bot.scoreboard = { sidebar: { name: 'match', title: 'Scores', items: [{ name: 'Bot', displayName: 'Bot', value: 9 }] } };
  return bot;
}

test('normalizes reusable Mineflayer presentation state', () => {
  const state = createMineflayerUiState(fakeBot());
  const snapshot = state.snapshot();
  assert.equal(snapshot.hud.health, 17);
  assert.equal(snapshot.hud.maxHealth, 24);
  assert.equal(snapshot.hud.oxygen, 12);
  assert.equal(snapshot.bossBars[0].progress, 0.75);
  assert.equal(snapshot.scoreboard.items[0].value, 9);
  state.close();
});

test('flattens raw Minecraft chat components without object placeholders', () => {
  assert.equal(textValue({ text: 'Round ', extra: [{ text: 'One' }] }), 'Round One');
  assert.equal(textValue('{"text":"Lobby","extra":[{"text":" #2"}]}'), 'Lobby #2');
  const bot = fakeBot();
  bot.scoreboard.sidebar.title = { text: 'Survival ', extra: [{ text: 'Scores' }] };
  bot.scoreboard.sidebar.items[0].displayName = { text: 'Player ', extra: [{ text: 'One' }] };
  const state = createMineflayerUiState(bot);
  const snapshot = state.snapshot();
  assert.equal(snapshot.scoreboard.title, 'Survival Scores');
  assert.equal(snapshot.scoreboard.items[0].displayName, 'Player One');
  state.close();
});

test('suppresses an empty scoreboard surface', () => {
  const bot = fakeBot();
  bot.scoreboard.sidebar = { name: '', title: { text: '' }, items: [] };
  const state = createMineflayerUiState(bot);
  assert.equal(state.snapshot().scoreboard, null);
  state.close();
});

test('tracks overlays without stale timers clearing newer messages', () => {
  const bot = fakeBot();
  const timers = new Map();
  let nextTimer = 0;
  const state = createMineflayerUiState(bot, {
    schedule: (callback) => { const id = ++nextTimer; timers.set(id, callback); return id; },
    cancelSchedule: (id) => timers.delete(id)
  });
  bot.emit('title', 'First', 'title');
  bot.emit('title', 'Second', 'title');
  assert.equal(timers.size, 1);
  assert.equal(state.snapshot().overlay.title, 'Second');
  [...timers.values()][0]();
  assert.equal(state.snapshot().overlay.title, '');
  state.close();
});

test('provides stable texture helpers and disconnected state', () => {
  assert.equal(heartSprite('vehicle', 'empty'), 'vehicle_container');
  assert.equal(heartSprite('poisoned', 'half', true), 'poisoned_hardcore_half');
  assert.equal(foodSprite('full', true), 'full_hunger');
  assert.equal(formatDuration(1220), '1:01');
  assert.equal(emptyPresentation().hud.oxygen, 20);
  assert.equal(attributeValue(null, 'armor', 7), 7);
  assert.equal(attributeValue(new Map([['generic.armor', { value: 4, modifiers: null }]]), 'armor'), 4);
  assert.equal(hud({ entity: { attributes: null } }).armor, 0);
});

test('loads as a Mineflayer plugin and supports independent subscribers', () => {
  const bot = fakeBot();
  mineflayerUiPlugin(bot);
  const snapshots = [];
  const unsubscribe = bot.mineflayerUi.subscribe((snapshot) => snapshots.push(snapshot));
  bot.health = 6;
  bot.emit('health');
  assert.equal(snapshots.length, 2);
  assert.equal(snapshots[1].hud.health, 6);
  unsubscribe();
  bot.mineflayerUi.close();
});

test('contains presentation snapshot failures inside the UI adapter', () => {
  const bot = fakeBot();
  const errors = [];
  const state = createMineflayerUiState(bot, { onError: (error) => errors.push(error) });
  Object.defineProperty(bot, 'bossBars', { get: () => { throw new Error('Unavailable presentation state'); } });
  assert.doesNotThrow(() => bot.emit('health'));
  assert.equal(errors[0].message, 'Unavailable presentation state');
  state.close();
});

test('keeps ESM and CommonJS package exports in sync', async () => {
  const commonJs = require('../packages/mineflayer-ui');
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '..', 'packages', 'mineflayer-ui', 'index.js'));
  const esm = await import(moduleUrl.href);
  assert.deepEqual(Object.keys(esm).toSorted(), Object.keys(commonJs).toSorted());
  assert.deepEqual(esm.emptyPresentation(), commonJs.emptyPresentation());
});
