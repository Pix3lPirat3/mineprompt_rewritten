'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { MineflayerClient, attributeValue, containerColumns, effectAssetName, effectVisibility, readableReason, serializeSlots } = require('../src/main/mineflayer-client');

test('normalizes registry effect names for packaged assets', () => {
  assert.equal(effectAssetName('NightVision'), 'night_vision');
  assert.equal(effectAssetName('minecraft:HeroOfTheVillage'), 'hero_of_the_village');
  assert.equal(effectAssetName('DolphinsGrace'), 'dolphins_grace');
  assert.equal(effectAssetName('BadLuck'), 'unluck');
});

test('covers effect textures across supported protocol generations', () => {
  for (const version of ['1.20.4', '1.21.11', '26.1.2']) {
    const effects = Object.values(require('minecraft-data')(version).effects);
    const missing = [...new Set(effects.map((effect) => effectAssetName(effect.name)).filter((name) => !fs.existsSync(path.join(__dirname, '..', 'src', 'img', 'faithful', 'effects', `${name}.png`))))];
    assert.deepEqual(missing, [], `Missing ${version} effect textures`);
  }
});

test('decodes version-aware potion effect visibility flags', () => {
  assert.deepEqual(effectVisibility(5, '1.21.8'), { ambient: true, showParticles: false, showIcon: true });
  assert.deepEqual(effectVisibility(2, '1.12.2'), { ambient: false, showParticles: true, showIcon: true });
});

function fixture(settings = {}, options = {}) {
  const log = [];
  const state = [];
  const commands = [];
  const inventoryEvents = [];
  const scheduled = [];
  const runningActivities = new Map();
  const interfaceState = {
    setStatus: (value) => state.push(['status', value]),
    startSession: (value) => state.push(['session', value]),
    setPosition: (value) => state.push(['position', value.toString()]),
    setHealth: (value) => state.push(['health', value]),
    setHunger: (value) => state.push(['hunger', value]),
    setVitals: (value) => state.push(['vitals', value]),
    setPotionEffects: (value) => state.push(['effects', value]),
    setFailure: (value) => state.push(['failure', value]),
    reset: () => state.push(['reset']),
    stopRuntime: () => state.push(['stop'])
  };
  const logger = Object.fromEntries(['log', 'info', 'warn', 'error', 'debug'].map((level) => [level, (message) => log.push([level, message])]));
  const store = {
    getSetting: async (name) => settings[name],
    renameAccount: async (from, to) => log.push(['rename', `${from}:${to}`])
  };
  const registry = {
    setCommands: (type) => commands.push(['set', type]),
    execute: async (input, origin) => {
      commands.push(['execute', input, origin.player]);
      origin.reply('completed');
    }
  };
  const activities = {
    register: (id, activity) => runningActivities.set(id, activity),
    finish: (id) => runningActivities.delete(id),
    stopAll: () => {
      for (const activity of runningActivities.values()) activity.stop();
      runningActivities.clear();
    }
  };
  class FakeMovements {
    constructor(bot) {
      this.bot = bot;
    }
  }
  class FakeBot extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.username = 'ResolvedPlayer';
      this.version = '1.21.5';
      this.health = 18;
      this.food = 16;
      this.foodSaturation = 4;
      this.experience = { level: 12, progress: 0.5, points: 200 };
      this.quickBarSlot = 0;
      this.entity = {
        id: 7,
        position: { floored: () => ({ toString: () => '(1, 64, 2)' }) },
        attributes: { 'minecraft:armor': { value: 6, modifiers: [] } },
        effects: { speed: { id: 1 } }
      };
      this.registry = { effects: { 1: { name: 'speed', displayName: 'Speed' } } };
      const item = { slot: 36, name: 'diamond', displayName: 'Diamond', count: 2 };
      this.inventory = Object.assign(new EventEmitter(), {
        id: 0,
        slots: Array.from({ length: 46 }, (_, index) => index === 36 ? item : null),
        inventoryStart: 9,
        inventoryEnd: 46,
        hotbarStart: 36,
        items: () => [item]
      });
      this._client = new EventEmitter();
      this.pathfinder = {
        setMovements: (movements) => { this.movements = movements; },
        isMoving: () => false
      };
      this.messages = [];
    }

    loadPlugin(plugin) {
      this.plugin = plugin;
    }

    chat(message) {
      this.messages.push(message);
    }

    acceptResourcePack() {
      this.resourcePack = 'accepted';
    }

    denyResourcePack() {
      this.resourcePack = 'denied';
    }

    clearControlStates() {}

    quit(reason) {
      this.quitReason = reason;
    }
  }
  let bot;
  const client = new MineflayerClient({
    logger,
    interfaceState,
    store,
    getCommands: () => registry,
    activities,
    onInventoryEvent: (event) => inventoryEvents.push(event),
    createBotImpl: (options) => {
      bot = new FakeBot(options);
      return bot;
    },
    pathfinderPlugin: 'pathfinder-plugin',
    MovementsClass: FakeMovements,
    chatFactory: () => class FakeChat {},
    schedule: (callback) => {
      scheduled.push(callback);
      return callback;
    },
    cancelSchedule: (callback) => {
      const index = scheduled.indexOf(callback);
      if (index >= 0) scheduled.splice(index, 1);
    },
    installPlugins: options.installPlugins
  });
  return { client, get bot() { return bot; }, log, state, commands, inventoryEvents, scheduled, runningActivities };
}

