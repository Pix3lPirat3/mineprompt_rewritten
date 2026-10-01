import { useLayoutEffect, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

export interface TooltipPoint {
  x: number;
  y: number;
}

export function HoverTooltip({ anchor, point = null, visible, className = '', children }: {
  anchor: RefObject<HTMLElement | null>;
  point?: TooltipPoint | null;
  visible: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number; placement: 'left' | 'right' } | null>(null);

  useLayoutEffect(() => {
    if (!visible) {
      setPosition((current) => current === null ? current : null);
      return;
    }
    if (!anchor.current || !element) return;
    const update = () => {
      const anchorBox = anchor.current?.getBoundingClientRect();
      const tooltipBox = element.getBoundingClientRect();
      if (!anchorBox) return;
      const margin = 8;
      const gap = 12;
      const originX = point?.x ?? anchorBox.right;
      const originY = point?.y ?? anchorBox.top;
      const width = Math.min(tooltipBox.width, Math.max(0, window.innerWidth - margin * 2));
      const height = Math.min(tooltipBox.height, Math.max(0, window.innerHeight - margin * 2));
      const fitsRight = originX + gap + width <= window.innerWidth - margin;
      const placement: 'left' | 'right' = fitsRight ? 'right' : 'left';
      const preferredLeft = fitsRight ? originX + gap : originX - gap - width;
      const next = {
        left: Math.max(margin, Math.min(preferredLeft, window.innerWidth - width - margin)),
        top: Math.max(margin, Math.min(originY - 12, window.innerHeight - height - margin)),
        placement
      };
      setPosition((current) => current?.left === next.left && current.top === next.top && current.placement === next.placement ? current : next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (anchor.current) observer.observe(anchor.current);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchor, element, point?.x, point?.y, visible]);

  if (!visible) return null;
  const anchorBox = anchor.current?.getBoundingClientRect();
  const initialX = point?.x ?? anchorBox?.right ?? 8;
  const initialY = point?.y ?? anchorBox?.top ?? 8;
  return createPortal(
    <div
      ref={setElement}
      className={`minecraft-tooltip ${className}`.trim()}
      data-placement={position?.placement || 'right'}
      role="tooltip"
      style={position || { left: Math.max(8, Math.min(initialX + 12, window.innerWidth - 8)), top: Math.max(8, Math.min(initialY - 12, window.innerHeight - 8)) }}
    >
      {children}
    </div>,
    document.body
  );
}
