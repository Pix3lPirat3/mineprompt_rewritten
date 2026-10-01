import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithRuntime } from '../../test-utils';
import type { ContainerLayout } from '../../types';
import { WorkstationControls } from './WorkstationControls';

function layout(kind: string, properties: Record<string, number> = {}): ContainerLayout {
  return {
    id: 4,
    type: `minecraft:${kind}`,
    kind,
    title: kind,
    columns: 3,
    slotCount: 3,
    inventoryStart: 3,
    inventoryEnd: 39,
    hotbarStart: 30,
    slotRoles: ['input', 'fuel', 'output'],
    properties,
    capabilities: { recipes: false, trades: false, progress: true, operations: ['move-items'] },
    trades: [],
    workstation: { fuel: 0.25, progress: 0.5, enchantments: [] }
  };
}

describe('workstation controls', () => {
  it('renders live furnace progress with resource-pack graphics', () => {
    renderWithRuntime(<WorkstationControls layout={layout('furnace')} request={vi.fn(async () => {})} />);
    const meter = screen.getByLabelText('Cooking 50 percent, fuel 25 percent');
    expect(meter.querySelector('img[src*="furnace_lit.png"]')).toBeTruthy();
    expect(meter.querySelector('img[src*="furnace_burn.png"]')).toBeTruthy();
  });

  it('normalizes brewing time and fuel properties', () => {
    renderWithRuntime(<WorkstationControls layout={layout('brewing', { brewTime: 100, fuel: 10 })} request={vi.fn(async () => {})} />);
    const meter = screen.getByLabelText('Brewing 75 percent, fuel 10 of 20');
    expect(meter.querySelector('img[src*="brewing_progress.png"]')).toBeTruthy();
    expect(screen.getByText(/Brewing state updates live/u)).toBeTruthy();
  });
});
