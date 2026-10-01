import { describe, expect, it } from 'vitest';
import { createAppStore, runtimeActions, uiActions } from './store';
import { testSnapshot } from './test-utils';
import { rendererState } from './renderer-observer';

describe('renderer state observation', () => {
  it('describes visible controls and layout without serializing the DOM', () => {
    document.body.innerHTML = '<main class="app-shell"><section class="inventory-fit"><div class="inventory-stage" style="transform: scale(0.75)"><button class="inventory-slot"></button><div class="container-window"></div></div></section><div class="context-menu"><header><strong>Stone</strong><small>Player inventory slot 9</small></header><button role="menuitem" data-group="inspect">View item details</button></div></main>';
    const store = createAppStore();
    store.dispatch(runtimeActions.snapshotReceived(testSnapshot({ session: { connectionId: 4, inventoryRevision: 8, windowId: 3, containerOpen: true } })));
    store.dispatch(uiActions.playerFilterChanged('all'));
    const state = rendererState(store, { storeUpdates: 2, longTasks: 1 }) as {
      connection: { connectionId: number };
      controls: { playerFilter: string };
      rendered: { inventorySlots: number; contextMenus: number };
      layout: { inventoryScale: string };
      contextMenu: { title: string; entries: Array<{ text: string }> };
      performance: { renderer: { storeUpdates: number; longTasks: number } };
    };
    expect(state.connection.connectionId).toBe(4);
    expect(state.controls.playerFilter).toBe('all');
    expect(state.rendered).toMatchObject({ inventorySlots: 1, contextMenus: 1 });
    expect(state.layout.inventoryScale).toBe('scale(0.75)');
    expect(state.contextMenu.title).toBe('Stone');
    expect(state.contextMenu.entries[0]?.text).toBe('View item details');
    expect(state.performance.renderer).toMatchObject({ storeUpdates: 2, longTasks: 1 });
  });
});
