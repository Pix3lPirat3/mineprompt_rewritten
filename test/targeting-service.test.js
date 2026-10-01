'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { TargetingService } = require('../src/main/targeting-service');
const { miningDirection } = require('../src/main/mining-service');

function fixture() {
  const calls = [];
  const activities = {
    values: new Map(),
    has(id) { return this.values.has(id); },
    register(id, value) { this.values.set(id, value); calls.push(['activity', id, value]); },
    stop(id) {
      const value = this.values.get(id);
      if (!value) return false;
      this.values.delete(id);
      value.stop();
      return true;
    }
  };
  const pickaxe = { slot: 10, name: 'iron_pickaxe', type: 1, nbt: { value: { Damage: { value: 2 } } } };
  const block = {
    name: 'stone',
    displayName: 'Stone',
    position: new Vec3(3, 64, 0),
    diggable: true,
    hardness: 1.5,
    harvestTools: { 1: true },
    canHarvest: (type) => type === 1
  };
  const item = {
    id: 2,
    type: 'object',
    name: 'item',
    displayName: 'Item',
    isValid: true,
    position: new Vec3(2, 64, 1),
    getDroppedItem: () => ({ name: 'cobblestone', displayName: 'Cobblestone', count: 12 })
  };
  const villager = { id: 3, type: 'mob', name: 'villager', displayName: 'Villager', isValid: true, position: new Vec3(3, 64, 1), height: 1.8 };
  const friendEntity = { id: 4, type: 'player', name: 'player', username: 'Friend', isValid: true, position: new Vec3(2, 64, 0), height: 1.8 };
  const textDisplay = { id: 5, type: 'other', name: 'text_display', displayName: 'Text Display', isValid: true, position: new Vec3(2, 65, 2), metadata: [{ text: 'Market', extra: [{ text: ' open' }] }] };
  const self = { id: 1, type: 'player', username: 'Bot', position: new Vec3(0, 64, 0), height: 1.8, eyeHeight: 1.62 };
  const bot = {
    username: 'Bot',
    entity: self,
    entities: { 1: self, 2: item, 3: villager, 4: friendEntity, 5: textDisplay },
    players: { Friend: { username: 'Friend', uuid: 'friend-id', entity: friendEntity } },
    registry: {
      itemsByName: { iron_pickaxe: { maxDurability: 250 } },
      entitiesByName: { text_display: { metadataKeys: ['text'] } },
      version: { '<': () => false }
    },
    inventory: { items: () => [pickaxe] },
    heldItem: null,
    lastOptions: { host: 'example.test' },
    pathfinder: {
      bestHarvestTool: () => pickaxe,
      goto: async (goal) => calls.push(['goto', goal])
    },
    blockAtCursor: () => block,
    entityAtCursor: () => villager,
    blockAt: () => block,
    lookAt: async (position) => calls.push(['look', position]),
    openVillager: async (entity) => calls.push(['villager', entity]),
    activateEntity: async (entity) => calls.push(['interact', entity]),
    useOn: async (entity) => calls.push(['use', entity]),
    activateBlock: async (target) => calls.push(['block', target]),
    attack: async (entity) => calls.push(['attack', entity]),
    equip: async (tool) => calls.push(['equip', tool]),
    dig: async (target) => calls.push(['dig', target])
  };
  const playerActions = {
    isFriend: (player) => player.username === 'Friend',
    execute: async (request, context) => {
      calls.push(['player-action', request, context.origin]);
      return { message: '[Combat] Protected action dispatched.' };
    }
  };
  const service = new TargetingService({
    getClient: () => ({ bot }),
    activities,
    playerActions,
    trees: {
      inspect: (request) => { calls.push(['tree-inspect', request]); return { message: '[Tree] Oak plan.' }; },
      start: (request) => { calls.push(['tree-start', request]); return { currentTree: { species: 'oak' } }; }
    },
    stash: {
      start: (request) => {
        calls.push(['stash', request]);
        return { containerPosition: { x: 4, y: 64, z: 0 } };
      }
    },
    logger: { warn: (message) => calls.push(['warn', message]) }
  });
  return { activities, block, bot, calls, friendEntity, item, service, textDisplay, villager };
}

