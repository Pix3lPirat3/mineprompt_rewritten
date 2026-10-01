import { DragDropProvider } from '@dnd-kit/react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { testItem } from '../../test-utils';
import type { ItemStack } from '../../types';
import { InventorySlot } from './InventorySlot';

describe('inventory slot tooltip', () => {
  it('opens through real pointer behavior and tolerates an in-flight older snapshot', async () => {
    const item = testItem({ displayName: 'Quarry Pick', lore: ['Built for deep work'] });
    const incomplete = { ...item } as ItemStack;
    Reflect.deleteProperty(incomplete, 'displayNameHtml');
    Reflect.deleteProperty(incomplete, 'loreHtml');
    Reflect.deleteProperty(incomplete, 'componentDetails');
    Reflect.deleteProperty(incomplete, 'dataTags');
    const user = userEvent.setup();
    render(
      <DragDropProvider>
        <InventorySlot scope="inventory" slot={9} item={incomplete} onClick={vi.fn()} onMenu={vi.fn()} />
      </DragDropProvider>
    );
    const slot = screen.getByRole('button', { name: /Quarry Pick/u });
    await user.hover(slot);
    expect(screen.getByRole('tooltip').textContent).toContain('Quarry Pick');
    expect(screen.getByRole('tooltip').textContent).toContain('Built for deep work');
    await user.unhover(slot);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('honors an item policy that hides its tooltip', async () => {
    const item = testItem({ displayName: 'Hidden Sword', tooltipDisplay: { hidden: true, hiddenComponents: [] } });
    const user = userEvent.setup();
    render(
      <DragDropProvider>
        <InventorySlot scope="inventory" slot={9} item={item} onClick={vi.fn()} onMenu={vi.fn()} />
      </DragDropProvider>
    );
    await user.hover(screen.getByRole('button', { name: /Hidden Sword/u }));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('reveals advanced details when Alt changes during a stationary hover', async () => {
    const item = testItem({ displayName: 'Debug Sword', componentDetails: [{ name: 'custom_data', displayName: 'Custom Data', value: '{"mode":"test"}' }] });
    const user = userEvent.setup();
    render(
      <DragDropProvider>
        <InventorySlot scope="inventory" slot={36} item={item} onClick={vi.fn()} onMenu={vi.fn()} />
      </DragDropProvider>
    );
    await user.hover(screen.getByRole('button', { name: /Debug Sword/u }));
    expect(screen.getByRole('tooltip').textContent).not.toContain('"mode"');
    fireEvent.keyDown(window, { key: 'Alt' });
    expect(screen.getByRole('tooltip').textContent).toContain('"mode"');
    fireEvent.keyUp(window, { key: 'Alt' });
    expect(screen.getByRole('tooltip').textContent).not.toContain('"mode"');
  });

  it('keeps drag registration stable through rapid live item updates', async () => {
    const user = userEvent.setup();
    const view = (count: number) => (
      <DragDropProvider>
        <InventorySlot scope="inventory" slot={9} item={testItem({ slot: 9, displayName: 'Live Stack', count })} onClick={vi.fn()} onMenu={vi.fn()} />
      </DragDropProvider>
    );
    const rendered = render(view(1));
    await user.hover(screen.getByRole('button', { name: /Live Stack/u }));
    for (let count = 2; count <= 64; count += 1) rendered.rerender(view(count));
    expect(screen.getByRole('tooltip').textContent).toContain('Live Stack');
    expect(screen.getByRole('button', { name: /64, slot 9/u })).toBeTruthy();
  });
});
