import type { ReactElement } from 'react';
import { Provider } from 'react-redux';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createAppStore, createInitialSnapshot, runtimeActions } from './store';
import type { ApplicationSnapshot, BotSnapshot, ItemStack, MinePromptApi, Preferences, SessionState, TargetSnapshot } from './types';

type SnapshotOverrides = Omit<Partial<ApplicationSnapshot>, 'preferences' | 'session' | 'state'> & {
  preferences?: Partial<Preferences>;
  session?: Omit<Partial<BotSnapshot>, 'targets'> & { targets?: Partial<TargetSnapshot> };
  state?: Partial<SessionState>;
};

export function testItem(overrides: Partial<ItemStack> = {}): ItemStack {
  return {
    slot: 0,
    name: 'stone',
    displayName: 'Stone',
    displayNameHtml: null,
    customName: null,
    count: 1,
    hotbarIndex: null,
    maxDurability: 0,
    durabilityUsed: 0,
    durabilityRemaining: 0,
    enchanted: false,
    enchantments: [],
    lore: [],
    loreHtml: [],
    metadata: 0,
    stackSize: 64,
    repairCost: 0,
    customModel: null,
    tooltipDisplay: { hidden: false, hiddenComponents: [] },
    components: [],
    componentDetails: [],
    nbtKeys: [],
    dataTags: [],
    ...overrides
  };
}

export function testSnapshot(overrides: SnapshotOverrides = {}): ApplicationSnapshot {
  const base = createInitialSnapshot();
  const targets = base.session.targets || { cursorBlock: null, cursorEntity: null, entities: [] };
  return {
    ...base,
    ...overrides,
    preferences: { ...base.preferences, ...overrides.preferences },
    state: { ...base.state, ...overrides.state, experience: { ...base.state.experience, ...overrides.state?.experience } },
    session: {
      ...base.session,
      ...overrides.session,
      targets: { ...targets, ...overrides.session?.targets }
    }
  };
}

export function installTestApi(api: Partial<MinePromptApi>): Partial<MinePromptApi> {
  Object.defineProperty(window, 'mineprompt', { configurable: true, value: api });
  return api;
}

export function renderWithRuntime(view: ReactElement, options: { api?: Partial<MinePromptApi>; snapshot?: SnapshotOverrides } = {}) {
  const testStore = createAppStore();
  testStore.dispatch(runtimeActions.snapshotReceived(testSnapshot(options.snapshot)));
  installTestApi(options.api || {});
  return { ...render(<Provider store={testStore}>{view}</Provider>), store: testStore, user: userEvent.setup() };
}
