import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithRuntime } from '../../test-utils';
import { PlayerRibbon } from './PlayerRibbon';

describe('player ribbon relationship protection', () => {
  it('requires Ctrl and Shift for a friend attack override', async () => {
    const playerAction = vi.fn(async () => ({ ok: true }));
    const { user } = renderWithRuntime(<PlayerRibbon />, { api: { playerAction }, snapshot: {
      selectedSessionId: 'primary',
      state: { status: 'online', username: 'Bot' },
      session: {
        username: 'Bot',
        players: [{
          username: 'Friend',
          uuid: 'friend-id',
          ping: 20,
          visible: true,
          nearby: true,
          distance: 2,
          friend: true,
          actions: [{
            id: 'player.attack',
            label: 'Attack',
            enabled: false,
            reason: 'Friend protected. Hold Ctrl+Shift to override.',
            danger: true,
            preparesInput: false,
            relationshipProtected: true,
            overrideAllowed: true
          }]
        }]
      }
    } });
    await user.click(screen.getByRole('button', { name: /Friend/u }));
    expect((screen.getByRole('menuitem', { name: /Attack/u }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(window, { key: 'Shift', ctrlKey: true, shiftKey: true });
    const override = screen.getByRole('menuitem', { name: /Attack with override/u });
    expect((override as HTMLButtonElement).disabled).toBe(false);
    await user.click(override);
    expect(playerAction).toHaveBeenCalledWith(expect.objectContaining({
      actionId: 'player.attack',
      username: 'Friend',
      overrideFriendProtection: true
    }));
  });
});