test('describes cursor and nearby targets with contextual actions', () => {
  const { service } = fixture();
  const snapshot = service.snapshot(16);
  assert.equal(snapshot.cursorBlock.displayName, 'Stone');
  assert.equal(snapshot.cursorEntity.kind, 'villager');
  assert.equal(snapshot.entities.find((entity) => entity.kind === 'item').count, 12);
  assert.equal(snapshot.entities.find((entity) => entity.kind === 'item').actions.some((action) => action.id === 'entity.stash'), true);
  const friend = snapshot.entities.find((entity) => entity.username === 'Friend');
  assert.equal(friend.friend, true);
  assert.equal(friend.actions.find((action) => action.id === 'entity.attack').enabled, false);
  assert.equal(snapshot.cursorEntity.actions.some((action) => action.id === 'entity.trade'), true);
  assert.equal(snapshot.entities.find((entity) => entity.name === 'text_display').text, 'Market open');
});

test('includes display entity text in inspection output', async () => {
  const { service, textDisplay } = fixture();
  const result = await service.execute({ actionId: 'entity.inspect', entityId: textDisplay.id });
  assert.match(result.message, /Text: Market open/u);
});

test('keeps partial dropped-item entities from crashing snapshots', () => {
  const { bot, service } = fixture();
  bot.entities[6] = {
    id: 6,
    type: 'object',
    name: 'item',
    displayName: 'Item',
    position: new Vec3(1, 64, 1),
    getDroppedItem: () => { throw new TypeError('metadata not present'); }
  };
  const snapshot = service.snapshot(16);
  const partial = snapshot.entities.find((entity) => entity.id === 6);
  assert.equal(partial.displayName, 'Item');
  assert.equal(partial.count, null);
});

test('runs entity, villager, block, and relationship-aware actions', async () => {
  const { calls, service } = fixture();
  await service.execute({ actionId: 'entity.pickup', entityId: 2 });
  await service.execute({ actionId: 'entity.stash', entityId: 2 });
  await service.execute({ actionId: 'entity.trade', entityId: 3 });
  await service.execute({ actionId: 'entity.activate', entityId: 3 });
  await service.execute({ actionId: 'entity.useitem', entityId: 3 });
  await service.execute({ actionId: 'entity.attack', entityId: 4, overrideFriendProtection: true }, { type: 'terminal' });
  await service.execute({ actionId: 'block.activate', target: 'cursor' });
  await service.execute({ actionId: 'block.dig', target: 'cursor' });
  assert.equal(calls.some((entry) => entry[0] === 'goto'), true);
  assert.equal(calls.some((entry) => entry[0] === 'stash' && entry[1].mode === 'nearby'), true);
  assert.equal(calls.some((entry) => entry[0] === 'villager'), true);
  assert.equal(calls.some((entry) => entry[0] === 'interact'), true);
  assert.equal(calls.some((entry) => entry[0] === 'use'), true);
  assert.equal(calls.some((entry) => entry[0] === 'player-action' && entry[1].overrideFriendProtection), true);
  assert.equal(calls.some((entry) => entry[0] === 'block'), true);
  assert.equal(calls.some((entry) => entry[0] === 'equip'), true);
  assert.equal(calls.some((entry) => entry[0] === 'dig'), true);
});

test('locks consistent mining to an exact position and bounded depth', async () => {
  const { activities, block, bot, service } = fixture();
  assert.deepEqual(miningDirection(bot, block), new Vec3(1, 0, 0));
  const exact = await service.execute({ actionId: 'block.mine-exact', target: 'cursor' });
  assert.match(exact.message, /locked block/u);
  assert.match(activities.values.get('consistentmine').detail, /1 locked block/u);
  activities.stop('consistentmine');
  const depth = await service.execute({ actionId: 'block.mine-depth', target: 'cursor', depth: 4 });
  assert.match(depth.message, /4 locked blocks/u);
  assert.match(activities.values.get('consistentmine').detail, /4 locked blocks/u);
  activities.stop('consistentmine');
});

test('exposes tree-only block actions through the shared tree service', async () => {
  const { block, calls, service } = fixture();
  block.name = 'oak_log';
  block.displayName = 'Oak Log';
  const described = service.describeBlock(block);
  assert.deepEqual(described.tree, { species: 'oak', part: 'log' });
  assert.equal(described.actions.some((action) => action.id === 'block.tree-fell'), true);
  await service.execute({ actionId: 'block.tree-inspect', target: 'cursor' });
  await service.execute({ actionId: 'block.tree-fell', target: 'cursor' });
  assert.equal(calls.some((entry) => entry[0] === 'tree-inspect'), true);
  assert.equal(calls.some((entry) => entry[0] === 'tree-start'), true);
});
