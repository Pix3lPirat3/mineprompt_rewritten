'use strict';

const INVENTORY_ACTIONS = new Set(['inspect', 'equip', 'select', 'use', 'drop']);
const CONTAINER_ACTIONS = new Set(['inspect', 'take', 'deposit', 'quick-move', 'click', 'close']);
const DESTINATIONS = new Set(['hand', 'head', 'torso', 'legs', 'feet', 'off-hand']);
const QUANTITIES = new Set(['one', 'stack', 'all']);

function itemName(item) {
  return item.displayName || item.name;
}

function itemMatches(left, right) {
  return left.type === right.type && left.metadata === right.metadata && JSON.stringify(left.nbt ?? null) === JSON.stringify(right.nbt ?? null);
}

class InventoryService {
  constructor({ getClient, onChange = () => {} }) {
    this.getClient = getClient;
    this.onChange = onChange;
    this.pending = Promise.resolve();
  }

  client() {
    const client = this.getClient();
    if (!client?.bot?.entity) throw new Error('An active connection is required.');
    return client;
  }

  window(scope, bot) {
    if (scope === 'container') {
      if (!bot.currentWindow) throw new Error('No container is open.');
      return bot.currentWindow;
    }
    return bot.currentWindow || bot.inventory;
  }

  items(scope, bot = this.client().bot) {
    const window = this.window(scope, bot);
    return scope === 'container' ? window.containerItems() : window.items();
  }

  selectors(scope) {
    const items = this.items(scope);
    return [...new Set(items.flatMap((item) => [String(item.slot), item.name]))];
  }

  findItem(scope, selector, bot) {
    const requested = String(selector ?? '').trim();
    if (!requested) throw new Error('Choose an item name or slot.');
    const items = this.items(scope, bot);
    const slot = /^\d+$/u.test(requested) ? Number(requested) : null;
    const item = slot === null
      ? items.find((entry) => entry.name.toLowerCase() === requested.toLowerCase() || itemName(entry).toLowerCase() === requested.toLowerCase())
      : items.find((entry) => entry.slot === slot);
    if (!item) throw new Error(`No item was found for ${requested}.`);
    return item;
  }

