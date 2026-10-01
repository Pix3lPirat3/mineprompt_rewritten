'use strict';

const ENTITY_ACTIONS = Object.freeze([
  { id: 'entity.inspect', label: 'View entity details', detail: 'entities <target> inspect' },
  { id: 'entity.goto', label: 'Go to entity', detail: 'entities <target> goto | pathfinder.goto' },
  { id: 'entity.look', label: 'Look at entity', detail: 'entities <target> look | bot.lookAt' },
  { id: 'entity.pickup', label: 'Collect dropped item', detail: 'entities <target> pickup | pathfinder.goto', kinds: ['item'] },
  { id: 'entity.stash', label: 'Collect nearby items and stash', detail: 'stash nearby | bot.openContainer', kinds: ['item'] },
  { id: 'entity.trade', label: 'Open villager trades', detail: 'entities <target> trade | bot.openVillager', kinds: ['villager'] },
  { id: 'entity.activate', label: 'Interact with entity', detail: 'entities <target> activate | bot.activateEntity', excludes: ['item'] },
  { id: 'entity.useitem', label: 'Use held item on entity', detail: 'entities <target> useitem | bot.useOn', excludes: ['item'] },
  { id: 'entity.attack', label: 'Attack entity', detail: 'entities <target> attack | bot.attack', excludes: ['item'], danger: true }
]);

const BLOCK_ACTIONS = Object.freeze([
  { id: 'block.inspect', label: 'View block details', detail: 'target block inspect' },
  { id: 'block.goto', label: 'Go to block', detail: 'target block goto | pathfinder.goto' },
  { id: 'block.look', label: 'Look at block', detail: 'target block look | bot.lookAt' },
  { id: 'block.activate', label: 'Use block', detail: 'target block activate | bot.activateBlock' },
  { id: 'block.dig', label: 'Mine once', detail: 'target block dig | bot.dig', danger: true },
  { id: 'block.mine-exact', label: 'Repeat this block', detail: 'target block mine 1', danger: true },
  { id: 'block.mine-held', label: 'Repeat until held tool is low', detail: 'target block mine 1 --tool held --low stop', danger: true },
  { id: 'block.mine-depth', label: 'Repeat 4 deep', detail: 'target block mine 4', danger: true },
  { id: 'block.tree-inspect', label: 'Inspect tree plan', detail: 'tree inspect cursor', treesOnly: true },
  { id: 'block.tree-fell', label: 'Fell this tree', detail: 'tree fell cursor', treesOnly: true, danger: true }
]);

const ENTITY_COMMAND_ACTIONS = Object.freeze({
  inspect: 'entity.inspect',
  goto: 'entity.goto',
  look: 'entity.look',
  pickup: 'entity.pickup',
  stash: 'entity.stash',
  trade: 'entity.trade',
  activate: 'entity.activate',
  interact: 'entity.activate',
  useitem: 'entity.useitem',
  use: 'entity.useitem',
  attack: 'entity.attack'
});

const BLOCK_COMMAND_ACTIONS = Object.freeze({
  inspect: 'block.inspect',
  goto: 'block.goto',
  look: 'block.look',
  activate: 'block.activate',
  open: 'block.activate',
  dig: 'block.dig',
  mine: 'block.mine',
  tree: 'block.tree-inspect',
  fell: 'block.tree-fell'
});

const ENTITY_ACTION_COMPLETIONS = Object.freeze(['inspect', 'goto', 'look', 'pickup', 'stash', 'trade', 'activate', 'useitem', 'attack']);
const BLOCK_ACTION_COMPLETIONS = Object.freeze(['inspect', 'goto', 'look', 'activate', 'dig', 'mine', 'tree', 'fell']);
const TARGET_ACTION_IDS = Object.freeze([...ENTITY_ACTIONS, ...BLOCK_ACTIONS].map((action) => action.id));

module.exports = {
  BLOCK_ACTION_COMPLETIONS,
  BLOCK_ACTIONS,
  BLOCK_COMMAND_ACTIONS,
  ENTITY_ACTION_COMPLETIONS,
  ENTITY_ACTIONS,
  ENTITY_COMMAND_ACTIONS,
  TARGET_ACTION_IDS
};
