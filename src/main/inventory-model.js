'use strict';

const nbt = require('prismarine-nbt');
const { plainText } = require('./text-value');

const CHAT_FORMATS = Object.freeze(['color', 'bold', 'strikethrough', 'underlined', 'italic']);
const REDUNDANT_COMPONENTS = new Set(['custom_name', 'lore', 'enchantments', 'damage', 'repair_cost', 'custom_model', 'tooltip_display', 'hide_tooltip']);

const WINDOW_TYPES = Object.freeze([
  Object.freeze({ id: 'hopper', matches: ['hopper'], columns: 5 }),
  Object.freeze({
    id: 'brewing',
    matches: ['brewing'],
    columns: 5,
    slots: ['bottle', 'bottle', 'bottle', 'ingredient', 'fuel'],
    properties: ['brewTime', 'fuel']
  }),
  Object.freeze({ id: 'beacon', matches: ['beacon'], columns: 1, slots: ['payment'], properties: ['level'] }),
  Object.freeze({ id: 'lectern', matches: ['lectern'], columns: 1 }),
  Object.freeze({
    id: 'furnace',
    matches: ['furnace', 'smoker'],
    columns: 3,
    slots: ['input', 'fuel', 'result'],
    properties: ['fuelRemaining', 'fuelCapacity', 'progress', 'progressCapacity']
  }),
  Object.freeze({ id: 'anvil', matches: ['anvil'], columns: 3, slots: ['input', 'material', 'result'], properties: ['repairCost'] }),
  Object.freeze({ id: 'grindstone', matches: ['grindstone'], columns: 3, slots: ['input', 'secondary', 'result'] }),
  Object.freeze({ id: 'enchanting', matches: ['enchant'], columns: 2, slots: ['item', 'lapis'] }),
  Object.freeze({ id: 'smithing', matches: ['smithing'], columns: 4, slots: ['template', 'base', 'addition', 'result'] }),
  Object.freeze({ id: 'stonecutter', matches: ['stonecutter'], columns: 2, slots: ['input', 'result'] }),
  Object.freeze({ id: 'loom', matches: ['loom'], columns: 4, slots: ['banner', 'dye', 'pattern', 'result'] }),
  Object.freeze({ id: 'cartography', matches: ['cartography'], columns: 3, slots: ['map', 'material', 'result'] }),
  Object.freeze({
    id: 'crafting',
    matches: ['crafting'],
    columns: 3,
    slots: ['result', 'input', 'input', 'input', 'input', 'input', 'input', 'input', 'input', 'input']
  }),
  Object.freeze({ id: 'merchant', matches: ['merchant', 'villager'], columns: 3, slots: ['firstCost', 'secondCost', 'result'] }),
  Object.freeze({ id: 'horse', matches: ['horse'], columns: 5 }),
  Object.freeze({ id: 'storage', matches: ['chest', 'container', 'generic_9x'], columns: 9 })
]);

function formattedText(value, ChatMessage) {
  const fallback = plainText(value).trim();
  if (!value || !ChatMessage) return { text: fallback, html: null };
  try {
    const message = typeof ChatMessage.fromNotch === 'function' ? ChatMessage.fromNotch(value) : new ChatMessage(value);
    const text = message.toString().trim() || fallback;
    const html = message.toHTML(undefined, undefined, CHAT_FORMATS);
    return { text, html: typeof html === 'string' && html.length <= 16384 ? html : null };
  } catch {
    return { text: fallback, html: null };
  }
}

function boundedMetadata(value, depth = 0) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') return value.slice(0, 512);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth >= 5) return '[nested data]';
  if (Buffer.isBuffer(value)) return value.subarray(0, 64).toString('hex');
  if (Array.isArray(value)) return value.slice(0, 32).map((entry) => boundedMetadata(entry, depth + 1));
  if (value instanceof Map) return Object.fromEntries([...value.entries()].slice(0, 32).map(([key, entry]) => [String(key).slice(0, 64), boundedMetadata(entry, depth + 1)]));
  if (typeof value !== 'object') return String(value).slice(0, 512);
  const entries = Object.entries(value).slice(0, 32).map(([key, entry]) => [key.slice(0, 64), boundedMetadata(entry, depth + 1)]);
  return Object.fromEntries(entries);
}

function metadataText(value) {
  let simplified = value;
  try {
    if (value && typeof value === 'object' && typeof value.type === 'string' && Object.hasOwn(value, 'value')) simplified = nbt.simplify(value);
  } catch {}
  const bounded = boundedMetadata(simplified);
  if (typeof bounded === 'string') return bounded;
  try { return JSON.stringify(bounded).slice(0, 2048); } catch { return String(bounded).slice(0, 2048); }
}

function componentLabel(value) {
  return String(value || 'component').replace(/^minecraft:/u, '').split('_').map((part) => part ? part.charAt(0).toUpperCase() + part.slice(1) : '').join(' ');
}

