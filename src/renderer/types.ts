export type ConnectionStatus = 'disconnected' | 'authenticating' | 'connecting' | 'joining' | 'online' | 'reconnecting' | 'failed';

export interface Experience {
  level: number;
  progress: number;
  points: number;
}

export interface Effect {
  effect: string;
  displayName: string;
  amplifier: number;
  duration: number;
  ambient?: boolean;
  showParticles?: boolean;
  showIcon?: boolean;
}

export interface HudState {
  health: number;
  maxHealth: number;
  absorption: number;
  food: number;
  saturation: number;
  oxygen: number;
  armor: number;
  armorToughness: number;
  experience: Experience;
  selectedHotbar: number;
  usingItem: boolean;
  hardcore: boolean;
  gameMode: string;
  dimension: string;
}

export interface BossBarState {
  id: string;
  title: string;
  progress: number;
  dividers: 0 | 6 | 10 | 12 | 20;
  color: 'pink' | 'blue' | 'red' | 'green' | 'yellow' | 'purple' | 'white';
  darkenSky: boolean;
  dragon: boolean;
  fog: boolean;
}

export interface PresentationSnapshot {
  hud: HudState;
  bossBars: BossBarState[];
  scoreboard: { name: string; title: string; items: Array<{ name: string; displayName: string; value: number }> } | null;
  overlay: { title: string; subtitle: string; actionBar: string };
  vehicle: { id: number; name: string; displayName: string; health: number | null; maxHealth: number | null } | null;
}

export interface SessionState {
  status: ConnectionStatus;
  username: string | null;
  displayName: string | null;
  position: string | null;
  health: number;
  hunger: number;
  saturation: number;
  armor: number;
  experience: Experience;
  effects: Effect[];
  sessionStartedAt: number | null;
  anonymous: boolean;
  lastError: string | null;
}

export interface ItemStack {
  slot: number;
  name: string;
  displayName: string;
  displayNameHtml: string | null;
  customName: string | null;
  count: number;
  hotbarIndex: number | null;
  maxDurability: number;
  durabilityUsed: number;
  durabilityRemaining: number;
  enchanted: boolean;
  enchantments: Array<{ name: string; displayName: string; level: number }>;
  lore: string[];
  loreHtml: Array<string | null>;
  metadata: number;
  stackSize: number;
  repairCost: number;
  customModel: string | number | null;
  tooltipDisplay: { hidden: boolean; hiddenComponents: string[] };
  components: string[];
  componentDetails: Array<{ name: string; displayName: string; value: string }>;
  nbtKeys: string[];
  dataTags: Array<{ name: string; value: string }>;
}

export interface PlayerActionDescriptor {
  id: string;
  label: string;
  detail?: string;
  enabled: boolean;
  reason: string;
  danger: boolean;
  preparesInput: boolean;
  relationshipProtected: boolean;
  overrideAllowed: boolean;
}

export interface PlayerPresence {
  username: string;
  uuid: string | null;
  ping: number | null;
  visible: boolean;
  nearby: boolean;
  distance: number | null;
  friend: boolean;
  actions: PlayerActionDescriptor[];
}

export interface TargetActionDescriptor {
  id: string;
  label: string;
  detail?: string;
  enabled: boolean;
  reason: string;
  danger?: boolean;
  relationshipProtected?: boolean;
  overrideAllowed?: boolean;
}

export interface TargetPosition {
  x: number;
  y: number;
  z: number;
}

export interface EntityTarget {
  id: number;
  kind: 'player' | 'item' | 'villager' | 'mob' | 'entity';
  name: string;
  displayName: string;
  username: string | null;
  distance: number;
  position: TargetPosition;
  count: number | null;
  text?: string | null;
  friend: boolean;
  actions: TargetActionDescriptor[];
}

export interface BlockTarget {
  name: string;
  displayName: string;
  position: TargetPosition;
  distance: number;
  diggable: boolean;
  hardness: number | null;
  tree: { species: string; part: 'log' | 'leaves' } | null;
  actions: TargetActionDescriptor[];
}

export interface TargetSnapshot {
  cursorBlock: BlockTarget | null;
  cursorEntity: EntityTarget | null;
  entities: EntityTarget[];
}

export interface StorageScanSummary {
  zoneId: string;
  running: boolean;
  phase: string;
  stale: boolean;
  complete: boolean;
  scannedAt: number | null;
  containersFound: number;
  containersScanned: number;
  unknownBlocks: number;
  failureCount: number;
  variantCount: number;
  itemCount: number;
}

