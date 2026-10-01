import { useDraggable, useDroppable } from '@dnd-kit/react';
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import type { ItemStack } from '../../types';
import { ItemIcon } from './ItemIcon';
import { ItemTooltip } from './ItemTooltip';

export interface SlotAddress {
  scope: 'inventory' | 'container';
  slot: number;
}

interface InventorySlotProps extends SlotAddress {
  item: ItemStack | null;
  role?: string;
  selected?: boolean;
  using?: boolean;
  onClick(event: MouseEvent<HTMLButtonElement>, address: SlotAddress, item: ItemStack | null): void;
  onMenu(event: MouseEvent<HTMLButtonElement>, address: SlotAddress, item: ItemStack): void;
}

export function InventorySlot({ scope, slot, item, role = 'storage', selected = false, using = false, onClick, onMenu }: InventorySlotProps) {
  const anchor = useRef<HTMLButtonElement | null>(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPoint, setTooltipPoint] = useState<{ x: number; y: number } | null>(null);
  const [advancedTooltip, setAdvancedTooltip] = useState(false);
  const id = `${scope}:${slot}`;
  const draggableData = useMemo(() => ({ scope, slot, item }), [item, scope, slot]);
  const droppableData = useMemo(() => ({ scope, slot }), [scope, slot]);
  const draggable = useDraggable({ id, disabled: !item, data: draggableData });
  const droppable = useDroppable({ id, data: droppableData });
  const draggableRef = draggable.ref;
  const droppableRef = droppable.ref;
  const connect = useCallback((element: HTMLButtonElement | null) => {
    anchor.current = element;
    draggableRef(element);
    droppableRef(element);
  }, [draggableRef, droppableRef]);

  useEffect(() => {
    if (!tooltipVisible) return;
    const update = (event: KeyboardEvent) => {
      if (event.key === 'Alt') setAdvancedTooltip(event.type === 'keydown');
    };
    const clear = () => setAdvancedTooltip(false);
    window.addEventListener('keydown', update);
    window.addEventListener('keyup', update);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', update);
      window.removeEventListener('keyup', update);
      window.removeEventListener('blur', clear);
    };
  }, [tooltipVisible]);

  return (
    <button
      ref={connect}
      type="button"
      className="inventory-slot"
      data-role={role}
      data-selected={selected}
      data-using={using}
      data-dragging={draggable.isDragging}
      data-drop-target={droppable.isDropTarget}
      aria-label={item ? `${item.displayName}, ${item.count}, slot ${slot}` : `Empty ${role} slot ${slot}`}
      title={item ? undefined : `${role} slot ${slot}`}
      onPointerEnter={(event: PointerEvent<HTMLButtonElement>) => {
        setTooltipPoint({ x: event.clientX, y: event.clientY });
        setAdvancedTooltip(event.altKey);
        setTooltipVisible(true);
      }}
      onPointerMove={(event: PointerEvent<HTMLButtonElement>) => {
        setTooltipPoint({ x: event.clientX, y: event.clientY });
        setAdvancedTooltip(event.altKey);
      }}
      onPointerLeave={() => {
        setTooltipPoint(null);
        setTooltipVisible(false);
      }}
      onFocus={() => setTooltipVisible(true)}
      onBlur={() => setTooltipVisible(false)}
      onKeyDown={(event) => { if (event.key === 'Alt') setAdvancedTooltip(true); }}
      onKeyUp={(event) => { if (event.key === 'Alt') setAdvancedTooltip(false); }}
      onClick={(event) => onClick(event, { scope, slot }, item)}
      onContextMenu={(event) => {
        event.preventDefault();
        if (item) onMenu(event, { scope, slot }, item);
      }}
    >
      {item ? <ItemIcon item={item} /> : null}
      {item ? <ItemTooltip anchor={anchor} item={item} point={tooltipPoint} visible={tooltipVisible && !draggable.isDragging && item.tooltipDisplay?.hidden !== true} advanced={advancedTooltip} /> : null}
    </button>
  );
}
