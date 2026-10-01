import { describe, expect, it } from 'vitest';
import { createAppStore, runtimeActions, uiActions } from './store';
import { testSnapshot } from './test-utils';

describe('renderer store', () => {
  it('projects session patches without replacing unrelated state', () => {
    const store = createAppStore();
    const snapshot = testSnapshot({ version: '3.0.0', selectedSessionId: 'bot-one' });
    snapshot.sessions = [{ id: 'bot-one', state: snapshot.state, activities: [], session: snapshot.session, commands: [], process: { isolated: true, pid: 1234, status: 'running' } }];
    store.dispatch(runtimeActions.snapshotReceived(snapshot));
    store.dispatch(runtimeActions.sessionStateReceived({ ...snapshot.state, sessionId: 'bot-one', status: 'online', username: 'Alex' }));
    expect(store.getState().runtime.state.status).toBe('online');
    expect(store.getState().runtime.state.username).toBe('Alex');
    expect(store.getState().runtime.version).toBe('3.0.0');
  });

  it('bounds the terminal and switches player filters', () => {
    const store = createAppStore();
    store.dispatch(uiActions.terminalHeightChanged(900));
    store.dispatch(uiActions.playerFilterChanged('all'));
    expect(store.getState().ui.terminalHeight).toBe(520);
    expect(store.getState().ui.playerFilter).toBe('all');
  });

  it('updates inventory data without replacing player and target state', () => {
    const store = createAppStore();
    const snapshot = testSnapshot({
      selectedSessionId: 'bot-one',
      session: {
        players: [{ username: 'Alex', uuid: null, ping: 20, visible: true, nearby: true, distance: 2, friend: false, actions: [] }],
        targets: { cursorBlock: null, cursorEntity: null, entities: [] }
      }
    });
    snapshot.sessions = [{ id: 'bot-one', state: snapshot.state, activities: [], session: snapshot.session, commands: [], process: { isolated: true, pid: 1234, status: 'running' } }];
    store.dispatch(runtimeActions.snapshotReceived(snapshot));
    const before = store.getState().runtime;
    const inventoryEvent = {
      sessionId: 'bot-one',
      event: { type: 'update' as const, scope: 'inventory' as const, revision: 2, timestamp: Date.now(), windowId: null },
      session: {
        connectionId: 1,
        inventoryRevision: 2,
        windowId: null,
        containerOpen: false,
        inventory: [],
        inventorySlots: [],
        inventoryLayout: null,
        container: [],
        containerSlots: [],
        containerLayout: null
      }
    };
    store.dispatch(runtimeActions.inventoryReceived(inventoryEvent));
    const after = store.getState().runtime;
    expect(after.session.players).toBe(before.session.players);
    expect(after.session.targets).toBe(before.session.targets);
    expect(after.session.inventoryRevision).toBe(2);
    expect(store.getState().ui.inventoryTelemetry['bot-one']?.received).toBe(1);
    expect(store.getState().ui.inventoryTelemetry['bot-one']?.lastRevision).toBe(2);
    expect(store.getState().ui.inventoryActivity).toBeNull();
  });
});