test('tracks a complete connection lifecycle', async () => {
  const plugins = [];
  const context = fixture({}, { installPlugins: (bot) => plugins.push(bot) });
  const bot = await context.client.startClient({
    username: 'Account@example.com',
    accountUsername: 'Account@example.com',
    host: 'localhost',
    port: 25565
  });
  assert.equal(bot.plugin, 'pathfinder-plugin');
  assert.deepEqual(plugins, [bot]);
  assert.deepEqual(context.commands[0], ['set', 'mineflayer']);
  assert.deepEqual(context.state[0], ['status', 'connecting']);

  bot.emit('login');
  bot.emit('spawn');
  assert.equal(context.client.chatMessageClass.name, 'FakeChat');
  assert.equal(bot.movements.canDig, false);
  assert.equal(bot.movements.allowFreeMotion, true);
  assert.equal(context.state.some((entry) => entry[0] === 'position' && entry[1] === '(1, 64, 2)'), true);
  assert.equal(context.state.some((entry) => entry[0] === 'vitals' && entry[1].health === 18 && entry[1].armor === 6), true);
  bot.entity.attributes = null;
  assert.doesNotThrow(() => bot.emit('health'));
  assert.equal(context.state.filter((entry) => entry[0] === 'vitals').at(-1)[1].armor, 0);
  assert.equal(context.state.some((entry) => entry[0] === 'effects' && entry[1][0].displayName === 'Speed'), true);
  bot._client.emit('entity_effect', { entityId: 7, effectId: 1, flags: 5 });
  const flaggedEffect = context.state.filter((entry) => entry[0] === 'effects').at(-1)[1][0];
  assert.equal(flaggedEffect.ambient, true);
  assert.equal(flaggedEffect.showParticles, false);
  assert.equal(flaggedEffect.showIcon, true);
  assert.deepEqual(context.client.snapshot().inventory[0], {
    slot: 36,
    name: 'diamond',
    displayName: 'Diamond',
    displayNameHtml: null,
    customName: null,
    count: 2,
    hotbarIndex: 0,
    maxDurability: 0,
    durabilityUsed: 0,
    durabilityRemaining: 0,
    enchanted: false,
    enchantments: [],
    lore: [],
    loreHtml: [],
    metadata: 0,
    stackSize: 64,
    repairCost: 0,
    customModel: null,
    tooltipDisplay: { hidden: false, hiddenComponents: [] },
    components: [],
    componentDetails: [],
    nbtKeys: [],
    dataTags: []
  });
  assert.equal(context.client.snapshot().inventorySlots.length, 46);
  assert.equal(context.client.snapshot().inventorySlots[36].name, 'diamond');
  assert.equal(context.client.snapshot().inventoryLayout.selectedHotbar, 0);

  bot.emit('kicked', { toString: () => 'Maintenance' });
  assert.equal(context.log.some((entry) => entry[1] === '[Connection] Kicked: Maintenance'), true);
  bot.emit('end', 'server closed');
  assert.equal(context.client.bot, null);
  assert.equal(context.state.some((entry) => entry[0] === 'reset'), true);
});

test('cleans up a connection when plugin initialization fails', async () => {
  const context = fixture({}, { installPlugins: () => { throw new Error('Plugin failed'); } });
  await assert.rejects(
    context.client.startClient({ username: 'Bot', host: 'localhost', port: 25565 }),
    /Plugin failed/u
  );
  assert.equal(context.client.bot, null);
  assert.equal(context.bot.quitReason, 'Plugin initialization failed');
  assert.deepEqual(context.state.at(-1), ['failure', 'Plugin failed']);
});

