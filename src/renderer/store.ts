import { configureStore, createSlice, original, type PayloadAction } from '@reduxjs/toolkit';
import { emptyPresentation } from '../../packages/mineflayer-ui/index.js';
import { useDispatch, useSelector } from 'react-redux';
import type { ApplicationSnapshot, BotSnapshot, InventoryEventPayload, InventoryPipelineDiagnostics, InventorySessionPatch, LogEntry, SessionState } from './types';

const emptyState: SessionState = {
  status: 'disconnected',
  username: null,
  displayName: null,
  position: null,
  health: 0,
  hunger: 0,
  saturation: 0,
  armor: 0,
  experience: { level: 0, progress: 0, points: 0 },
  effects: [],
  sessionStartedAt: null,
  anonymous: false,
  lastError: null
};

export function createInitialSnapshot(): ApplicationSnapshot {
  return {
    version: '',
    selectedSessionId: 'primary',
    sessions: [],
    state: { ...emptyState, experience: { ...emptyState.experience }, effects: [] },
    accounts: [],
    servers: [],
    preferences: {
      resourcePackPolicy: 'deny',
      externalPlayerHeadsEnabled: false,
      remoteCommandsEnabled: false,
      remoteCommandPlayers: [],
      remoteCommandCapabilities: [],
      automaticReconnectEnabled: false,
      reconnectAttempts: 3,
      friendPlayers: []
    },
    workflows: [],
    miningPresets: [],
    activeMiningPresetId: null,
    activities: [],
    logs: [],
    session: {
      connectionId: 0,
      inventoryRevision: 0,
      presentation: emptyPresentation(),
      windowId: null,
      containerOpen: false,
      players: [],
      inventory: [],
      inventorySlots: [],
      inventoryLayout: null,
      container: [],
      containerSlots: [],
      containerLayout: null,
      server: null,
      targets: { cursorBlock: null, cursorEntity: null, entities: [] },
      storage: { active: null, zones: [] },
      blueprints: { blueprints: [] }
    },
    commands: [],
    engines: { profiles: [], catalog: [] }
  };
}

const initialSnapshot = createInitialSnapshot();

function shareEqual<T>(previous: T, next: T): T {
  if (Object.is(previous, next)) return previous;
  if (Array.isArray(previous) && Array.isArray(next)) {
    if (previous.length !== next.length) return next;
    const shared = next.map((entry, index) => shareEqual(previous[index], entry));
    return shared.every((entry, index) => Object.is(entry, previous[index])) ? previous : shared as T;
  }
  if (previous && next && typeof previous === 'object' && typeof next === 'object') {
    const before = previous as Record<string, unknown>;
    const after = next as Record<string, unknown>;
    const beforeKeys = Object.keys(before);
    const afterKeys = Object.keys(after);
    if (beforeKeys.length !== afterKeys.length || beforeKeys.some((key) => !Object.hasOwn(after, key))) return next;
    const shared = Object.fromEntries(afterKeys.map((key) => [key, shareEqual(before[key], after[key])]));
    return afterKeys.every((key) => Object.is(shared[key], before[key])) ? previous : shared as T;
  }
  return next;
}

function patchInventory(session: BotSnapshot, patch: InventorySessionPatch): BotSnapshot {
  return {
    ...session,
    connectionId: patch.connectionId,
    inventoryRevision: patch.inventoryRevision,
    windowId: patch.windowId,
    containerOpen: patch.containerOpen,
    inventory: patch.inventory,
    inventorySlots: patch.inventorySlots,
    inventoryLayout: patch.inventoryLayout,
    container: patch.container,
    containerSlots: patch.containerSlots,
    containerLayout: patch.containerLayout
  };
}

