import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { emptyPresentation } from '../../../../packages/mineflayer-ui/index.js';
import { renderWithRuntime } from '../../test-utils';
import { GameOverlay } from './GameOverlay';

describe('game overlay', () => {
  it('renders server boss bars, scoreboard, titles, and action bar state', () => {
    const basePresentation = {
      hud: {
        health: 20, maxHealth: 20, absorption: 0, food: 20, saturation: 5, oxygen: 20, armor: 0, armorToughness: 0,
        experience: { level: 0, progress: 0, points: 0 }, selectedHotbar: 0, usingItem: false, hardcore: false, gameMode: 'survival', dimension: 'overworld'
      },
      bossBars: [{ id: 'dragon', title: 'Ender Dragon', progress: 0.5, dividers: 10 as const, color: 'purple' as const, darkenSky: true, dragon: true, fog: false }],
      scoreboard: { name: 'scores', title: 'Match', items: [{ name: 'TestBot', displayName: 'TestBot', value: 12 }] },
      overlay: { title: 'Victory', subtitle: 'The village is safe', actionBar: 'Ready' },
      vehicle: null
    };
    renderWithRuntime(<GameOverlay />, { snapshot: { state: { status: 'online' }, session: { presentation: basePresentation } } });
    expect(screen.getByLabelText('Ender Dragon, 50 percent')).toBeTruthy();
    expect(screen.getByText('Match')).toBeTruthy();
    expect(screen.getByText('Victory')).toBeTruthy();
    expect(screen.getByText('Ready')).toBeTruthy();
  });

  it('does not show stale game overlays while disconnected', () => {
    renderWithRuntime(<GameOverlay />);
    expect(document.querySelector('.game-overlay')).toBeNull();
  });

  it('does not render an empty scoreboard frame', () => {
    renderWithRuntime(<GameOverlay />, { snapshot: {
      state: { status: 'online' },
      session: { presentation: { ...emptyPresentation(), scoreboard: { name: '', title: '', items: [] } } }
    } });
    expect(document.querySelector('.scoreboard')).toBeNull();
  });
});
