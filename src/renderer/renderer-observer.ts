import type { AppStore } from './store';

function dimensions(selector: string) {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    scrollWidth: element.scrollWidth,
    scrollHeight: element.scrollHeight
  };
}

function text(selector: string, maximum = 160): string | null {
  const element = document.querySelector<HTMLElement>(selector);
  return (element?.innerText || element?.textContent || '').trim().slice(0, maximum) || null;
}

export function rendererState(store: AppStore, rendererPerformance: Record<string, number> | null = null): Record<string, unknown> {
  const state = store.getState();
  const stage = document.querySelector<HTMLElement>('.inventory-stage');
  const active = document.activeElement as HTMLElement | null;
  return {
    timestamp: Date.now(),
    selectedSessionId: state.runtime.selectedSessionId,
    connection: {
      status: state.runtime.state.status,
      connectionId: state.runtime.session.connectionId,
      inventoryRevision: state.runtime.session.inventoryRevision,
      windowId: state.runtime.session.windowId,
      containerOpen: state.runtime.session.containerOpen,
      containerKind: state.runtime.session.containerLayout?.kind || null
    },
    controls: {
      terminalOpen: state.ui.terminalOpen,
      terminalHeight: state.ui.terminalHeight,
      playerFilter: state.ui.playerFilter,
      activeElement: active ? `${active.tagName.toLowerCase()}${active.id ? `#${active.id}` : ''}${active.className ? `.${String(active.className).split(/\s+/u).slice(0, 3).join('.')}` : ''}` : null
    },
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      bodyWidth: document.body.scrollWidth,
      bodyHeight: document.body.scrollHeight,
      visible: document.visibilityState,
      focused: document.hasFocus()
    },
    rendered: {
      appShell: document.querySelector('.app-shell') !== null,
      inventorySlots: document.querySelectorAll('.inventory-slot').length,
      containerWindows: document.querySelectorAll('.container-window').length,
      playerChips: document.querySelectorAll('.player-chip').length,
      targetChips: document.querySelectorAll('.target-chip').length,
      effects: document.querySelectorAll('.effect-badge').length,
      bossBars: document.querySelectorAll('.boss-bar').length,
      scoreboards: document.querySelectorAll('.scoreboard').length,
      contextMenus: document.querySelectorAll('.context-menu').length,
      tooltips: document.querySelectorAll('[role="tooltip"]').length,
      toasts: document.querySelectorAll('[role="status"]').length,
      featureErrors: [...document.querySelectorAll<HTMLElement>('.feature-error')].map((element) => (element.innerText || element.textContent || '').trim().slice(0, 512)),
      brokenImages: [...document.images].filter((image) => image.complete && image.naturalWidth === 0).slice(0, 24).map((image) => image.currentSrc || image.src),
      objectObjectVisible: (document.body.innerText || document.body.textContent || '').includes('[object Object]')
    },
    layout: {
      workspace: dimensions('.workspace'),
      inventoryFit: dimensions('.inventory-fit'),
      inventoryStage: dimensions('.inventory-stage'),
      inventoryScale: stage?.style.transform || null,
      playerInventory: dimensions('.player-inventory-cluster'),
      container: dimensions('.container-window')
    },
    contextMenu: document.querySelector('.context-menu') ? {
      title: text('.context-menu > header strong'),
      subtitle: text('.context-menu > header small'),
      entries: [...document.querySelectorAll<HTMLElement>('.context-menu [role="menuitem"]')].slice(0, 32).map((entry) => ({
        text: (entry.innerText || entry.textContent || '').trim().slice(0, 320),
        disabled: (entry as HTMLButtonElement).disabled,
        group: entry.dataset.group || null
      }))
    } : null,
    performance: {
      inventoryPipeline: state.ui.inventoryTelemetry[state.runtime.selectedSessionId] || null,
      renderer: rendererPerformance ? { ...rendererPerformance } : null
    }
  };
}