export interface StorageZoneSummary {
  id: string;
  name: string;
  server: { host: string; port: number };
  dimension: string;
  from: TargetPosition;
  to: TargetPosition;
  createdAt: number;
  updatedAt: number;
  scan: StorageScanSummary | null;
}

export interface StorageSnapshot {
  active: StorageScanSummary | null;
  zones: StorageZoneSummary[];
}

export interface BlueprintSummary {
  id: string;
  hash: string;
  name: string;
  sourceFile: string;
  sourceFormat: string;
  edition: 'java';
  version: string;
  detectedVersion: string | null;
  dimensions: TargetPosition;
  volume: number;
  offset: TargetPosition;
  paletteSize: number;
  blockEntityCount: number;
  materialTypes: number;
  materialCount: number;
  unsupportedCount: number;
  supportSensitiveCount: number;
  importedAt: number;
}

export interface BlueprintMaterial {
  name: string;
  displayName: string;
  count: number;
}

export interface BlueprintSnapshot {
  blueprints: BlueprintSummary[];
}

export interface StorageIndexedItem {
  variantId: string;
  name: string;
  displayName: string;
  count: number;
  metadata: number;
  stackSize: number;
  maxDurability: number;
  durabilityRemaining: number;
  enchanted: boolean;
  enchantments: Array<{ name: string; displayName: string; level: number }>;
  customName: string | null;
  lore: string[];
}

export interface StorageScanDetails {
  zoneId: string;
  zoneName: string;
  running: boolean;
  phase: string;
  stale: boolean;
  complete: boolean;
  scannedAt: number | null;
  containersFound: number;
  containersScanned: number;
  unknownBlocks: number;
  failures: Array<{ position: TargetPosition | null; message: string }>;
  items: StorageIndexedItem[];
  containers: Array<{ position: TargetPosition; block: string; slotCount: number; itemCount: number; items: StorageIndexedItem[] }>;
}

export interface InventoryLayout {
  kind: 'player';
  inventoryStart: number;
  inventoryEnd: number;
  hotbarStart: number;
  selectedHotbar: number;
}

export interface ContainerLayout {
  id: number | null;
  type: string;
  kind: string;
  title: string;
  columns: number;
  slotCount: number;
  inventoryStart: number;
  inventoryEnd: number;
  hotbarStart: number;
  slotRoles: string[];
  properties: Record<string, number>;
  capabilities: { recipes: boolean; trades: boolean; progress: boolean; operations: string[] };
  trades: TradeDescriptor[];
  workstation: {
    fuel: number | null;
    progress: number | null;
    enchantments: Array<{ index: number; level: number; available: boolean }>;
  };
}

export interface TradeDescriptor {
  index: number;
  firstInput: ItemStack | null;
  secondInput: ItemStack | null;
  output: ItemStack | null;
  realPrice: number;
  uses: number;
  maximumUses: number;
  disabled: boolean;
}

export interface RecipeDescriptor {
  id: string;
  name: string;
  displayName: string;
  resultCount: number;
  requiresTable: boolean;
  available: boolean;
  ingredients: Array<{ name: string; displayName: string; count: number }>;
}

export interface BotSnapshot {
  connectionId: number;
  inventoryRevision: number;
  presentation: PresentationSnapshot;
  username?: string;
  windowId: number | null;
  containerOpen: boolean;
  players: PlayerPresence[];
  inventory: ItemStack[];
  inventorySlots: Array<ItemStack | null>;
  inventoryLayout: InventoryLayout | null;
  container: ItemStack[];
  containerSlots: Array<ItemStack | null>;
  containerLayout: ContainerLayout | null;
  server: { host: string; port: number; version: string } | null;
  targets?: TargetSnapshot;
  storage: StorageSnapshot;
  blueprints: BlueprintSnapshot;
}

export type InventorySessionPatch = Pick<BotSnapshot,
  'connectionId' | 'inventoryRevision' | 'windowId' | 'containerOpen' |
  'inventory' | 'inventorySlots' | 'inventoryLayout' |
  'container' | 'containerSlots' | 'containerLayout'>;

export interface Activity {
  id: string;
  label: string;
  detail: string;
  startedAt: number;
  resources: string[];
}

export interface DurationDiagnostics {
  samples: number;
  lastMs: number;
  averageMs: number;
  maximumMs: number;
}

