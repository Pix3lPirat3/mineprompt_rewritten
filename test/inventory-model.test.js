'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ChatMessage = require('prismarine-chat')('1.21.5');
const { WINDOW_TYPES, defaultWindowTitle, describeWindow, serializeItem, tooltipDisplay, windowDefinition } = require('../src/main/inventory-model');

test('describes supported inventory window families', () => {
  const furnace = describeWindow({
    id: 3,
    type: 'minecraft:furnace',
    inventoryStart: 3,
    inventoryEnd: 39,
    hotbarStart: 30
  }, 'Furnace');
  assert.deepEqual(furnace, {
    id: 3,
    type: 'minecraft:furnace',
    kind: 'furnace',
    title: 'Furnace',
    columns: 3,
    slotCount: 3,
    inventoryStart: 3,
    inventoryEnd: 39,
    hotbarStart: 30,
    slotRoles: ['input', 'fuel', 'result'],
    capabilities: { recipes: false, trades: false, progress: true, operations: ['put-input', 'put-fuel', 'take-input', 'take-fuel', 'take-output'] },
    trades: [],
    workstation: { fuel: null, progress: null, enchantments: [] }
  });
  assert.equal(windowDefinition({ type: 'minecraft:brewing_stand' }).id, 'brewing');
  assert.equal(describeWindow({ type: 'minecraft:generic_9x6', inventoryStart: 54 }).kind, 'storage');
  assert.equal(defaultWindowTitle({ type: 'minecraft:generic_9x6', inventoryStart: 54 }), 'Large Chest');
  assert.equal(WINDOW_TYPES.some((definition) => definition.id === 'merchant'), true);
});

test('serializes live workstation state', () => {
  const furnace = describeWindow({ type: 'minecraft:furnace', inventoryStart: 3, fuel: 0.5, progress: 0.25 });
  const enchanting = describeWindow({ type: 'minecraft:enchanting_table', inventoryStart: 2, enchantments: [{ level: 4 }, { level: -1 }] });
  assert.deepEqual(furnace.workstation, { fuel: 0.5, progress: 0.25, enchantments: [] });
  assert.deepEqual(enchanting.workstation.enchantments, [
    { index: 0, level: 4, available: true },
    { index: 1, level: -1, available: false }
  ]);
  assert.deepEqual(describeWindow({ type: 'minecraft:anvil', inventoryStart: 3 }).capabilities.operations, ['combine', 'rename']);
});

test('falls back to a bounded generic window layout', () => {
  const description = describeWindow({ type: 'modded:custom', inventoryStart: 12 });
  assert.equal(description.kind, 'generic');
  assert.equal(description.columns, 9);
  assert.equal(description.slotCount, 12);
});

test('serializes names, lore, enchantments, durability, and bounded component metadata', () => {
  const item = serializeItem({
    slot: 4,
    name: 'diamond_pickaxe',
    displayName: 'Diamond Pickaxe',
    customName: '{"text":"Quarry Pick","color":"gold","bold":true}',
    customLore: ['{"text":"Built for deep work","color":"aqua","italic":false}', 'Keep dry'],
    count: 1,
    metadata: 2,
    maxDurability: 1561,
    durabilityUsed: 41,
    stackSize: 1,
    repairCost: 3,
    customModel: 42,
    enchants: [{ name: 'efficiency', lvl: 5 }, { name: 'minecraft:unbreaking', lvl: 3 }],
    components: [
      { type: 'custom_name', data: '{"text":"Quarry Pick","color":"gold"}' },
      { type: 'lore', data: ['{"text":"Built for deep work"}'] },
      { type: 'custom_data', data: { type: 'compound', value: { owner: { type: 'string', value: 'Miner' } } } }
    ],
    nbt: { value: { Damage: {}, display: {} } }
  }, -1, -1, ChatMessage);
  assert.equal(item.displayName, 'Quarry Pick');
  assert.match(item.displayNameHtml, /color:#FFAA00/u);
  assert.match(item.displayNameHtml, /font-weight:900/u);
  assert.equal(item.durabilityRemaining, 1520);
  assert.deepEqual(item.lore, ['Built for deep work', 'Keep dry']);
  assert.match(item.loreHtml[0], /color:#55FFFF/u);
  assert.deepEqual(item.enchantments.map((entry) => [entry.displayName, entry.level]), [['Efficiency', 5], ['Unbreaking', 3]]);
  assert.deepEqual(item.components, ['custom_name', 'lore', 'custom_data']);
  assert.deepEqual(item.componentDetails, [{ name: 'custom_data', displayName: 'Custom Data', value: '{"owner":"Miner"}' }]);
  assert.deepEqual(item.nbtKeys, ['Damage', 'display']);
  assert.deepEqual(item.dataTags, [{ name: 'Damage', value: '{}' }, { name: 'display', value: '{}' }]);
});

test('interprets tooltip display policy without exposing its protocol object', () => {
  const registry = {
    protocol: {
      types: {
        SlotComponentType: ['mapper', { mappings: { 8: 'lore', 13: 'attribute_modifiers', 15: 'tooltip_display' } }]
      }
    }
  };
  const item = serializeItem({
    slot: 36,
    name: 'diamond_sword',
    displayName: 'Diamond Sword',
    count: 1,
    components: [
      { type: 'tooltip_display', data: { hideTooltip: false, hiddenComponents: [8, 13] } },
      { type: 'attribute_modifiers', data: [{ amount: 7 }] },
      { type: 'custom_data', data: { forged: true } }
    ]
  }, -1, -1, ChatMessage, registry);
  assert.deepEqual(item.tooltipDisplay, { hidden: false, hiddenComponents: ['lore', 'attribute_modifiers'] });
  assert.equal(item.componentDetails.some((component) => component.name === 'tooltip_display'), false);
  assert.equal(item.componentDetails.some((component) => component.name === 'attribute_modifiers'), false);
  assert.equal(item.componentDetails.some((component) => component.name === 'custom_data'), true);
  assert.deepEqual(tooltipDisplay([{ type: 'hide_tooltip' }]), { hidden: true, hiddenComponents: [] });
});
