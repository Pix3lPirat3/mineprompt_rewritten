import { describe, expect, it } from 'vitest';
import { replaceToken } from './TerminalDock';

describe('terminal completion', () => {
  it('replaces partial values and quotes names containing spaces', () => {
    expect(replaceToken('follow Pl', 'PlayerTarget')).toBe('follow PlayerTarget ');
    expect(replaceToken('workflow run Pat', 'Patrol Route')).toBe('workflow run "Patrol Route" ');
  });
});
