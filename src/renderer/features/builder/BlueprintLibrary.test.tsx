import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithRuntime } from '../../test-utils';
import type { BlueprintSummary } from '../../types';
import { BlueprintLibrary } from './BlueprintLibrary';

const blueprint: BlueprintSummary = {
  id: '1234567890abcdef',
  hash: 'a'.repeat(64),
  name: 'Starter House',
  sourceFile: 'starter.schem',
  sourceFormat: 'sponge',
  edition: 'java',
  version: '1.21.11',
  detectedVersion: '1.21.11',
  dimensions: { x: 8, y: 6, z: 9 },
  volume: 432,
  offset: { x: 0, y: 0, z: 0 },
  paletteSize: 12,
  blockEntityCount: 1,
  materialTypes: 3,
  materialCount: 90,
  unsupportedCount: 0,
  supportSensitiveCount: 4,
  importedAt: 1790942400000
};

describe('blueprint library', () => {
  it('inspects materials and previews the selected blueprint', async () => {
    const blueprintAction = vi.fn(async (request: Record<string, unknown>) => {
      if (request.action === 'materials') return { ok: true, materials: [{ name: 'stone', displayName: 'Stone', count: 64 }], unsupportedBlocks: [], supportSensitiveBlocks: ['minecraft:torch'] };
      if (request.action === 'plan') return { ok: true, plan: { graph: { counts: { operations: 80, removals: 0, placements: 80, blocked: 0, scaffolded: 2, groups: 0 }, cyclicCount: 0 }, stances: { counts: { stances: 4, covered: 80, blocked: 0 }, estimatedTravel: 12.5, uncoveredCount: 0 } } };
      return { ok: true, preview: { warnings: [], counts: { correct: 10, placeable: 80 }, requirements: [{ name: 'stone', count: 64, available: 64, missing: 0 }], removals: [] } };
    });
    const { user } = renderWithRuntime(<BlueprintLibrary close={() => {}} />, {
      api: { blueprintAction },
      snapshot: {
        state: { status: 'online', position: '10, 65, -4' },
        session: { blueprints: { blueprints: [blueprint] } }
      }
    });
    expect(screen.getAllByText('Starter House')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Materials' }));
    expect(await screen.findByText('Stone')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Compare with world' }));
    expect(blueprintAction).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'preview', blueprint: blueprint.id, anchor: { x: 10, y: 65, z: -4 } }));
    expect(await screen.findByText('placeable')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Compile plan' }));
    expect(blueprintAction).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'plan', blueprint: blueprint.id, anchor: { x: 10, y: 65, z: -4 } }));
    expect(await screen.findByText('need scaffold')).toBeTruthy();
  });

  it('uses native import selection and explicit removal confirmation', async () => {
    const importBlueprint = vi.fn(async () => ({ ok: true, blueprint }));
    const removeBlueprint = vi.fn(async () => ({ ok: true }));
    const { user } = renderWithRuntime(<BlueprintLibrary close={() => {}} />, {
      api: { importBlueprint, removeBlueprint },
      snapshot: { session: { blueprints: { blueprints: [blueprint] } } }
    });
    await user.type(screen.getByLabelText('Minecraft version'), '1.20.4');
    await user.click(screen.getByRole('button', { name: 'Choose schematic' }));
    expect(importBlueprint).toHaveBeenCalledWith(expect.objectContaining({ edition: 'java', version: '1.20.4' }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await user.click(screen.getByRole('button', { name: 'Confirm remove' }));
    expect(removeBlueprint).toHaveBeenCalledWith({ sessionId: 'primary', blueprint: blueprint.id });
  });
});
