import { useEffect, useRef } from 'react';

export interface MenuEntry {
  id: string;
  label: string;
  detail?: string;
  group?: string;
  enabled?: boolean;
  reason?: string;
  danger?: boolean;
  run(): void | Promise<void>;
}

interface ContextMenuProps {
  x: number;
  y: number;
  title?: string;
  subtitle?: string;
  entries: MenuEntry[];
  close(): void;
}

export function ContextMenu({ x, y, title, subtitle, entries, close }: ContextMenuProps) {
  const menu = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    const dismiss = (event: Event) => {
      if (!menu.current?.contains(event.target as Node)) closeRef.current();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('keydown', keyboard);
    menu.current?.focus();
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('keydown', keyboard);
    };
  }, []);

  const left = Math.max(8, Math.min(x, window.innerWidth - 310));
  const top = Math.max(8, Math.min(y, window.innerHeight - Math.max(100, entries.length * 52 + (title ? 48 : 0))));

  return (
    <div ref={menu} className="context-menu" role="menu" tabIndex={-1} style={{ left, top }}>
      {title ? <header><strong>{title}</strong>{subtitle ? <small>{subtitle}</small> : null}</header> : null}
      {entries.map((entry) => (
        <button
          key={entry.id}
          type="button"
          role="menuitem"
          className={entry.danger ? 'context-menu__danger' : undefined}
          data-group={entry.group}
          disabled={entry.enabled === false}
          title={entry.enabled === false ? entry.reason : undefined}
          onClick={() => {
            close();
            void entry.run();
          }}
        >
          <span>{entry.label}</span>
          {entry.enabled === false && entry.reason ? <small>{entry.reason}</small> : entry.detail ? <small>{entry.detail}</small> : null}
        </button>
      ))}
    </div>
  );
}
