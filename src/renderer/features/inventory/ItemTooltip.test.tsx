import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { testItem } from '../../test-utils';
import { ItemTooltip } from './ItemTooltip';

describe('item tooltip', () => {
  it('renders Minecraft item details and technical metadata', () => {
    const anchor = document.createElement('button');
    document.body.append(anchor);
    const ref = createRef<HTMLElement>();
    ref.current = anchor;
    const item = testItem({
      slot: 5,
      name: 'diamond_pickaxe',
      displayName: 'Quarry Pick',
      displayNameHtml: '<span style="color:#FFAA00;font-weight:900">Quarry Pick</span>',
      customName: 'Quarry Pick',
      count: 1,
      hotbarIndex: null,
      maxDurability: 1561,
      durabilityUsed: 41,
      durabilityRemaining: 1520,
      enchanted: true,
      enchantments: [{ name: 'efficiency', displayName: 'Efficiency', level: 5 }],
      lore: ['Built for deep work'],
      loreHtml: ['<span style="color:#55FFFF">Built for deep work</span>'],
      metadata: 0,
      stackSize: 1,
      repairCost: 3,
      customModel: 42,
      components: ['custom_name', 'lore', 'custom_data'],
      componentDetails: [{ name: 'custom_data', displayName: 'Custom Data', value: '{"owner":"Miner"}' }],
      nbtKeys: ['Damage'],
      dataTags: [{ name: 'Damage', value: '41' }]
    });
    render(<ItemTooltip anchor={ref} item={item} point={{ x: 100, y: 100 }} visible advanced />);
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.textContent).toContain('Quarry Pick');
    expect(tooltip.textContent).toContain('Efficiency V');
    expect(tooltip.textContent).toContain('Durability: 1520 / 1561');
    expect(tooltip.textContent).toContain('Custom Data: {"owner":"Miner"}');
    expect(tooltip.textContent).toContain('Damage: 41');
    expect(tooltip.textContent).not.toContain('Components: custom_name');
    expect(tooltip.querySelector('[style*="color"]')?.getAttribute('style')).toContain('color:#FFAA00');
    expect(tooltip.style.left).not.toBe('0px');
    expect(tooltip.style.top).not.toBe('0px');
  });

  it('keeps technical data behind the advanced tooltip modifier', () => {
    const anchor = document.createElement('button');
    document.body.append(anchor);
    const ref = createRef<HTMLElement>();
    ref.current = anchor;
    render(<ItemTooltip anchor={ref} item={testItem({ componentDetails: [{ name: 'custom_data', displayName: 'Custom Data', value: '{"mode":"test"}' }] })} visible />);
    expect(screen.getByRole('tooltip').textContent).toContain('Hold Alt for advanced data');
    expect(screen.getByRole('tooltip').textContent).not.toContain('mode');
  });

  it('flips beside the pointer before crossing the viewport edge', () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 300 });
    const dimensions = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function measure(this: HTMLElement) {
      const width = this.classList.contains('item-tooltip') ? 200 : 40;
      const height = this.classList.contains('item-tooltip') ? 100 : 40;
      return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON: () => ({}) };
    });
    const anchor = document.createElement('button');
    document.body.append(anchor);
    const ref = createRef<HTMLElement>();
    ref.current = anchor;
    const item = testItem({
      slot: 1,
      count: 64,
      stackSize: 64
    });
    try {
      render(<ItemTooltip anchor={ref} item={item} point={{ x: 290, y: 80 }} visible />);
      const tooltip = screen.getByRole('tooltip');
      expect(tooltip.dataset.placement).toBe('left');
      expect(tooltip.style.left).toBe('78px');
      expect(tooltip.style.top).toBe('68px');
    } finally {
      dimensions.mockRestore();
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
    }
  });

  it('omits tooltip sections hidden by item policy', () => {
    const anchor = document.createElement('button');
    document.body.append(anchor);
    const ref = createRef<HTMLElement>();
    ref.current = anchor;
    const item = testItem({
      enchantments: [{ name: 'sharpness', displayName: 'Sharpness', level: 5 }],
      lore: ['Secret lore'],
      loreHtml: [null],
      tooltipDisplay: { hidden: false, hiddenComponents: ['enchantments', 'lore'] }
    });
    render(<ItemTooltip anchor={ref} item={item} visible />);
    expect(screen.getByRole('tooltip').textContent).not.toContain('Sharpness');
    expect(screen.getByRole('tooltip').textContent).not.toContain('Secret lore');
  });
});
