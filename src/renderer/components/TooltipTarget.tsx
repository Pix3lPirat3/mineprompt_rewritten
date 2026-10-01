import { useRef, useState, type ReactNode } from 'react';
import { HoverTooltip, type TooltipPoint } from './HoverTooltip';

export function TooltipTarget({ className = '', label, children, tooltip }: { className?: string; label: string; children: ReactNode; tooltip: ReactNode }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [point, setPoint] = useState<TooltipPoint | null>(null);
  return (
    <span
      ref={anchor}
      className={className}
      aria-label={label}
      tabIndex={0}
      onPointerEnter={(event) => { setPoint({ x: event.clientX, y: event.clientY }); setVisible(true); }}
      onPointerMove={(event) => setPoint({ x: event.clientX, y: event.clientY })}
      onPointerLeave={() => { setPoint(null); setVisible(false); }}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      <HoverTooltip anchor={anchor} point={point} visible={visible}>{tooltip}</HoverTooltip>
    </span>
  );
}
