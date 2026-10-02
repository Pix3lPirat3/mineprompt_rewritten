'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EngineController } = require('../src/main/engine-controller');

function fixture(overrides = {}) {
  const profiles = [
    { id: 'stable', profile: 'stable', name: 'Stable' },
    { id: 'custom-123', profile: 'custom', name: 'Custom' }
  ];
  const manager = {
    list: () => profiles,
    catalog: () => profiles,
    resolve: (value) => profiles.find((profile) => profile.id === value || profile.profile === value),
    research: async (owner) => [{ owner }],
    planPreset: async (preset) => ({ id: `${preset}-123`, profile: preset }),
    planPackages: async ({ name, pulls }) => ({ id: `${name}-123`, profile: name, pulls }),
    install: async (plan) => plan,
    remove: async (id) => ({ ok: true, id }),
    ...overrides.manager
  };
  const session = {
    id: 'primary',
    ready: Promise.resolve(),
    close: async () => {},
    snapshot: () => ({ state: { status: 'disconnected' }, engine: profiles[0] })
  };
  const sessions = new Map([['primary', session]]);
  const settings = [];
  const selected = [];
  let publications = 0;
  const controller = new EngineController({
    manager,
    store: {
      snapshot: () => ({ settings: {} }),
      setSetting: async (...values) => { settings.push(values); }
    },
    sessions,
    selectedSessionId: () => selected.at(-1) || 'primary',
    selectSession: (id) => selected.push(id),
    createSession: (id, profileId) => {
      const replacement = {
        id,
        ready: Promise.resolve(),
        snapshot: () => ({ state: { status: 'disconnected' }, engine: manager.resolve(profileId) })
      };
      sessions.set(id, replacement);
      return replacement;
    },
    publishSnapshot: () => { publications += 1; },
    logger: { log: () => {}, error: () => {} }
  });
  return { controller, manager, profiles, publications: () => publications, selected, sessions, settings };
}

test('owns engine command metadata and completion', async () => {
  const { controller } = fixture();
  assert.equal(controller.descriptor().command, 'engine');
  assert.deepEqual(controller.complete('engine '), ['list', 'catalog', 'research', 'plan', 'install', 'use', 'remove']);
  assert.deepEqual(controller.complete('engine use '), ['stable', 'custom-123']);
  assert.equal((await controller.execute(['research', 'Example'])).value.pulls[0].owner, 'Example');
});

test('replaces a disconnected session when selecting an engine', async () => {
  const { controller, publications, selected, sessions, settings } = fixture();
  const result = await controller.use({ profile: 'custom', sessionId: 'primary' });
  assert.equal(result.engine.id, 'custom-123');
  assert.equal(sessions.get('primary').snapshot().engine.id, 'custom-123');
  assert.deepEqual(selected, ['primary']);
  assert.deepEqual(settings, [['defaultEngineProfileId', 'custom']]);
  assert.equal(publications(), 1);
});

test('protects an engine profile used by a live session', async () => {
  const { controller, sessions } = fixture({ manager: { planPackages: async () => ({ id: 'custom-456', profile: 'custom' }) } });
  sessions.get('primary').snapshot = () => ({ state: { status: 'online' }, engine: { id: 'custom-123', profile: 'custom' } });
  await assert.rejects(controller.remove({ profile: 'custom' }), /in use by session primary/u);
  await assert.rejects(controller.install({ name: 'custom', pulls: ['PrismarineJS/mineflayer#1'], acknowledgeUnsafe: true }), /using custom/u);
});