test('enforces resource-pack and remote-command policies', async () => {
  const context = fixture({
    resourcePackPolicy: 'accept',
    remoteCommandsEnabled: true,
    remoteCommandPlayers: ['TrustedPlayer']
  });
  const bot = await context.client.startClient({ username: 'Bot', host: 'localhost', port: 25565 });
  bot.emit('resourcePack');
  bot.emit('chat', 'Stranger', '!inventory');
  bot.emit('chat', 'trustedplayer', '!inventory');
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  assert.equal(bot.resourcePack, 'accepted');
  assert.deepEqual(context.commands.filter((entry) => entry[0] === 'execute'), [
    ['execute', 'inventory', 'trustedplayer']
  ]);
  assert.deepEqual(bot.messages, ['/msg trustedplayer completed']);
});

test('publishes live inventory and container changes', async () => {
  const context = fixture();
  const bot = await context.client.startClient({ username: 'Bot', host: 'localhost', port: 25565 });
  bot.emit('login');
  bot.emit('spawn');
  const diamond = { slot: 37, name: 'diamond', displayName: 'Diamond', count: 1 };
  bot.inventory.emit('updateSlot', 37, null, diamond);
  const container = Object.assign(new EventEmitter(), {
    id: 4,
    title: 'Furnace',
    type: 'minecraft:furnace',
    inventoryStart: 3,
    inventoryEnd: 39,
    hotbarStart: 30,
    slots: Array(39).fill(null),
    containerItems: () => [],
    items: () => []
  });
  bot.currentWindow = container;
  bot.emit('windowOpen', container);
  container.emit('updateSlot', 1, null, diamond);
  bot._client.emit('craft_progress_bar', { windowId: 4, property: 2, value: 80 });
  assert.equal(context.client.snapshot().containerLayout.kind, 'furnace');
  assert.equal(context.client.snapshot().containerLayout.properties.progress, 80);
  bot.currentWindow = null;
  bot.emit('windowClose', container);

  assert.deepEqual(context.inventoryEvents.map((event) => event.type), ['update', 'open', 'update', 'property', 'close']);
  assert.equal(context.inventoryEvents[0].scope, 'inventory');
  assert.equal(context.inventoryEvents[1].window.kind, 'furnace');
  assert.equal(context.inventoryEvents[3].propertyName, 'progress');
  assert.equal(context.inventoryEvents[3].value, 80);
});

test('disconnect invalidates late events and closes the bot', async () => {
  const context = fixture();
  const bot = await context.client.startClient({ username: 'Bot', host: 'localhost', port: 25565 });
  await context.client.disconnect('Test complete');
  assert.equal(context.client.bot, null);
  assert.equal(bot.quitReason, 'Test complete');
  bot.emit('login');
  assert.equal(context.state.some((entry) => entry[0] === 'session'), false);
});

test('formats disconnect reasons defensively', () => {
  assert.equal(readableReason('Done'), 'Done');
  assert.equal(readableReason({ toString: () => 'Object reason' }), 'Object reason');
});

test('serializes slot layouts and common container shapes', () => {
  const slots = Array.from({ length: 12 }, () => null);
  slots[2] = { slot: 2, name: 'iron_pickaxe', displayName: 'Iron Pickaxe', count: 1, maxDurability: 250, durabilityUsed: 25 };
  const window = { slots, inventoryStart: 5, inventoryEnd: 12, hotbarStart: 9, type: 'minecraft:hopper' };
  assert.equal(serializeSlots(window, 0, 5)[2].durabilityUsed, 25);
  assert.equal(containerColumns(window), 5);
  assert.equal(containerColumns({ inventoryStart: 54, type: 'minecraft:generic_9x6' }), 9);
  assert.equal(attributeValue({ 'generic.armor': { value: 4, modifiers: [{ operation: 0, amount: 2 }] } }, 'armor'), 6);
});

test('schedules bounded reconnect attempts after an unexpected end', async () => {
  const context = fixture({ automaticReconnectEnabled: true, reconnectAttempts: 2 });
  const bot = await context.client.startClient({ username: 'Alex', host: 'localhost', port: 25565 });
  bot.emit('end', 'network lost');
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  assert.equal(context.scheduled.length, 1);
  assert.equal(context.runningActivities.has('reconnect'), true);
  assert.equal(context.state.some((entry) => entry[0] === 'status' && entry[1] === 'reconnecting'), true);
  context.scheduled[0]();
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  assert.equal(context.commands.filter((entry) => entry[0] === 'set').length, 2);
});