export interface InventoryPipelineDiagnostics {
  received: number;
  published: number;
  coalesced: number;
  lastRevision: number;
  firstEventAt: number | null;
  lastEventAt: number | null;
  lastEventAgeMs: number | null;
  eventsPerSecond: number;
  publicationsPerSecond: number;
  peakEventsPerSecond: number;
  byType: Record<string, number>;
  byScope: Record<string, number>;
  itemSerialization: DurationDiagnostics;
  inventorySnapshotSerialization: DurationDiagnostics;
}

export interface BotSession {
  id: string;
  engine?: EngineProfile;
  state: SessionState;
  activities: Activity[];
  session: BotSnapshot;
  commands: CommandDescriptor[];
  diagnostics?: { inventory: InventoryPipelineDiagnostics | null; snapshots?: Record<string, number | boolean> | null };
  process: { isolated: boolean; pid: number | null; status: 'starting' | 'running' | 'failed' };
}

export interface EngineProfile {
  id: string;
  profile: string;
  name: string;
  kind?: 'bundled' | 'packages' | 'umbrella';
  edition: 'java' | 'bedrock';
  revision: string | null;
  installed?: boolean;
  verified?: boolean;
  installedAt?: string;
  source?: string;
  sources?: Array<Record<string, unknown>>;
  warnings?: string[];
}

export interface EngineSnapshot {
  profiles: EngineProfile[];
  catalog: EngineProfile[];
}

export interface WorkflowStep {
  id: string;
  type: 'command' | 'wait';
  command?: string;
  durationMs?: number;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  repeat: number;
  resources: string[];
  steps: WorkflowStep[];
}

export interface Account {
  username: string;
  authentication: boolean;
}

export interface ServerProfile {
  name: string;
  host: string;
  port: number;
  version: string;
  fakeHost: string;
}

export interface Preferences {
  resourcePackPolicy: 'accept' | 'deny';
  externalPlayerHeadsEnabled: boolean;
  remoteCommandsEnabled: boolean;
  remoteCommandPlayers: string[];
  remoteCommandCapabilities: string[];
  automaticReconnectEnabled: boolean;
  reconnectAttempts: number;
  friendPlayers: string[];
}

export interface MiningPolicy {
  tool: 'auto' | 'held' | 'hand';
  lowDurability: 'switch' | 'stop' | 'skip';
  minimumDurability: number;
  allowFluidAdjacent: boolean;
  allowFalling: boolean;
  include: string[];
  exclude: string[];
  reach: number;
  maxBlocks: number;
}

export interface MiningPreset {
  id: string;
  name: string;
  policy: MiningPolicy;
}

export interface CommandDescriptor {
  command: string;
  aliases: string[];
  category: string;
  capability: string | null;
  description: string;
  usage: string;
  requiresConnection: boolean;
  toolName: string;
  risk: 'restricted' | 'read' | 'standard' | 'dangerous';
  approval: 'none' | 'recommended' | 'required';
  agentVisible: boolean;
}

export interface ApplicationSnapshot {
  version: string;
  selectedSessionId: string;
  sessions: BotSession[];
  state: SessionState;
  accounts: Account[];
  servers: ServerProfile[];
  preferences: Preferences;
  workflows: WorkflowDefinition[];
  miningPresets: MiningPreset[];
  activeMiningPresetId: string | null;
  activities: Activity[];
  session: BotSnapshot;
  logs: LogEntry[];
  commands: CommandDescriptor[];
  engines: EngineSnapshot;
}

export interface LogEntry {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: number;
  sessionId?: string;
}

export interface InventoryEvent {
  revision: number;
  timestamp: number;
  type: 'open' | 'close' | 'selection' | 'update' | 'property';
  scope: 'inventory' | 'container';
  windowId?: number | null;
  slot?: number;
  propertyName?: string;
  value?: number;
  processing?: { itemSerializationMs: number };
}

export interface InventoryEventPayload {
  sessionId: string;
  event: InventoryEvent;
  session: InventorySessionPatch;
  pipeline?: InventoryPipelineDiagnostics;
}

export interface InventoryRequest {
  sessionId: string;
  connectionId: number;
  windowId: number | null;
  expectedRevision?: number;
  scope: 'inventory' | 'container';
  action: string;
  [key: string]: unknown;
}

