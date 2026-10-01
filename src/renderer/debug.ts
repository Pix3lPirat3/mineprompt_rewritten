export interface RendererIssue {
  area: string;
  message: string;
  context: Record<string, string | number | boolean | null>;
  timestamp: number;
}

type ReactIssuePhase = 'caught' | 'recoverable' | 'uncaught';

const history: RendererIssue[] = [];
const listeners = new Set<(issue: RendererIssue) => void>();
const interactions: Array<{ event: string; target: string; timestamp: number }> = [];
let installed = false;

function contextValue(value: unknown): string | number | boolean | null {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Error) return value.stack || value.message;
  try { return JSON.stringify(value); } catch { return String(value); }
}

export function reportRendererIssue(area: string, message: string, context: Record<string, unknown> = {}): void {
  const issue: RendererIssue = {
    area,
    message,
    context: Object.fromEntries(Object.entries(context).map(([key, value]) => [key, contextValue(value)])),
    timestamp: Date.now()
  };
  const previous = history.at(-1);
  if (previous?.area === issue.area && previous.message === issue.message && JSON.stringify(previous.context) === JSON.stringify(issue.context)) return;
  history.push(issue);
  if (history.length > 100) history.shift();
  console.warn(`[${area}] ${message}`, issue.context);
  for (const listener of listeners) listener(issue);
}

export function subscribeRendererIssues(listener: (issue: RendererIssue) => void): () => void {
  for (const issue of history) listener(issue);
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function interactionTarget(target: EventTarget | null): string {
  if (!(target instanceof Element)) return 'unknown';
  const parts = [target.tagName.toLowerCase()];
  if (target.id) parts.push(`#${target.id}`);
  if (target.classList.length) parts.push(`.${[...target.classList].slice(0, 3).join('.')}`);
  const role = target.getAttribute('role');
  const label = target.getAttribute('aria-label');
  const slotRole = target.getAttribute('data-role');
  if (role) parts.push(`[role=${role}]`);
  if (slotRole) parts.push(`[data-role=${slotRole}]`);
  if (label) parts.push(`[aria-label=${label.slice(0, 160)}]`);
  return parts.join('');
}

function recordInteraction(event: Event): void {
  interactions.push({ event: event.type, target: interactionTarget(event.target), timestamp: Date.now() });
  if (interactions.length > 12) interactions.shift();
}

export function reportReactIssue(phase: ReactIssuePhase, error: unknown, componentStack = '', context: Record<string, unknown> = {}): void {
  const message = error instanceof Error ? error.message : String(error);
  reportRendererIssue('React', message, {
    phase,
    componentStack,
    recentInteractions: interactions,
    error,
    ...context
  });
}

export function installRendererDiagnostics(): void {
  if (installed) return;
  installed = true;
  window.addEventListener('error', (event) => reportRendererIssue('Renderer', event.message || 'Unhandled error', {
    source: event.filename,
    line: event.lineno,
    column: event.colno,
    error: event.error
  }));
  window.addEventListener('unhandledrejection', (event) => reportRendererIssue('Renderer', 'Unhandled promise rejection', { reason: event.reason }));
  window.addEventListener('pointerdown', recordInteraction, true);
  window.addEventListener('contextmenu', recordInteraction, true);
  window.addEventListener('focusin', recordInteraction, true);
}
