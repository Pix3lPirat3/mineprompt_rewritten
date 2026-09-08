'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { MineflayerClient, readableReason } = require('../src/main/mineflayer-client');

function fixture(settings = {}) {
  const log = [];
  const state = [];
  const commands = [];
  const interfaceState = {
    setStatus: (value) => state.push(['status', value]),
    startSession: (value) => state.push(['session', value]),
    setPosition: (value) => state.push(['position', value.toString()]),
    setHealth: (value) => state.push(['health', value]),
    setHunger: (value) => state.push(['hunger', value]),
    setPotionEffects: (value) => state.push(['effects', value]),
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
  const activities = { stopAll() {} };
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
      this.health = 18;
      this.food = 16;
      this.entity = {
        id: 7,
        position: { floored: () => ({ toString: () => '(1, 64, 2)' }) },
        effects: { speed: { id: 1 } }
      };
      this.registry = { effects: { 1: { name: 'speed', displayName: 'Speed' } } };
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
    createBotImpl: (options) => {
      bot = new FakeBot(options);
      return bot;
    },
    pathfinderPlugin: 'pathfinder-plugin',
    MovementsClass: FakeMovements,
    chatFactory: () => class FakeChat {}
  });
  return { client, get bot() { return bot; }, log, state, commands };
}

test('tracks a complete connection lifecycle', async () => {
  const context = fixture();
  const bot = await context.client.startClient({
    username: 'Account@example.com',
    accountUsername: 'Account@example.com',
    host: 'localhost',
    port: 25565
  });
  assert.equal(bot.plugin, 'pathfinder-plugin');
  assert.deepEqual(context.commands[0], ['set', 'mineflayer']);
  assert.deepEqual(context.state[0], ['status', 'connecting']);

  bot.emit('login');
  bot.emit('spawn');
  assert.equal(context.client.chatMessageClass.name, 'FakeChat');
  assert.equal(bot.movements.canDig, false);
  assert.equal(bot.movements.allowFreeMotion, true);
  assert.equal(context.state.some((entry) => entry[0] === 'position' && entry[1] === '(1, 64, 2)'), true);
  assert.equal(context.state.some((entry) => entry[0] === 'health' && entry[1] === 18), true);
  assert.equal(context.state.some((entry) => entry[0] === 'effects' && entry[1][0].displayName === 'Speed'), true);

  bot.emit('kicked', { toString: () => 'Maintenance' });
  assert.equal(context.log.some((entry) => entry[1] === '[Connection] Kicked: Maintenance'), true);
  bot.emit('end', 'server closed');
  assert.equal(context.client.bot, null);
  assert.equal(context.state.some((entry) => entry[0] === 'reset'), true);
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
