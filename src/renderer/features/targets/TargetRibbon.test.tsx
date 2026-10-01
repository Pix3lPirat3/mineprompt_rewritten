import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithRuntime } from '../../test-utils';
import { TargetRibbon } from './TargetRibbon';

describe('target ribbon', () => {
  it('filters entities and dispatches contextual villager actions', async () => {
    const targetAction = vi.fn(async () => ({ ok: true }));
    const { user } = renderWithRuntime(<TargetRibbon />, { api: { targetAction }, snapshot: {
      selectedSessionId: 'primary',
      state: { status: 'online', username: 'Bot' },
      session: {
        targets: {
          cursorBlock: null,
          cursorEntity: null,
          entities: [{
            id: 7,
            kind: 'villager',
            name: 'villager',
            displayName: 'Villager',
            username: null,
            distance: 3,
            position: { x: 2, y: 64, z: 1 },
            count: null,
            friend: false,
            actions: [{ id: 'entity.trade', label: 'Open trades', enabled: true, reason: '' }]
          }]
        }
      }
    } });
    await user.click(screen.getByRole('button', { name: 'Villagers' }));
    await user.click(screen.getByText('Villager').closest('button') as HTMLButtonElement);
    await user.click(screen.getByRole('menuitem', { name: 'Open trades' }));
    expect(targetAction).toHaveBeenCalledWith(expect.objectContaining({ actionId: 'entity.trade', entityId: 7, sessionId: 'primary' }));
  });

  it('selects a cuboid from block menus and runs the shared terminal command', async () => {
    const block = {
      name: 'stone',
      displayName: 'Stone',
      distance: 3,
      position: { x: 10, y: 64, z: -2 },
      diggable: true,
      hardness: 1.5,
      actions: []
    };
    const execute = vi.fn(async () => ({ ok: true }));
    const { user } = renderWithRuntime(<TargetRibbon />, { api: { execute }, snapshot: {
      selectedSessionId: 'primary',
      state: { status: 'online', username: 'Bot' },
      session: { targets: { cursorBlock: block, cursorEntity: null, entities: [] } }
    } });
    await user.click(screen.getByText('Stone').closest('button') as HTMLButtonElement);
    await user.click(screen.getByRole('menuitem', { name: 'Set region start' }));
    expect(screen.getByText('Region start')).toBeTruthy();
    await user.click(screen.getByText('Stone').closest('button') as HTMLButtonElement);
    await user.click(screen.getByRole('menuitem', { name: 'Mine selected region' }));
    expect(execute).toHaveBeenCalledWith('mine region 10 64 -2 10 64 -2', 'primary');
  });
});