  validate(request, client) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw new TypeError('Inventory action details are required.');
    const scope = String(request.scope || '').toLowerCase();
    const action = String(request.action || '').toLowerCase();
    if (!['inventory', 'container'].includes(scope)) throw new Error('Inventory action scope is invalid.');
    const actions = scope === 'inventory' ? INVENTORY_ACTIONS : CONTAINER_ACTIONS;
    if (!actions.has(action)) throw new Error(`The ${action || 'requested'} action is not available for ${scope}.`);
    if (request.connectionId !== undefined && Number(request.connectionId) !== client.connectionAttempt) throw new Error('This inventory view belongs to an earlier connection.');
    if (request.windowId !== undefined) {
      const currentWindowId = client.bot.currentWindow?.id ?? null;
      if (request.windowId !== currentWindowId) throw new Error('The open container changed before the action could run.');
    }
    return { scope, action };
  }

  execute(request) {
    const operation = this.pending.then(async () => {
      try {
        return await this.perform(request);
      } finally {
        this.onChange();
      }
    });
    this.pending = operation.catch(() => {});
    return operation;
  }

  async perform(request) {
    const client = this.client();
    const bot = client.bot;
    const { scope, action } = this.validate(request, client);
    if (action === 'close') {
      bot.closeWindow(bot.currentWindow);
      return { message: '[Container] Closed the active container.' };
    }
    if (action === 'select') return this.select(request, bot);
    if (action === 'use') return this.use(request, bot);
    if (action === 'equip') return this.equip(request, bot);
    if (action === 'drop') return this.drop(request, bot);
    if (action === 'quick-move') return this.quickMove(request, bot);
    if (action === 'click') return this.click(request, bot);
    if (action === 'take' || action === 'deposit') return this.transfer(request, bot, action);
    const item = this.findItem(scope, request.target, bot);
    return { message: `[${scope === 'container' ? 'Container' : 'Inventory'}] ${itemName(item)}\nName: ${item.name}\nCount: ${item.count}\nSlot: ${item.slot}` };
  }

  ensureInventoryOnly(bot) {
    if (bot.currentWindow) throw new Error('Close the active container before using that inventory action.');
  }

  select(request, bot) {
    const slot = Number(request.target);
    if (!Number.isInteger(slot) || slot < 0 || slot > 8) throw new Error('Hotbar slot must be an integer from 0 to 8.');
    bot.setQuickBarSlot(slot);
    return { message: `[Inventory] Selected hotbar slot ${slot}.` };
  }

  async equip(request, bot) {
    this.ensureInventoryOnly(bot);
    const item = this.findItem('inventory', request.target, bot);
    const destination = String(request.destination || 'hand').toLowerCase();
    if (!DESTINATIONS.has(destination)) throw new Error(`Equipment destination must be ${[...DESTINATIONS].join(', ')}.`);
    await bot.equip(item, destination);
    return { message: `[Inventory] Equipped ${itemName(item)} to ${destination}.` };
  }

  async use(request, bot) {
    this.ensureInventoryOnly(bot);
    const hand = String(request.hand || 'mainhand').toLowerCase();
    if (!['mainhand', 'offhand'].includes(hand)) throw new Error('Hand must be mainhand or offhand.');
    let item = hand === 'offhand' ? bot.inventory.slots[bot.getEquipmentDestSlot('off-hand')] : bot.heldItem;
    if (request.target !== undefined && request.target !== '') {
      item = this.findItem('inventory', request.target, bot);
      await bot.equip(item, hand === 'offhand' ? 'off-hand' : 'hand');
    }
    if (!item) throw new Error(`The ${hand === 'offhand' ? 'off hand' : 'main hand'} is empty.`);
    bot.activateItem(hand === 'offhand');
    return { message: `[Inventory] Used ${itemName(item)} from the ${hand === 'offhand' ? 'off hand' : 'main hand'}.` };
  }

  quantity(request, item, matchingItems) {
    const quantity = String(request.quantity || 'stack').toLowerCase();
    if (!QUANTITIES.has(quantity)) throw new Error('Quantity must be one, stack, or all.');
    if (quantity === 'one') return 1;
    if (quantity === 'stack') return item.count;
    return matchingItems.filter((entry) => itemMatches(entry, item)).reduce((total, entry) => total + entry.count, 0);
  }

  async drop(request, bot) {
    this.ensureInventoryOnly(bot);
    const target = String(request.target ?? '').toLowerCase();
    const quantity = String(request.quantity || 'stack').toLowerCase();
    if ((target === 'all' || quantity === 'all') && request.confirmed !== true) throw new Error('Confirm this action by adding confirm to the command.');
    if (target === 'all') {
      const items = [...bot.inventory.items()];
      for (const item of items) {
        await this.move(bot, bot.inventory, item, item.count, -999, null);
      }
      return { message: `[Inventory] Dropped ${items.length} stack${items.length === 1 ? '' : 's'}.` };
    }
    const item = this.findItem('inventory', request.target, bot);
    const count = this.quantity(request, item, bot.inventory.items());
    const sourceEnd = quantity === 'all' ? bot.inventory.inventoryEnd : item.slot + 1;
    const sourceStart = quantity === 'all' ? bot.inventory.inventoryStart : item.slot;
    await bot.transfer({
      window: bot.inventory,
      itemType: item.type,
      metadata: item.metadata,
      nbt: item.nbt,
      count,
      sourceStart,
      sourceEnd,
      destStart: -999
    });
    return { message: `[Inventory] Dropped ${count} x ${itemName(item)}.` };
  }

  async move(bot, window, item, count, destStart, destEnd) {
    await bot.transfer({
      window,
      itemType: item.type,
      metadata: item.metadata,
      nbt: item.nbt,
      count,
      sourceStart: item.slot,
      sourceEnd: item.slot + 1,
      destStart,
      destEnd
    });
  }

  async quickMove(request, bot) {
    const window = this.window('container', bot);
    const item = this.findItem('container', request.target, bot);
    await bot.clickWindow(item.slot, 0, 1);
    return { message: `[Container] Quick-moved ${itemName(item)}.` };
  }

  async click(request, bot) {
    const window = this.window('container', bot);
    const slot = Number(request.target);
    const button = String(request.button || 'left').toLowerCase();
    if (!Number.isInteger(slot) || slot < 0 || slot >= window.slots.length) throw new Error('Container slot is out of range.');
    if (!['left', 'right'].includes(button)) throw new Error('Mouse button must be left or right.');
    const item = window.slots[slot];
    await bot.clickWindow(slot, button === 'left' ? 0 : 1, 0);
    return { message: `[Container] ${button === 'left' ? 'Left' : 'Right'}-clicked ${item ? itemName(item) : 'empty slot'} at ${slot}.` };
  }

  async transfer(request, bot, direction) {
    const window = this.window('container', bot);
    const sourceScope = direction === 'take' ? 'container' : 'inventory';
    const target = String(request.target ?? '').toLowerCase();
    if (direction === 'deposit' && target === 'all') {
      if (request.confirmed !== true) throw new Error('Confirm this action by adding confirm to the command.');
      const items = [...window.items()];
      for (const item of items) {
        await this.move(bot, window, item, item.count, 0, window.inventoryStart);
      }
      return { message: `[Container] Deposited ${items.length} inventory stack${items.length === 1 ? '' : 's'}.` };
    }
    const item = this.findItem(sourceScope, request.target, bot);
    const sourceItems = this.items(sourceScope, bot);
    const count = this.quantity(request, item, sourceItems);
    const allMatching = String(request.quantity || 'stack').toLowerCase() === 'all';
    const options = {
      window,
      itemType: item.type,
      metadata: item.metadata,
      nbt: item.nbt,
      count,
      sourceStart: allMatching ? (direction === 'take' ? 0 : window.inventoryStart) : item.slot,
      sourceEnd: allMatching ? (direction === 'take' ? window.inventoryStart : window.inventoryEnd) : item.slot + 1,
      destStart: direction === 'take' ? window.inventoryStart : 0,
      destEnd: direction === 'take' ? window.inventoryEnd : window.inventoryStart
    };
    await bot.transfer(options);
    return { message: `[Container] ${direction === 'take' ? 'Took' : 'Deposited'} ${count} x ${itemName(item)}.` };
  }
}

module.exports = { DESTINATIONS, InventoryService, QUANTITIES, itemName };
