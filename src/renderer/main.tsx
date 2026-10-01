import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { App } from './App';
import { installRendererDiagnostics, reportReactIssue } from './debug';
import { installRendererObserver } from './renderer-observer';
import { store } from './store';
import './styles.css';

installRendererDiagnostics();
const root = document.querySelector('#root');
if (!root) throw new Error('Application root was not found.');

function runtimeContext() {
  const state = store.getState();
  return {
    selectedSessionId: state.runtime.selectedSessionId,
    status: state.runtime.state.status,
    connectionId: state.runtime.session.connectionId,
    inventoryRevision: state.runtime.session.inventoryRevision,
    windowId: state.runtime.session.windowId,
    containerKind: state.runtime.session.containerLayout?.kind || null,
    inventoryItems: state.runtime.session.inventory.length,
    containerItems: state.runtime.session.container.length
  };
}

createRoot(root, {
  onCaughtError: (error, info) => reportReactIssue('caught', error, info.componentStack, {
    ...runtimeContext(),
    boundary: (info.errorBoundary?.props as { label?: string } | undefined)?.label || 'unknown'
  }),
  onRecoverableError: (error, info) => reportReactIssue('recoverable', error, info.componentStack, runtimeContext()),
  onUncaughtError: (error, info) => reportReactIssue('uncaught', error, info.componentStack, runtimeContext())
}).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>
);

installRendererObserver(store);
