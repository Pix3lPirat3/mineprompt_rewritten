import { describe, expect, it, vi } from 'vitest';
import { startBridge } from './bridge';
import { createAppStore } from './store';
import { installTestApi, testSnapshot } from './test-utils';
import type { InventoryEventPayload, SessionState } from './types';

describe('renderer bridge', () => {
  it('removes subscriptions immediately when startup is canceled', async () => {
    let resolveSnapshot!: (value: ReturnType<typeof testSnapshot>) => void;
    const snapshot = new Promise<ReturnType<typeof testSnapshot>>((resolve) => { resolveSnapshot = resolve; });
    const remove = vi.fn();
    installTestApi({
      getSnapshot: () => snapshot,
      on: vi.fn(() => remove),
      reportRendererIssue: vi.fn(async () => ({ ok: true }))
    });
    const controller = new AbortController();
    const started = startBridge(createAppStore().dispatch, controller.signal);
    controller.abort();
    resolveSnapshot(testSnapshot());
    await started;
    expect(remove).toHaveBeenCalledTimes(4);
  });

  it('handles each inventory publication with one store dispatch', async () => {
    const callbacks = new Map<string, (payload: never) => void>();
    const store = createAppStore();
    const snapshot = testSnapshot({ selectedSessionId: 'primary' });
    snapshot.sessions = [{ id: 'primary', state: snapshot.state, activities: [], session: snapshot.session, commands: [], process: { isolated: true, pid: 1234, status: 'running' } }];
    installTestApi({
      getSnapshot: async () => snapshot,
      on: vi.fn((channel, callback) => {
        callbacks.set(channel, callback as (payload: never) => void);
        return () => callbacks.delete(channel);
      }),
      reportRendererIssue: vi.fn(async () => ({ ok: true }))
    });
    const stop = await startBridge(store.dispatch);
    const payload: InventoryEventPayload = {
      sessionId: 'primary',
      event: { type: 'update', scope: 'inventory', revision: 1, timestamp: Date.now(), windowId: null },
      session: {
        connectionId: 1,
        inventoryRevision: 1,
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
    callbacks.get('inventory')?.(payload as never);
    expect(store.getState().ui.inventoryTelemetry.primary?.received).toBe(1);
    stop();
  });

  it('replays live events after the initial snapshot', async () => {
    let resolveSnapshot!: (value: ReturnType<typeof testSnapshot>) => void;
    const initial = testSnapshot({ selectedSessionId: 'primary' });
    initial.sessions = [{ id: 'primary', state: initial.state, activities: [], session: initial.session, commands: [], process: { isolated: true, pid: 1234, status: 'running' } }];
    const snapshot = new Promise<ReturnType<typeof testSnapshot>>((resolve) => { resolveSnapshot = resolve; });
    const callbacks = new Map<string, (payload: never) => void>();
    const store = createAppStore();
    installTestApi({
      getSnapshot: () => snapshot,
      on: vi.fn((channel, callback) => {
        callbacks.set(channel, callback as (payload: never) => void);
        return () => callbacks.delete(channel);
      }),
      reportRendererIssue: vi.fn(async () => ({ ok: true }))
    });
    const started = startBridge(store.dispatch);
    callbacks.get('state')?.({
      ...initial.state,
      sessionId: 'primary',
      status: 'online',
      username: 'live-bot'
    } satisfies SessionState & { sessionId: string } as never);
    resolveSnapshot(initial);
    const stop = await started;
    expect(store.getState().runtime.sessions[0]?.state.status).toBe('online');
    expect(store.getState().runtime.sessions[0]?.state.username).toBe('live-bot');
    stop();
  });
});
