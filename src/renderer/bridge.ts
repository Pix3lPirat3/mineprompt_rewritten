import type { AppDispatch } from './store';
import { consoleActions, runtimeActions } from './store';
import { subscribeRendererIssues } from './debug';

export async function startBridge(dispatch: AppDispatch, signal?: AbortSignal): Promise<() => void> {
  let active = true;
  let initialized = false;
  const pending: Array<() => void> = [];
  const deliver = (event: () => void) => {
    if (!active) return;
    if (initialized) {
      event();
      return;
    }
    if (pending.length >= 2048) pending.shift();
    pending.push(event);
  };
  const stopIssues = subscribeRendererIssues((issue) => queueMicrotask(() => {
    if (!active) return;
    void window.mineprompt.reportRendererIssue(issue).catch(() => undefined);
    dispatch(consoleActions.entryReceived({
      level: 'warn',
      message: `[${issue.area}] ${issue.message}${Object.keys(issue.context).length ? ` ${JSON.stringify(issue.context)}` : ''}`,
      timestamp: issue.timestamp
    }));
  }));
  const remove = [
    window.mineprompt.on('snapshot', (payload) => deliver(() => dispatch(runtimeActions.snapshotReceived(payload)))),
    window.mineprompt.on('state', (payload) => deliver(() => dispatch(runtimeActions.sessionStateReceived(payload)))),
    window.mineprompt.on('inventory', (payload) => deliver(() => dispatch(runtimeActions.inventoryReceived(payload)))),
    window.mineprompt.on('log', (payload) => deliver(() => dispatch(consoleActions.entryReceived(payload))))
  ];
  const stop = () => {
    if (!active) return;
    active = false;
    pending.length = 0;
    signal?.removeEventListener('abort', stop);
    for (const listener of remove) listener();
    stopIssues();
  };
  signal?.addEventListener('abort', stop, { once: true });
  if (signal?.aborted) stop();
  let snapshot;
  try {
    snapshot = await window.mineprompt.getSnapshot();
  } catch (error) {
    stop();
    if (signal?.aborted) return () => {};
    throw error;
  }
  if (!active) return () => {};
  dispatch(runtimeActions.snapshotReceived(snapshot));
  for (const entry of snapshot.logs) dispatch(consoleActions.entryReceived(entry));
  initialized = true;
  for (const event of pending.splice(0)) event();
  return stop;
}
