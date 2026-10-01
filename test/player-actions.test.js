'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PlayerActionRegistry } = require('../src/main/player-actions');

function fixture() {
  const calls = [];
  const selfPosition = { distanceTo: (position) => position.distance, offset: () => selfPosition };
  const targetPosition = { distance: 3, x: 2, y: 64, z: 1, offset: () => targetPosition };
  const bot = {
    username: 'Bot',
    entity: { position: selfPosition },
    players: {
      Bot: { username: 'Bot', entity: { position: selfPosition }, ping: 1 },
      Friend: { username: 'Friend', entity: { position: targetPosition }, ping: 20 },
      Remote: { username: 'Remote', entity: null, ping: 40 },
      Target: { username: 'Target', entity: { position: targetPosition, height: 1.8 }, ping: 30 }
    },
    pathfinder: {
      setGoal: (goal, dynamic) => calls.push(['goal', goal, dynamic]),
      stop: () => calls.push(['stop']),
      goto: async (goal) => calls.push(['goto', goal])
    },
    lookAt: async (position) => calls.push(['look', position]),
    attack: async (entity) => calls.push(['attack', entity]),
    chat: (value) => calls.push(['chat', value])
  };
  const activities = { register: (id, activity) => calls.push(['activity', id, activity]) };
  return { activities, bot, calls };
}

function registry(friends = []) {
  return new PlayerActionRegistry({
    relationships: { isFriend: (player) => friends.some((name) => name.toLowerCase() === player.username.toLowerCase()) },
    logger: { warn() {} }
  });
}

test('applies composable player visibility and availability policies', () => {
  const { bot } = fixture();
  const actions = registry(['friend']);
  const friendActions = actions.describe(bot, 'Friend');
  const remoteActions = actions.describe(bot, 'Remote');
  assert.equal(friendActions.find((action) => action.id === 'player.attack').enabled, false);
  assert.equal(friendActions.find((action) => action.id === 'player.attack').overrideAllowed, true);
  assert.equal(remoteActions.some((action) => action.id === 'player.follow'), false);
  assert.equal(remoteActions.find((action) => action.id === 'player.goto').enabled, false);
});

test('executes player actions through one validated registry', async () => {
  const { activities, bot, calls } = fixture();
  const actions = registry();
  await actions.execute({ actionId: 'player.follow', username: 'Target' }, { bot, activities });
  await actions.execute({ actionId: 'player.look', username: 'Target' }, { bot, activities });
  await actions.execute({ actionId: 'player.message', username: 'Target', message: 'Hello' }, { bot, activities });
  await actions.execute({ actionId: 'player.attack', username: 'Target' }, { bot, activities });
  assert.equal(calls.some((entry) => entry[0] === 'goal'), true);
  assert.equal(calls.some((entry) => entry[0] === 'activity' && entry[1] === 'follow'), true);
  assert.equal(calls.some((entry) => entry[0] === 'look'), true);
  assert.deepEqual(calls.find((entry) => entry[0] === 'chat'), ['chat', '/msg Target Hello']);
  assert.equal(calls.some((entry) => entry[0] === 'attack'), true);
});

test('requires explicit authorization to bypass friend protection', async () => {
  const { activities, bot, calls } = fixture();
  const actions = registry(['friend']);
  await assert.rejects(actions.execute({ actionId: 'player.attack', username: 'Friend' }, { bot, activities, origin: { type: 'terminal' } }), /Friend protected/u);
  await actions.execute({ actionId: 'player.attack', username: 'Friend', overrideFriendProtection: true }, { bot, activities, origin: { type: 'terminal' } });
  await assert.rejects(actions.execute({ actionId: 'player.attack', username: 'Friend', overrideFriendProtection: true }, {
    bot,
    activities,
    origin: { type: 'agent', capabilities: ['relationships.override'] }
  }), /not authorized/u);
  await actions.execute({ actionId: 'player.attack', username: 'Friend', overrideFriendProtection: true, confirmOverride: true }, {
    bot,
    activities,
    origin: { type: 'agent', capabilities: ['relationships.override'] }
  });
  assert.equal(calls.filter((entry) => entry[0] === 'attack').length, 2);
});

test('adds and removes friends through player actions', async () => {
  const { activities, bot } = fixture();
  bot.players.Target.uuid = 'target-id';
  bot.lastOptions = { host: 'example.test' };
  const updates = [];
  const relationships = {
    isFriend: () => false,
    add: async (entry) => updates.push(['add', entry]),
    find: () => [{ kind: 'friend', username: 'Target', server: 'example.test' }],
    remove: async (kind, username, server) => updates.push(['remove', { kind, username, server }])
  };
  const actions = new PlayerActionRegistry({ relationships, logger: { warn() {} } });
  await actions.execute({ actionId: 'player.friend.add', username: 'Target' }, { bot, activities });
  relationships.isFriend = () => true;
  await actions.execute({ actionId: 'player.friend.remove', username: 'Target' }, { bot, activities });
  assert.deepEqual(updates, [
    ['add', { kind: 'friend', username: 'Target', uuid: 'target-id', server: 'example.test' }],
    ['remove', { kind: 'friend', username: 'Target', server: 'example.test' }]
  ]);
});