function componentMappings(registry) {
  const definition = registry?.protocol?.types?.SlotComponentType;
  const mappings = Array.isArray(definition) && definition[0] === 'mapper' ? definition[1]?.mappings : null;
  return mappings && typeof mappings === 'object' ? mappings : {};
}

function tooltipDisplay(rawComponents, registry) {
  const component = rawComponents.find((entry) => ['tooltip_display', 'hide_tooltip'].includes(String(entry?.type || '').replace(/^minecraft:/u, '')));
  if (!component) return { hidden: false, hiddenComponents: [] };
  const type = String(component.type || '').replace(/^minecraft:/u, '');
  if (type === 'hide_tooltip') return { hidden: true, hiddenComponents: [] };
  const data = component.data && typeof component.data === 'object' ? component.data : {};
  const mappings = componentMappings(registry);
  const values = Array.isArray(data.hiddenComponents) ? data.hiddenComponents : Array.isArray(data.hidden_components) ? data.hidden_components : [];
  const hiddenComponents = values.map((value) => {
    if (typeof value === 'string') return value.replace(/^minecraft:/u, '');
    return String(mappings[String(value)] || `component_${value}`).replace(/^minecraft:/u, '');
  });
  return { hidden: data.hideTooltip === true || data.hide_tooltip === true, hiddenComponents: [...new Set(hiddenComponents)] };
}

function serializeItem(item, hotbarStart = -1, inventoryEnd = -1, ChatMessage = null, registry = null) {
  let enchantments = [];
  try {
    enchantments = (Array.isArray(item.enchants) ? item.enchants : []).slice(0, 64).map((enchantment) => ({
      name: String(enchantment?.name || 'unknown').replace(/^minecraft:/u, ''),
      displayName: String(enchantment?.name || 'Unknown').replace(/^minecraft:/u, '').split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' '),
      level: Number(enchantment?.lvl ?? enchantment?.level) || 0
    }));
  } catch {}
  let lore = [];
  let loreHtml = [];
  try {
    const value = item.customLore;
    const lines = (Array.isArray(value) ? value : value ? [value] : []).slice(0, 64).map((entry) => formattedText(entry, ChatMessage)).filter((entry) => entry.text);
    lore = lines.map((entry) => entry.text);
    loreHtml = lines.map((entry) => entry.html);
  } catch {}
  let customName = null;
  let displayNameHtml = null;
  try {
    const formattedName = formattedText(item.customName, ChatMessage);
    customName = formattedName.text || null;
    displayNameHtml = customName ? formattedName.html : null;
  } catch {}
  let repairCost = 0;
  try { repairCost = Number(item.repairCost) || 0; } catch {}
  let customModel = null;
  try { customModel = item.customModel ?? null; } catch {}
  const rawComponents = (Array.isArray(item.components) ? item.components : []).slice(0, 32);
  const displayPolicy = tooltipDisplay(rawComponents, registry);
  const components = rawComponents.map((component) => String(component?.type || '')).filter(Boolean);
  const componentDetails = rawComponents.filter((component) => {
    const type = String(component?.type || '').replace(/^minecraft:/u, '');
    return type && !REDUNDANT_COMPONENTS.has(type) && !displayPolicy.hiddenComponents.includes(type);
  }).map((component) => ({
    name: String(component.type).replace(/^minecraft:/u, ''),
    displayName: componentLabel(component.type),
    value: metadataText(component.data)
  }));
  const nbtKeys = Object.keys(item.nbt?.value || {}).slice(0, 32);
  const dataTags = nbtKeys.map((key) => ({ name: key, value: metadataText(item.nbt.value[key]) }));
  let maxDurability = 0;
  let durabilityUsed = 0;
  try { maxDurability = Number(item.maxDurability) || 0; } catch {}
  try { durabilityUsed = Number(item.durabilityUsed) || 0; } catch {}
  return {
    slot: item.slot,
    name: item.name,
    displayName: customName || item.displayName || item.name,
    displayNameHtml,
    customName,
    count: item.count,
    hotbarIndex: item.slot >= hotbarStart && item.slot < inventoryEnd ? item.slot - hotbarStart : null,
    maxDurability,
    durabilityUsed,
    durabilityRemaining: maxDurability ? Math.max(0, maxDurability - durabilityUsed) : 0,
    enchanted: enchantments.length > 0,
    enchantments,
    lore,
    loreHtml,
    metadata: Number(item.metadata) || 0,
    stackSize: Number(item.stackSize) || 64,
    repairCost,
    customModel: typeof customModel === 'string' || typeof customModel === 'number' ? customModel : null,
    tooltipDisplay: displayPolicy,
    components,
    componentDetails,
    nbtKeys,
    dataTags
  };
}

function serializeSlots(window, start, end, ChatMessage = null, registry = null) {
  if (!window?.slots || !Number.isInteger(start) || !Number.isInteger(end)) return [];
  return Array.from({ length: Math.max(0, end - start) }, (_, offset) => {
    const item = window.slots[start + offset];
    return item ? serializeItem(item, window.hotbarStart, window.inventoryEnd, ChatMessage, registry) : null;
  });
}

