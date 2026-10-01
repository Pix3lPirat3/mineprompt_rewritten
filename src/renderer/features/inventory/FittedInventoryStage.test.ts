import { describe, expect, it } from 'vitest';
import { calculateInventoryFit } from './FittedInventoryStage';

describe('inventory stage fitting', () => {
  it('preserves the natural size when the viewport has room', () => {
    expect(calculateInventoryFit(900, 600, 820, 480)).toEqual({ scale: 1, width: 820, height: 480 });
  });

  it('uses the tightest dimension for the whole inventory surface', () => {
    expect(calculateInventoryFit(615, 500, 820, 480)).toEqual({ scale: 0.75, width: 615, height: 360 });
    expect(calculateInventoryFit(900, 360, 820, 480)).toEqual({ scale: 0.75, width: 615, height: 360 });
  });

  it('keeps the interface readable and allows scrolling below its minimum scale', () => {
    expect(calculateInventoryFit(200, 100, 820, 480)).toEqual({ scale: 0.4, width: 328, height: 192 });
  });
});
