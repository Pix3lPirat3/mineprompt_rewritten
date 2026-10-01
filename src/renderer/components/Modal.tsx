import type { ReactNode } from 'react';

interface ModalProps {
  title: string;
  eyebrow: string;
  children: ReactNode;
  close(): void;
}

export function Modal({ title, eyebrow, children, close }: ModalProps) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) close();
    }}>
      <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>
          <button type="button" onClick={close}>Close</button>
        </header>
        {children}
      </section>
    </div>
  );
}
