import { describe, expect, it } from 'vitest';
import { testItem } from '../../test-utils';
import { itemActions } from './item-actions';

describe('inventory item actions', () => {
  it('keeps right-click actions explicit when no container is open', () => {
    const actions = itemActions(testItem({ slot: 36, name: 'diamond_sword', hotbarIndex: 0 }), { scope: 'inventory', slot: 36 }, { containerOpen: false });
    expect(actions.map((action) => action.id)).toEqual(['inspect', 'use-main', 'use-off', 'swing-right', 'swing-left', 'equip-main', 'equip-off', 'select', 'drop-one', 'drop-stack']);
    expect(actions.find((action) => action.id === 'use-main')?.detail).toContain('bot.activateItem(false)');
    expect(actions.find((action) => action.id === 'swing-left')?.request).toMatchObject({ action: 'swing', target: '36', arm: 'left' });
    expect(actions.find((action) => action.id === 'select')?.request).toMatchObject({ action: 'select', target: '0' });
  });

  it('offers one, half, and stack transfers in either direction', () => {
    const container = itemActions(testItem({ slot: 2 }), { scope: 'container', slot: 2 }, { containerOpen: true, containerTitle: 'Chest' });
    const inventory = itemActions(testItem({ slot: 36 }), { scope: 'inventory', slot: 36 }, { containerOpen: true, containerTitle: 'Chest' });
    expect(container.map((action) => action.id)).toEqual(['inspect', 'transfer-one', 'transfer-half', 'transfer-stack']);
    expect(container.find((action) => action.id === 'transfer-half')?.request).toMatchObject({ action: 'transfer', sourceScope: 'container', quantity: 'half' });
    expect(inventory.find((action) => action.id === 'transfer-stack')?.request).toMatchObject({ action: 'transfer', sourceScope: 'inventory', quantity: 'stack' });
    expect(inventory.find((action) => action.id === 'transfer-one')?.label).toContain('Chest');
  });

  it('adds the matching armor destination only for wearable items', () => {
    const helmet = itemActions(testItem({ name: 'diamond_helmet' }), { scope: 'inventory', slot: 9 }, { containerOpen: false });
    expect(helmet.find((action) => action.id === 'equip-head')?.request).toMatchObject({ destination: 'head' });
  });
});
