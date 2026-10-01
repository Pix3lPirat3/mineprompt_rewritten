import type { AppDispatch } from './store';
import { consoleActions, runtimeActions } from './store';
import { subscribeRendererIssues } from './debug';

export async function startBridge(dispatch: AppDispatch, signal?: AbortSignal): Promise<() => void> {
  let active = true;
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
    window.mineprompt.on('snapshot', (payload) => dispatch(runtimeActions.snapshotReceived(payload))),
    window.mineprompt.on('state', (payload) => dispatch(runtimeActions.sessionStateReceived(payload))),
    window.mineprompt.on('inventory', (payload) => dispatch(runtimeActions.inventoryReceived(payload))),
    window.mineprompt.on('log', (payload) => dispatch(consoleActions.entryReceived(payload)))
  ];
  const stop = () => {
    if (!active) return;
    active = false;
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
  return stop;
}
