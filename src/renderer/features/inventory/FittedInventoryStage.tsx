import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

interface FittedInventoryStageProps {
  split: boolean;
  children: ReactNode;
}

interface Fit {
  scale: number;
  width: number;
  height: number;
}

export function calculateInventoryFit(availableWidth: number, availableHeight: number, contentWidth: number, contentHeight: number): Fit {
  if (availableWidth <= 0 || availableHeight <= 0 || contentWidth <= 0 || contentHeight <= 0) return { scale: 1, width: contentWidth, height: contentHeight };
  const scale = Math.min(1, Math.max(0.4, Math.min(availableWidth / contentWidth, availableHeight / contentHeight)));
  return { scale, width: Math.ceil(contentWidth * scale - 0.000001), height: Math.ceil(contentHeight * scale - 0.000001) };
}

export function FittedInventoryStage({ split, children }: FittedInventoryStageProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<Fit>({ scale: 1, width: 0, height: 0 });

  useLayoutEffect(() => {
    const host = viewport.current;
    const content = stage.current;
    if (!host || !content) return;
    let frame = 0;
    const measure = () => {
      const styles = window.getComputedStyle(host);
      const availableWidth = host.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);
      const availableHeight = host.clientHeight - parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom);
      const next = calculateInventoryFit(availableWidth, availableHeight, content.offsetWidth, content.offsetHeight);
      setFit((current) => current.scale === next.scale && current.width === next.width && current.height === next.height ? current : next);
    };
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(host);
    observer.observe(content);
    window.addEventListener('resize', schedule);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={viewport} className="inventory-fit">
      <div className="inventory-stage-frame" style={{ width: fit.width || undefined, height: fit.height || undefined }}>
        <div ref={stage} className={`inventory-stage${split ? ' inventory-stage--split' : ''}`} style={{ transform: `scale(${fit.scale})` }}>
          {children}
        </div>
      </div>
    </div>
  );
}
