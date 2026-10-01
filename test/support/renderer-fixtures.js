'use strict';

const ChatMessage = require('prismarine-chat')('1.21.5');
const { serializeItem } = require('../../src/main/inventory-model');

function serializedItem(overrides = {}) {
  const source = {
    slot: 0,
    name: 'stone',
    displayName: 'Stone',
    customName: null,
    count: 1,
    maxDurability: 0,
    durabilityUsed: 0,
    enchants: [],
    customLore: [],
    metadata: 0,
    stackSize: 64,
    repairCost: 0,
    customModel: null,
    components: [],
    nbt: null,
    ...overrides
  };
  return serializeItem(source, -1, -1, ChatMessage);
}

function inventorySnapshot(source, { inventoryItem, containerItem }) {
  const snapshot = structuredClone(source);
  const player = { ...inventoryItem, slot: 36, hotbarIndex: 0 };
  const container = { ...containerItem, slot: 0, hotbarIndex: null };
  const inventorySlots = Array(46).fill(null);
  const containerSlots = Array(27).fill(null);
  inventorySlots[player.slot] = player;
  containerSlots[container.slot] = container;
  snapshot.state = { ...snapshot.state, status: 'online', username: 'TestBot', displayName: 'TestBot' };
  snapshot.session = {
    ...snapshot.session,
    username: 'TestBot',
    windowId: 4,
    containerOpen: true,
    inventory: [player],
    inventorySlots,
    inventoryLayout: { kind: 'player', inventoryStart: 9, inventoryEnd: 46, hotbarStart: 36, selectedHotbar: 0 },
    container: [container],
    containerSlots,
    containerLayout: {
      id: 4,
      type: 'minecraft:generic_9x3',
      kind: 'storage',
      title: 'Chest',
      columns: 9,
      slotCount: 27,
      inventoryStart: 27,
      inventoryEnd: 63,
      hotbarStart: 54,
      slotRoles: Array(27).fill('storage'),
      capabilities: { recipes: false, trades: false, progress: false, operations: [] },
      properties: {},
      trades: [],
      workstation: { fuel: null, progress: null, enchantments: [] }
    }
  };
  const selected = snapshot.sessions.find((session) => session.id === snapshot.selectedSessionId);
  if (selected) {
    selected.state = snapshot.state;
    selected.session = snapshot.session;
  }
  return snapshot;
}

module.exports = { inventorySnapshot, serializedItem };
