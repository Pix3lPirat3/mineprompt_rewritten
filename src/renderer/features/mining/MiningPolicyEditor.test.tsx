import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithRuntime } from '../../test-utils';
import type { MiningPreset } from '../../types';
import { MiningPolicyEditor } from './MiningPolicyEditor';

describe('mining policy editor', () => {
  it('edits, selects, and removes policies through the shared API', async () => {
    const preset: MiningPreset = {
      id: 'safe',
      name: 'Safe Quarry',
      policy: {
        tool: 'auto',
        lowDurability: 'switch',
        minimumDurability: 25,
        allowFluidAdjacent: false,
        allowFalling: false,
        include: ['stone'],
        exclude: ['diamond_ore'],
        reach: 4.8,
        maxBlocks: 4096
      }
    };
    const saveMiningPreset = vi.fn(async () => ({ ok: true, preset }));
    const selectMiningPreset = vi.fn(async () => ({ ok: true, activeMiningPresetId: preset.id }));
    const removeMiningPreset = vi.fn(async () => ({ ok: true }));
    const { user } = renderWithRuntime(<MiningPolicyEditor close={() => {}} />, {
      api: { saveMiningPreset, selectMiningPreset, removeMiningPreset },
      snapshot: { miningPresets: [preset], activeMiningPresetId: null }
    });
    await user.clear(screen.getByLabelText('Durability reserve'));
    await user.type(screen.getByLabelText('Durability reserve'), '40');
    await user.clear(screen.getByLabelText('Only mine these blocks'));
    await user.type(screen.getByLabelText('Only mine these blocks'), 'stone, deepslate');
    await user.click(screen.getByRole('button', { name: 'Save and use' }));
    expect(saveMiningPreset).toHaveBeenCalledWith(expect.objectContaining({ id: 'safe', name: 'Safe Quarry', activate: true, policy: expect.objectContaining({ minimumDurability: 40, include: ['stone', 'deepslate'] }) }));
    await user.click(screen.getByRole('button', { name: 'Use policy' }));
    expect(selectMiningPreset).toHaveBeenCalledWith('safe');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(removeMiningPreset).toHaveBeenCalledWith('safe');
  });
});