const runtimeSlice = createSlice({
  name: 'runtime',
  initialState: initialSnapshot,
  reducers: {
    snapshotReceived: (state, action: PayloadAction<ApplicationSnapshot>) => shareEqual((original(state) || state) as ApplicationSnapshot, action.payload),
    sessionStateReceived: (state, action: PayloadAction<SessionState & { sessionId: string }>) => {
      const session = state.sessions.find((entry) => entry.id === action.payload.sessionId);
      if (session) session.state = action.payload;
      if (state.selectedSessionId === action.payload.sessionId) state.state = action.payload;
    },
    inventoryReceived: (state, action: PayloadAction<InventoryEventPayload>) => {
      const session = state.sessions.find((entry) => entry.id === action.payload.sessionId);
      if (session) session.session = patchInventory(session.session, action.payload.session);
      if (state.selectedSessionId === action.payload.sessionId) state.session = patchInventory(state.session, action.payload.session);
    }
  }
});

interface ConsoleState {
  entries: LogEntry[];
  preparedCommand: string;
}

const consoleSlice = createSlice({
  name: 'console',
  initialState: { entries: [], preparedCommand: '' } as ConsoleState,
  reducers: {
    entryReceived: (state, action: PayloadAction<LogEntry>) => {
      const previous = state.entries.at(-1);
      if (previous?.timestamp === action.payload.timestamp && previous.message === action.payload.message && previous.sessionId === action.payload.sessionId) return;
      state.entries.push(action.payload);
      if (state.entries.length > 1000) state.entries.splice(0, state.entries.length - 1000);
    },
    commandPrepared: (state, action: PayloadAction<string>) => { state.preparedCommand = action.payload; },
    commandConsumed: (state) => { state.preparedCommand = ''; },
    cleared: (state) => { state.entries = []; }
  }
});

interface UiState {
  terminalOpen: boolean;
  terminalHeight: number;
  playerFilter: 'all' | 'nearby';
  inventoryActivity: InventoryEventPayload | null;
  inventoryTelemetry: Record<string, {
    received: number;
    lastRevision: number;
    lastEventAt: number;
    lastReceivedAt: number;
    lastTransportLagMs: number;
    peakTransportLagMs: number;
    backend: InventoryPipelineDiagnostics | null;
  }>;
}

const uiSlice = createSlice({
  name: 'ui',
  initialState: { terminalOpen: true, terminalHeight: 250, playerFilter: 'nearby', inventoryActivity: null, inventoryTelemetry: {} } as UiState,
  reducers: {
    terminalToggled: (state) => { state.terminalOpen = !state.terminalOpen; },
    terminalOpened: (state) => { state.terminalOpen = true; },
    terminalHeightChanged: (state, action: PayloadAction<number>) => { state.terminalHeight = Math.max(160, Math.min(520, action.payload)); },
    playerFilterChanged: (state, action: PayloadAction<'all' | 'nearby'>) => { state.playerFilter = action.payload; }
  },
  extraReducers: (builder) => {
    builder.addCase(runtimeActions.inventoryReceived, (state, action) => {
      if (['open', 'close', 'selection'].includes(action.payload.event.type)) state.inventoryActivity = action.payload;
      const receivedAt = Date.now();
      const lag = Math.max(0, receivedAt - action.payload.event.timestamp);
      const current = state.inventoryTelemetry[action.payload.sessionId];
      state.inventoryTelemetry[action.payload.sessionId] = {
        received: (current?.received || 0) + 1,
        lastRevision: action.payload.event.revision,
        lastEventAt: action.payload.event.timestamp,
        lastReceivedAt: receivedAt,
        lastTransportLagMs: lag,
        peakTransportLagMs: Math.max(current?.peakTransportLagMs || 0, lag),
        backend: action.payload.pipeline || current?.backend || null
      };
    });
  }
});

export const runtimeActions = runtimeSlice.actions;
export const consoleActions = consoleSlice.actions;
export const uiActions = uiSlice.actions;

const reducers = {
    runtime: runtimeSlice.reducer,
    console: consoleSlice.reducer,
    ui: uiSlice.reducer
};

export function createAppStore() {
  return configureStore({ reducer: reducers });
}

export const store = createAppStore();

export type AppStore = ReturnType<typeof createAppStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