export interface MinePromptApi {
  getSnapshot(): Promise<ApplicationSnapshot>;
  execute(input: string, sessionId?: string): Promise<{ ok: boolean; error?: string }>;
  connect(options: Record<string, unknown>): Promise<{ ok: boolean; sessionId: string }>;
  disconnect(sessionId?: string): Promise<{ ok: boolean }>;
  complete(input: string, sessionId?: string): Promise<string[]>;
  selectSession(sessionId: string): Promise<{ ok: boolean }>;
  closeSession(sessionId: string): Promise<{ ok: boolean }>;
  reloadCommands(): Promise<{ ok: boolean }>;
  inventoryAction(request: InventoryRequest): Promise<{ ok: boolean; message?: string }>;
  getUiState(request?: { sessionId?: string; maximumIssues?: number }): Promise<Record<string, unknown>>;
  reportRendererIssue(issue: { area: string; message: string; context: Record<string, string | number | boolean | null>; timestamp: number }): Promise<{ ok: boolean }>;
  reportRendererState(state: Record<string, unknown>): Promise<{ ok: boolean }>;
  playerAction(request: Record<string, unknown>): Promise<{ ok: boolean; message?: string; prepareCommand?: string }>;
  targetAction(request: Record<string, unknown>): Promise<{ ok: boolean; message?: string }>;
  storageAction(request: Record<string, unknown>): Promise<Record<string, unknown>>;
  blueprintAction(request: Record<string, unknown>): Promise<Record<string, unknown>>;
  importBlueprint(options: { sessionId?: string; edition?: 'java'; version?: string; name?: string }): Promise<{ ok: boolean; canceled?: boolean; blueprint?: BlueprintSummary }>;
  removeBlueprint(request: { sessionId?: string; blueprint: string }): Promise<{ ok: boolean }>;
  capabilities(request?: { sessionId?: string }): Promise<Record<string, unknown>>;
  capabilityAction(request: { sessionId?: string; actionId: string; input?: Record<string, unknown> }): Promise<unknown>;
  recipes(request: Record<string, unknown>): Promise<RecipeDescriptor[]>;
  craft(request: Record<string, unknown>): Promise<{ ok: boolean; message?: string }>;
  saveWorkflow(workflow: WorkflowDefinition): Promise<{ ok: boolean; workflow: WorkflowDefinition }>;
  removeWorkflow(id: string): Promise<{ ok: boolean }>;
  runWorkflow(request: Record<string, unknown>): Promise<{ ok: boolean; activityId?: string }>;
  stopWorkflow(request: Record<string, unknown>): Promise<{ ok: boolean }>;
  saveProfile(profile: Record<string, unknown>): Promise<{ ok: boolean }>;
  removeProfile(username: string): Promise<{ ok: boolean }>;
  saveServer(profile: Record<string, unknown>): Promise<{ ok: boolean }>;
  removeServer(name: string): Promise<{ ok: boolean }>;
  savePreferences(preferences: Preferences): Promise<{ ok: boolean; preferences: Preferences }>;
  saveMiningPreset(preset: Partial<MiningPreset> & { name: string; policy: MiningPolicy; activate?: boolean }): Promise<{ ok: boolean; preset: MiningPreset }>;
  removeMiningPreset(id: string): Promise<{ ok: boolean }>;
  selectMiningPreset(id: string | null): Promise<{ ok: boolean; activeMiningPresetId: string | null }>;
  engineList(): Promise<EngineSnapshot>;
  engineResearch(request?: { owner?: string }): Promise<{ pulls: Array<Record<string, unknown>> }>;
  enginePlan(request: Record<string, unknown>): Promise<Record<string, unknown>>;
  engineInstall(request: Record<string, unknown>): Promise<{ ok: boolean; profile: EngineProfile }>;
  engineUse(request: { profile: string; sessionId?: string; makeDefault?: boolean }): Promise<{ ok: boolean; sessionId: string; engine: EngineProfile }>;
  engineRemove(request: { profile: string }): Promise<{ ok: boolean; id: string }>;
  checkForUpdate(): Promise<Record<string, unknown>>;
  openReleases(): Promise<void>;
  exportDiagnostics(): Promise<{ ok: boolean; canceled?: boolean }>;
  on(channel: 'snapshot', callback: (payload: ApplicationSnapshot) => void): () => void;
  on(channel: 'state', callback: (payload: SessionState & { sessionId: string }) => void): () => void;
  on(channel: 'inventory', callback: (payload: InventoryEventPayload) => void): () => void;
  on(channel: 'log', callback: (payload: LogEntry) => void): () => void;
  on(channel: 'attention', callback: (payload: { sessionId?: string }) => void): () => void;
}