function windowDefinition(window) {
  const type = String(window?.type || '').toLowerCase();
  return WINDOW_TYPES.find((entry) => entry.matches.some((match) => type.includes(match))) || null;
}

function containerColumns(window) {
  const slotCount = Number(window?.inventoryStart) || 0;
  const definition = windowDefinition(window);
  if (definition) return definition.columns;
  if (slotCount > 0 && slotCount % 9 === 0) return 9;
  return Math.max(1, Math.min(9, slotCount));
}

function defaultWindowTitle(window) {
  const definition = windowDefinition(window);
  if (definition?.id === 'storage') return Number(window?.inventoryStart) > 27 ? 'Large Chest' : 'Chest';
  const names = {
    anvil: 'Anvil',
    beacon: 'Beacon',
    brewing: 'Brewing Stand',
    cartography: 'Cartography Table',
    crafting: 'Crafting Table',
    enchanting: 'Enchanting Table',
    furnace: 'Furnace',
    grindstone: 'Grindstone',
    hopper: 'Hopper',
    horse: 'Horse Inventory',
    lectern: 'Lectern',
    loom: 'Loom',
    merchant: 'Trading',
    smithing: 'Smithing Table',
    stonecutter: 'Stonecutter'
  };
  return names[definition?.id] || 'Open container';
}

function describeWindow(window, title, ChatMessage = null, registry = null) {
  if (!window) return null;
  const definition = windowDefinition(window);
  return {
    id: window.id ?? null,
    type: String(window.type || 'container'),
    kind: definition?.id || 'generic',
    title: String(title || defaultWindowTitle(window)),
    columns: containerColumns(window),
    slotCount: Number(window.inventoryStart) || 0,
    inventoryStart: Number(window.inventoryStart) || 0,
    inventoryEnd: Number(window.inventoryEnd) || 0,
    hotbarStart: Number(window.hotbarStart) || 0,
    slotRoles: Array.from({ length: Number(window.inventoryStart) || 0 }, (_, index) => definition?.slots?.[index] || 'storage'),
    capabilities: {
      recipes: definition?.id === 'crafting',
      trades: definition?.id === 'merchant',
      progress: Array.isArray(definition?.properties) && definition.properties.length > 0,
      operations: workstationOperations(definition?.id)
    },
    trades: serializeTrades(window, ChatMessage, registry),
    workstation: workstationDetails(window, definition?.id)
  };
}

function workstationOperations(kind) {
  const operations = {
    furnace: ['put-input', 'put-fuel', 'take-input', 'take-fuel', 'take-output'],
    enchanting: ['put-target', 'put-lapis', 'take-target', 'enchant'],
    anvil: ['combine', 'rename'],
    brewing: ['move-items'],
    beacon: ['move-items'],
    grindstone: ['move-items'],
    smithing: ['move-items'],
    stonecutter: ['move-items'],
    loom: ['move-items'],
    cartography: ['move-items']
  };
  return operations[kind] || [];
}

function workstationDetails(window, kind) {
  if (kind === 'furnace') {
    return {
      fuel: Number.isFinite(window.fuel) ? window.fuel : null,
      progress: Number.isFinite(window.progress) ? window.progress : null,
      enchantments: []
    };
  }
  if (kind === 'enchanting') {
    return {
      fuel: null,
      progress: null,
      enchantments: Array.isArray(window.enchantments) ? window.enchantments.map((enchantment, index) => ({
        index,
        level: Number(enchantment?.level) || -1,
        available: Number(enchantment?.level) >= 0
      })) : []
    };
  }
  return { fuel: null, progress: null, enchantments: [] };
}

function serializeTrades(window, ChatMessage = null, registry = null) {
  if (!Array.isArray(window?.trades)) return [];
  const tradeItem = (item) => item ? { ...serializeItem(item, -1, -1, ChatMessage, registry), slot: -1, hotbarIndex: null } : null;
  return window.trades.map((trade, index) => ({
    index,
    firstInput: tradeItem(trade.inputItem1),
    secondInput: tradeItem(trade.inputItem2),
    output: tradeItem(trade.outputItem),
    realPrice: Number(trade.realPrice ?? trade.inputItem1?.count) || 0,
    uses: Number(trade.nbTradeUses ?? trade.tooluses) || 0,
    maximumUses: Number(trade.maximumNbTradeUses ?? trade.maxTradeuses) || 0,
    disabled: trade.disabled === true || trade.tradeDisabled === true
  }));
}

function windowPropertyName(window, property) {
  return windowDefinition(window)?.properties?.[Number(property)] || `property${Number(property)}`;
}

module.exports = { WINDOW_TYPES, componentMappings, containerColumns, defaultWindowTitle, describeWindow, serializeItem, serializeSlots, serializeTrades, tooltipDisplay, windowDefinition, windowPropertyName, workstationDetails, workstationOperations };
