import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithRuntime } from '../../test-utils';
import { StorageRibbon } from './StorageRibbon';

const zone = {
  id: 'warehouse',
  name: 'Warehouse',
  server: { host: 'example.test', port: 25565 },
  dimension: 'minecraft:overworld',
  from: { x: 0, y: 64, z: 0 },
  to: { x: 8, y: 72, z: 8 },
  createdAt: 1,
  updatedAt: 2,
  scan: {
    zoneId: 'warehouse',
    running: false,
    phase: 'complete',
    stale: false,
    complete: true,
    scannedAt: 3,
    containersFound: 2,
    containersScanned: 2,
    unknownBlocks: 0,
    failureCount: 0,
    variantCount: 1,
    itemCount: 48
  }
};

describe('storage ribbon', () => {
  it('opens a read-only exact item index and starts rescans', async () => {
    const storageAction = vi.fn(async (request: Record<string, unknown>) => request.action === 'inspect' ? {
      zone,
      scan: {
        ...zone.scan,
        zoneName: zone.name,
        failures: [],
        containers: [],
        items: [{
          variantId: 'abc123',
          name: 'oak_planks',
          displayName: 'Oak Planks',
          count: 48,
          metadata: 0,
          stackSize: 64,
          maxDurability: 0,
          durabilityRemaining: 0,
          enchanted: false,
          enchantments: [],
          customName: null,
          lore: []
        }]
      }
    } : { ok: true });
    const { user } = renderWithRuntime(<StorageRibbon />, { api: { storageAction }, snapshot: {
      selectedSessionId: 'primary',
      state: { status: 'online' },
      session: { storage: { active: null, zones: [zone] } }
    } });
    await user.click(screen.getByRole('button', { name: /Warehouse/u }));
    await waitFor(() => expect(screen.getByText('Oak Planks')).toBeTruthy());
    expect(screen.getByText('48 total')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    expect(storageAction).toHaveBeenLastCalledWith({ sessionId: 'primary', action: 'scan', zone: 'warehouse' });
  });
});
