import { useRef } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';

export function useHorizontalDrag() {
  const ref = useRef<HTMLDivElement>(null);
  const pointer = useRef({ id: -1, x: 0, left: 0, moved: false });

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    const element = ref.current;
    if (!element || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    element.scrollLeft += event.deltaY;
    event.preventDefault();
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const element = ref.current;
    if (!element || event.button !== 0) return;
    pointer.current = { id: event.pointerId, x: event.clientX, left: element.scrollLeft, moved: false };
    if (typeof element.setPointerCapture === 'function') element.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const element = ref.current;
    if (!element || pointer.current.id !== event.pointerId) return;
    const delta = event.clientX - pointer.current.x;
    if (Math.abs(delta) > 4) pointer.current.moved = true;
    element.scrollLeft = pointer.current.left - delta;
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const element = ref.current;
    if (element && typeof element.hasPointerCapture === 'function' && element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    pointer.current.id = -1;
  };

  const onClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!pointer.current.moved) return;
    event.preventDefault();
    event.stopPropagation();
    pointer.current.moved = false;
  };

  return { ref, onWheel, onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onClickCapture };
}
