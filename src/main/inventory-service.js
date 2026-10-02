'use strict';

const { serializeItem } = require('./inventory-model');
const { itemsMatch } = require('./item-identity');

const INVENTORY_ACTIONS = new Set(['inspect', 'equip', 'select', 'use', 'swing', 'drop']);
const CONTAINER_ACTIONS = new Set(['inspect', 'take', 'deposit', 'transfer', 'click', 'move', 'trade', 'workstation', 'close']);
const DESTINATIONS = new Set(['hand', 'head', 'torso', 'legs', 'feet', 'off-hand']);
const QUANTITIES = new Set(['one', 'half', 'stack', 'all']);

function itemName(item) {
  return item.displayName || item.name;
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
    return bot.inventory;
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
    if (request.expectedRevision !== undefined && Number(request.expectedRevision) !== client.inventoryEvents.revision) {
      throw new Error('The inventory changed before the action could run.');
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

  inspect(request = {}) {
    const client = this.client();
    const scope = String(request.scope || 'inventory').toLowerCase();
    if (!['inventory', 'container'].includes(scope)) throw new Error('Inventory inspection scope is invalid.');
    const item = this.findItem(scope, request.target, client.bot);
    const details = serializeItem(item, -1, -1, client.chatMessageClass, client.bot.registry);
    return { ok: true, message: this.inspectionMessage(scope, details), item: details };
  }

  inspectionMessage(scope, details) {
    const lines = [
      `[${scope === 'container' ? 'Container' : 'Inventory'}] ${details.displayName}`,
      `Name: ${details.name}`,
      `Identifier: minecraft:${details.name}`,
      `Count: ${details.count} / ${details.stackSize}`,
      `Slot: ${details.slot}`
    ];
    if (details.enchantments.length) lines.push(`Enchantments: ${details.enchantments.map((enchantment) => `${enchantment.displayName} ${enchantment.level}`).join(', ')}`);
    if (details.lore.length) lines.push(`Lore: ${details.lore.join(' | ')}`);
    if (details.maxDurability) lines.push(`Durability: ${details.durabilityRemaining} / ${details.maxDurability}`);
    if (details.tooltipDisplay.hidden) lines.push('Tooltip: hidden');
    if (details.tooltipDisplay.hiddenComponents.length) lines.push(`Hidden tooltip components: ${details.tooltipDisplay.hiddenComponents.join(', ')}`);
    if (details.componentDetails.length) lines.push(`Components: ${details.componentDetails.map((component) => `${component.displayName}: ${component.value}`).join(' | ')}`);
    if (details.dataTags.length) lines.push(`Data tags: ${details.dataTags.map((tag) => `${tag.name}: ${tag.value}`).join(' | ')}`);
    return lines.join('\n');
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
    if (action === 'swing') return this.swing(request, bot);
    if (action === 'equip') return this.equip(request, bot);
    if (action === 'drop') return this.drop(request, bot);
    if (action === 'transfer') return this.transferBetween(request, bot);
    if (action === 'click') return this.click(request, bot);
    if (action === 'move') return this.moveExact(request, bot);
    if (action === 'trade') return this.trade(request, bot);
    if (action === 'workstation') return this.workstation(request, bot);
    if (action === 'take' || action === 'deposit') return this.transfer(request, bot, action);
    const details = serializeItem(this.findItem(scope, request.target, bot), -1, -1, client.chatMessageClass, bot.registry);
    return { message: this.inspectionMessage(scope, details), item: details };
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

  async swing(request, bot) {
    this.ensureInventoryOnly(bot);
    const arm = String(request.arm || 'right').toLowerCase();
    if (!['left', 'right'].includes(arm)) throw new Error('Arm must be left or right.');
    let item = null;
    if (request.target !== undefined && request.target !== '') {
      item = this.findItem('inventory', request.target, bot);
      await bot.equip(item, arm === 'left' ? 'off-hand' : 'hand');
    }
    bot.swingArm(arm, request.showHand !== false);
    return { message: item ? `[Inventory] Swung ${itemName(item)} with the ${arm} arm.` : `[Inventory] Swung the ${arm} arm.` };
  }

  quantity(request, item, matchingItems) {
    const quantity = String(request.quantity || 'stack').toLowerCase();
    if (!QUANTITIES.has(quantity)) throw new Error('Quantity must be one, half, stack, or all.');
    if (quantity === 'one') return 1;
    if (quantity === 'half') return Math.ceil(item.count / 2);
    if (quantity === 'stack') return item.count;
    const cache = new WeakMap();
    return matchingItems.filter((entry) => itemsMatch(entry, item, cache)).reduce((total, entry) => total + entry.count, 0);
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
    if (quantity === 'all') {
      const cache = new WeakMap();
      const matches = bot.inventory.items().filter((entry) => itemsMatch(entry, item, cache));
      for (const entry of matches) await this.move(bot, bot.inventory, entry, entry.count, -999, null);
      return { message: `[Inventory] Dropped ${count} x ${itemName(item)}.` };
    }
    await bot.transfer({
      window: bot.inventory,
      itemType: item.type,
      metadata: item.metadata,
      nbt: item.nbt,
      count,
      sourceStart: item.slot,
      sourceEnd: item.slot + 1,
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

  async transferBetween(request, bot) {
    const window = this.window('container', bot);
    const sourceScope = request.sourceScope === 'inventory' ? 'inventory' : 'container';
    const item = this.findItem(sourceScope, request.target, bot);
    const slot = this.windowSlot(sourceScope, item.slot, window);
    const quantity = String(request.quantity || 'stack').toLowerCase();
    if (quantity === 'half' || quantity === 'one') {
      const count = quantity === 'one' ? 1 : Math.ceil(item.count / 2);
      await bot.transfer({
        window,
        itemType: item.type,
        metadata: item.metadata,
        nbt: item.nbt,
        count,
        sourceStart: slot,
        sourceEnd: slot + 1,
        destStart: sourceScope === 'container' ? window.inventoryStart : 0,
        destEnd: sourceScope === 'container' ? window.inventoryEnd : window.inventoryStart
      });
      return { message: `[Container] Moved ${count} x ${itemName(item)}.` };
    }
    await bot.clickWindow(slot, 0, 1);
    return { message: `[Container] Moved ${itemName(item)}.` };
  }

  windowSlot(scope, slot, window) {
    const value = Number(slot);
    if (!Number.isInteger(value)) throw new Error('Inventory slot must be an integer.');
    if (scope === 'container') {
      if (value < 0 || value >= window.inventoryStart) throw new Error('Container slot is out of range.');
      return value;
    }
    if (value < 9 || value > 44) throw new Error('That player slot is not available while a container is open.');
    return window.inventoryStart + value - 9;
  }

  async moveExact(request, bot) {
    const window = this.window('container', bot);
    const fromScope = request.fromScope === 'inventory' ? 'inventory' : 'container';
    const toScope = request.toScope === 'inventory' ? 'inventory' : 'container';
    if (fromScope === toScope && Number(request.fromSlot) === Number(request.toSlot)) return { message: '[Inventory] Item stayed in its current slot.' };
    const sourceItem = this.findItem(fromScope, request.fromSlot, bot);
    const source = this.windowSlot(fromScope, sourceItem.slot, window);
    const target = this.windowSlot(toScope, request.toSlot, window);
    const requestedCount = request.quantity === 'half' ? Math.ceil(sourceItem.count / 2) : request.quantity === 'one' ? 1 : Number(request.count ?? sourceItem.count);
    if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > sourceItem.count) throw new Error('Move count is out of range.');
    await bot.clickWindow(source, 0, 0);
    if (requestedCount === sourceItem.count) {
      await bot.clickWindow(target, 0, 0);
    } else {
      for (let index = 0; index < requestedCount; index += 1) await bot.clickWindow(target, 1, 0);
      await bot.clickWindow(source, 0, 0);
    }
    if (window.selectedItem) await bot.clickWindow(source, 0, 0);
    return { message: `[Inventory] Moved ${requestedCount} x ${itemName(sourceItem)}.` };
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

  async trade(request, bot) {
    const window = this.window('container', bot);
    const index = Number(request.tradeIndex);
    const count = Number(request.count ?? 1);
    if (!Array.isArray(window.trades)) throw new Error('The open window does not provide villager trades.');
    if (!Number.isInteger(index) || index < 0 || index >= window.trades.length) throw new Error('Trade index is out of range.');
    if (!Number.isInteger(count) || count < 1 || count > 64) throw new Error('Trade count must be an integer from 1 to 64.');
    if (window.trades[index].disabled || window.trades[index].tradeDisabled) throw new Error('That trade is currently disabled.');
    if (typeof window.trade === 'function') await window.trade(index, count);
    else await bot.trade(window, index, count);
    return { message: `[Trading] Completed trade ${index + 1} ${count} time${count === 1 ? '' : 's'}.` };
  }

  async workstation(request, bot) {
    const window = this.window('container', bot);
    const operation = String(request.operation || '').toLowerCase();
    if (['put-input', 'put-fuel'].includes(operation)) {
      const method = operation === 'put-input' ? 'putInput' : 'putFuel';
      if (typeof window[method] !== 'function') throw new Error('The open window is not a supported furnace.');
      const item = this.findItem('inventory', request.target, bot);
      const count = Number(request.count ?? item.count);
      if (!Number.isInteger(count) || count < 1 || count > item.count) throw new Error('Furnace item count is out of range.');
      await window[method](item.type, item.metadata, count);
      return { message: `[Furnace] Added ${count} x ${itemName(item)} as ${operation === 'put-input' ? 'input' : 'fuel'}.` };
    }
    if (['take-input', 'take-fuel', 'take-output'].includes(operation)) {
      const methods = { 'take-input': 'takeInput', 'take-fuel': 'takeFuel', 'take-output': 'takeOutput' };
      const method = methods[operation];
      if (typeof window[method] !== 'function') throw new Error('The open window is not a supported furnace.');
      const item = await window[method]();
      return { message: `[Furnace] Took ${item ? `${item.count} x ${itemName(item)}` : operation.replace('take-', '')}.` };
    }
    if (['put-target', 'put-lapis'].includes(operation)) {
      const method = operation === 'put-target' ? 'putTargetItem' : 'putLapis';
      if (typeof window[method] !== 'function') throw new Error('The open window is not a supported enchanting table.');
      const item = this.findItem('inventory', request.target, bot);
      await window[method](item);
      return { message: `[Enchanting] Added ${itemName(item)}.` };
    }
    if (operation === 'take-target') {
      if (typeof window.takeTargetItem !== 'function') throw new Error('The open window is not a supported enchanting table.');
      const item = await window.takeTargetItem();
      return { message: `[Enchanting] Took ${item ? itemName(item) : 'the target item'}.` };
    }
    if (operation === 'enchant') {
      const choice = Number(request.choice);
      if (typeof window.enchant !== 'function') throw new Error('The open window is not a supported enchanting table.');
      if (!Number.isInteger(choice) || choice < 0 || choice > 2) throw new Error('Enchanting choice must be 1, 2, or 3.');
      const item = await window.enchant(choice);
      return { message: `[Enchanting] Applied choice ${choice + 1}${item ? ` to ${itemName(item)}` : ''}.` };
    }
    if (operation === 'combine') {
      if (typeof window.combine !== 'function') throw new Error('The open window is not a supported anvil.');
      const first = this.findItem('inventory', request.first, bot);
      const second = this.findItem('inventory', request.second, bot);
      const name = String(request.name || '').slice(0, 35);
      await window.combine(first, second, name);
      return { message: `[Anvil] Combined ${itemName(first)} with ${itemName(second)}${name ? ` as ${name}` : ''}.` };
    }
    if (operation === 'rename') {
      if (typeof window.rename !== 'function') throw new Error('The open window is not a supported anvil.');
      const item = this.findItem('inventory', request.target, bot);
      const name = String(request.name || '').trim().slice(0, 35);
      if (!name) throw new Error('Enter a new item name.');
      await window.rename(item, name);
      return { message: `[Anvil] Renamed ${itemName(item)} as ${name}.` };
    }
    throw new Error('That workstation operation is not available.');
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
    if (allMatching) {
      const cache = new WeakMap();
      const matches = sourceItems.filter((entry) => itemsMatch(entry, item, cache));
      for (const entry of matches) await bot.clickWindow(this.windowSlot(sourceScope, entry.slot, window), 0, 1);
      return { message: `[Container] ${direction === 'take' ? 'Took' : 'Deposited'} ${count} x ${itemName(item)}.` };
    }
    const options = {
      window,
      itemType: item.type,
      metadata: item.metadata,
      nbt: item.nbt,
      count,
      sourceStart: this.windowSlot(sourceScope, item.slot, window),
      sourceEnd: this.windowSlot(sourceScope, item.slot, window) + 1,
      destStart: direction === 'take' ? window.inventoryStart : 0,
      destEnd: direction === 'take' ? window.inventoryEnd : window.inventoryStart
    };
    await bot.transfer(options);
    return { message: `[Container] ${direction === 'take' ? 'Took' : 'Deposited'} ${count} x ${itemName(item)}.` };
  }
}

module.exports = { DESTINATIONS, InventoryService, QUANTITIES, itemName };
