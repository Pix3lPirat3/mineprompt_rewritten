'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { RelationshipService, normalizeRelationships } = require('../src/main/relationship-service');

function memoryStore(settings = {}) {
  const state = { settings };
  return {
    snapshot: () => structuredClone(state),
    setSetting: async (key, value) => { state.settings[key] = structuredClone(value); }
  };
}

test('normalizes relationship identities and ignores malformed entries', () => {
  assert.deepEqual(normalizeRelationships([
    { kind: 'friend', username: 'Alex' },
    { kind: 'friend', username: 'alex' },
    { kind: 'blocked', username: 'Griefer', server: 'Play.Example.Net' },
    { kind: 'invalid', username: 'Nope' }
  ]), [
    { kind: 'blocked', username: 'Griefer', uuid: null, server: 'play.example.net' },
    { kind: 'friend', username: 'Alex', uuid: null, server: null }
  ]);
});

test('manages global and server-scoped relationships without legacy conversion', async () => {
  const store = memoryStore({ friendPlayers: ['LegacyName'], relationships: [] });
  const relationships = new RelationshipService(store);
  assert.deepEqual(relationships.friendNames(), []);
  await relationships.add({ kind: 'friend', username: 'Alex' });
  await relationships.add({ kind: 'blocked', username: 'Griefer', server: 'one.example.net' });
  assert.equal(relationships.isFriend({ username: 'alex' }), true);
  assert.equal(relationships.has('blocked', 'Griefer', { server: 'one.example.net' }), true);
  assert.equal(relationships.has('blocked', 'Griefer', { server: 'two.example.net' }), false);
  await relationships.replaceFriends(['Builder', 'builder']);
  assert.deepEqual(relationships.friendNames(), ['Builder']);
  assert.equal(relationships.list('blocked').length, 1);
  assert.equal(await relationships.remove('friend', 'Builder'), true);
  assert.deepEqual(relationships.friendNames(), []);
});