export function installRendererObserver(store: AppStore): () => void {
  let timer = 0;
  let active = true;
  const metrics = {
    storeUpdates: 0,
    storeUpdatesPerSecond: 0,
    peakStoreUpdatesPerSecond: 0,
    domMutations: 0,
    domMutationsPerSecond: 0,
    peakDomMutationsPerSecond: 0,
    longTasks: 0,
    maximumLongTaskMs: 0,
    reports: 0,
    reportFailures: 0,
    inFlightReports: 0,
    peakInFlightReports: 0,
    lastStateBuildMs: 0,
    maximumStateBuildMs: 0,
    lastReportRoundTripMs: 0,
    maximumReportRoundTripMs: 0
  };
  let rateWindowStartedAt = performance.now();
  let rateWindowStoreUpdates = 0;
  let rateWindowDomMutations = 0;
  const updateRates = () => {
    const now = performance.now();
    const elapsed = now - rateWindowStartedAt;
    if (elapsed < 1000) return;
    const storeRate = rateWindowStoreUpdates * 1000 / elapsed;
    const domRate = rateWindowDomMutations * 1000 / elapsed;
    metrics.storeUpdatesPerSecond = storeRate;
    metrics.peakStoreUpdatesPerSecond = Math.max(metrics.peakStoreUpdatesPerSecond || 0, storeRate);
    metrics.domMutationsPerSecond = domRate;
    metrics.peakDomMutationsPerSecond = Math.max(metrics.peakDomMutationsPerSecond || 0, domRate);
    rateWindowStartedAt = now;
    rateWindowStoreUpdates = 0;
    rateWindowDomMutations = 0;
  };
  const publish = () => {
    timer = 0;
    if (!active) return;
    updateRates();
    const buildStartedAt = performance.now();
    const state = rendererState(store, metrics);
    metrics.lastStateBuildMs = performance.now() - buildStartedAt;
    metrics.maximumStateBuildMs = Math.max(metrics.maximumStateBuildMs, metrics.lastStateBuildMs);
    const performanceState = state.performance as { renderer: Record<string, number> };
    performanceState.renderer = { ...metrics };
    const reportStartedAt = performance.now();
    metrics.reports += 1;
    metrics.inFlightReports += 1;
    metrics.peakInFlightReports = Math.max(metrics.peakInFlightReports, metrics.inFlightReports);
    void window.mineprompt.reportRendererState(state).then(() => {
      metrics.lastReportRoundTripMs = performance.now() - reportStartedAt;
      metrics.maximumReportRoundTripMs = Math.max(metrics.maximumReportRoundTripMs, metrics.lastReportRoundTripMs);
    }).catch(() => {
      metrics.reportFailures += 1;
    }).finally(() => {
      metrics.inFlightReports = Math.max(0, metrics.inFlightReports - 1);
    });
  };
  const schedule = () => {
    if (timer) return;
    timer = window.setTimeout(publish, 100);
  };
  const observer = new MutationObserver((records) => {
    metrics.domMutations += records.length;
    rateWindowDomMutations += records.length;
    schedule();
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'data-active', 'disabled'] });
  const unsubscribe = store.subscribe(() => {
    metrics.storeUpdates += 1;
    rateWindowStoreUpdates += 1;
    schedule();
  });
  let longTaskObserver: PerformanceObserver | null = null;
  try {
    longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        metrics.longTasks += 1;
        metrics.maximumLongTaskMs = Math.max(metrics.maximumLongTaskMs, entry.duration);
      }
    });
    longTaskObserver.observe({ type: 'longtask', buffered: true });
  } catch {
    longTaskObserver = null;
  }
  window.addEventListener('resize', schedule);
  window.addEventListener('focus', schedule);
  window.addEventListener('blur', schedule);
  document.addEventListener('visibilitychange', schedule);
  schedule();
  return () => {
    active = false;
    window.clearTimeout(timer);
    observer.disconnect();
    longTaskObserver?.disconnect();
    unsubscribe();
    window.removeEventListener('resize', schedule);
    window.removeEventListener('focus', schedule);
    window.removeEventListener('blur', schedule);
    document.removeEventListener('visibilitychange', schedule);
  };
}
