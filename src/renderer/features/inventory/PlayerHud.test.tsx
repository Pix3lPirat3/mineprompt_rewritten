import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithRuntime } from '../../test-utils';
import { PlayerHud } from './PlayerHud';
import { EffectPanel } from './EffectPanel';

describe('player HUD', () => {
  it('renders vanilla vitals and experience from the selected session', () => {
    renderWithRuntime(<PlayerHud />, { snapshot: {
      state: {
        health: 17,
        armor: 8,
        hunger: 13,
        experience: { level: 12, progress: 0.5, points: 300 },
        effects: [{ effect: 'NightVision', displayName: 'Night Vision', amplifier: 0, duration: 200 }]
      }
    } });
    expect(screen.getByLabelText('health 17 of 20')).toBeTruthy();
    expect(screen.getByLabelText('armor 8 of 20')).toBeTruthy();
    expect(screen.getByLabelText('food 13 of 20, 0 saturation')).toBeTruthy();
    expect(screen.getByLabelText('Experience level 12')).toBeTruthy();
  });

  it('renders active effects in a separate vanilla badge panel', () => {
    renderWithRuntime(<EffectPanel />, { snapshot: { state: { effects: [{ effect: 'NightVision', displayName: 'Night Vision', amplifier: 0, duration: 200, ambient: true }] } } });
    const effect = screen.getByLabelText('Night Vision, 0:10 remaining');
    expect(effect.querySelector('.effect-badge__frame')?.getAttribute('src')).toContain('effect_background_ambient.png');
    expect(effect.querySelector('.effect-badge__icon')?.getAttribute('src')).toContain('night_vision.png');
  });
});
