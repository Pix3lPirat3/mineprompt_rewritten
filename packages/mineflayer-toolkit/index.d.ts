import type { Bot } from 'mineflayer';
import type { EventEmitter } from 'node:events';

export type Position = { x: number; y: number; z: number };
export type Logger = Partial<Record<'debug' | 'error' | 'info' | 'log' | 'warn', (message: string) => void>>;
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ActivitySnapshot {
  id: string;
  label: string;
  detail: string;
  resources: string[];
  startedAt: number;
}

export class ActivityManager {
  constructor(onChange?: (snapshot: ActivitySnapshot[], revision: number) => void, onError?: (error: unknown) => void);
  register(id: string, options: { label?: string; detail?: string; resources?: string[]; stop(): void }): string;
  finish(id: string): boolean;
  has(id: string): boolean;
  stop(id: string): boolean;
  stopAll(): void;
  snapshot(): ActivitySnapshot[];
  update(id: string, detail: string): boolean;
  subscribe(subscriber: (snapshot: ActivitySnapshot[], revision: number) => void, emitInitial?: boolean): () => boolean;
}

export interface ActionDefinition<T = Record<string, unknown>, R = unknown> {
  id: string;
  title?: string;
  capability?: string | null;
  risk?: string;
  inputSchema?: Record<string, unknown>;
  execute(context: { request: T; action: ActionDefinition<T, R>; [key: string]: unknown }): R | Promise<R>;
}

export class ActionDispatcher {
  constructor(options?: { audit?(event: Record<string, unknown>): void });
  register(action: ActionDefinition): () => boolean;
  registerPolicy(id: string, evaluate: (context: Record<string, unknown>) => Record<string, unknown> | null): () => void;
  get(id: string): ActionDefinition | null;
  list(): Array<Omit<ActionDefinition, 'execute'>>;
  count(): number;
  clear(): number;
  evaluate(action: ActionDefinition, context: Record<string, unknown>): Record<string, unknown>;
  execute<R = unknown>(id: string, input: Record<string, unknown>, context?: Record<string, unknown>): Promise<R>;
}

export interface TaskSnapshot {
  id: string;
  label: string;
  status: TaskStatus;
  detail: string;
  resources: string[];
  startedAt: number | null;
  finishedAt: number | null;
  result: unknown;
  error: string | null;
  [key: string]: unknown;
}

export class TaskHandle<T = unknown> extends EventEmitter {
  readonly id: string;
  readonly result: Promise<T>;
  readonly controller: AbortController;
  snapshot(): TaskSnapshot;
  update(value: string | Record<string, unknown>): void;
  abort(reason?: string | Error): boolean;
}

export class TaskManager {
  run<T>(definition: { id: string; label?: string; detail?: string; resources?: string[] }, executor: (context: { bot: Bot; runtime: MinepromptRuntime; signal: AbortSignal; update(value: string | Record<string, unknown>): void; throwIfAborted(): void }) => T | Promise<T>): TaskHandle<T>;
  get(id: string): TaskHandle | null;
  stop(id: string, reason?: string): boolean;
  stopAll(reason?: string): void;
  snapshot(): { active: TaskSnapshot[]; recent: TaskSnapshot[] };
}

export interface RuntimeSnapshot {
  apiVersion: number;
  revision: number;
  closed: boolean;
  capabilities: Array<{ id: string; version: number; description: string }>;
  actions: Array<Record<string, unknown>>;
  activities: ActivitySnapshot[];
  tasks: { active: TaskSnapshot[]; recent: TaskSnapshot[] };
}

export interface MinepromptRuntime {
  readonly apiVersion: number;
  readonly bot: Bot;
  readonly activities: ActivityManager;
  readonly actions: ActionDispatcher;
  readonly events: EventEmitter;
  readonly tasks: TaskManager;
  readonly logger: Required<Logger>;
  readonly closed: boolean;
  readonly revision: number;
  navigation?: NavigationApi;
  mining?: MiningApi;
  trees?: TreeApi;
  inventory?: InventoryApi;
  storage?: StorageApi;
  builder?: BuilderApi;
  interactions?: InteractionsApi;
  has(id: string): boolean;
  get<T = unknown>(id: string): T | null;
  require<T = unknown>(id: string, minimumVersion?: number): T;
  register(id: string, api: object, metadata?: { version?: number; description?: string }): () => boolean;
  addDisposer(disposer: () => void): () => void;
  emit(type: string, ...args: unknown[]): void;
  subscribe(listener: (event: { type: string; payload: unknown; revision: number; snapshot: RuntimeSnapshot }) => void, emitInitial?: boolean): () => void;
  summary(): { apiVersion: number; revision: number; closed: boolean; capabilities: RuntimeSnapshot['capabilities']; actionCount: number; tasks: { active: TaskSnapshot[] } };
  snapshot(): RuntimeSnapshot;
  close(): boolean;
}

export class CapabilityError extends Error {
  readonly code: string;
  readonly capability: string | null;
}

export interface RuntimeOptions {
  activities?: ActivityManager;
  actions?: ActionDispatcher;
  logger?: Logger;
}

export interface NavigationApi {
  cancel(): boolean;
  goto(goal: unknown, options?: Record<string, unknown>): Promise<unknown>;
  computePath(goal: unknown, timeout: number, searchRadius: number): unknown;
  selectPathAwareStep(targets: Position[], stands: Position[], reach: number, options?: Record<string, unknown>): Promise<unknown>;
  readonly pathfinder: unknown;
}

export interface MiningApi {
  readonly service: MiningService;
  mine(block: unknown, policy?: MiningPolicy): Promise<unknown>;
  mineAt(position: Position, policy?: MiningPolicy): Promise<unknown>;
  consistent(block: unknown, depth?: number, policy?: MiningPolicy): unknown;
  consistentAt(position: Position, depth?: number, policy?: MiningPolicy): unknown;
  region(from: Position, to: Position, policy?: MiningPolicy): unknown;
  stop(): boolean;
  status(): unknown;
  normalizePolicy(policy?: MiningPolicy): Readonly<MiningPolicy>;
}

export interface MiningPolicy {
  tool?: 'auto' | 'held' | 'hand';
  lowDurability?: 'switch' | 'stop' | 'skip';
  minimumDurability?: number;
  allowFluidAdjacent?: boolean;
  allowFalling?: boolean;
  include?: string[];
  exclude?: string[];
  reach?: number;
  maxBlocks?: number;
}

export interface TreePolicy extends MiningPolicy {
  leafSupport?: 'never' | 'safe' | 'always';
  logSupport?: 'never' | 'stump';
  collectDrops?: boolean;
  collectionRadius?: number;
  replant?: 'never' | 'available' | 'required';
  onFailure?: 'stop' | 'skip';
  radius?: number;
  maxTrees?: number;
  requireNatural?: boolean;
}

export interface TreeRequest {
  target?: 'cursor' | 'nearest' | 'position';
  position?: Position;
  policy?: TreePolicy;
}

export interface TreeApi {
  readonly service: TreeService;
  inspect(request?: TreeRequest): unknown;
  fell(request?: TreeRequest): unknown;
  farm(request?: { policy?: TreePolicy }): unknown;
  stop(): boolean;
  status(): unknown;
  normalizePolicy(policy?: TreePolicy): Readonly<TreePolicy>;
}

export interface InventoryApi {
  readonly service: InventoryService;
  readonly crafting: CraftingService;
  readonly stash: StashService;
  execute(request: Record<string, unknown>): Promise<unknown>;
  inspect(request: Record<string, unknown>): unknown;
  recipes(request?: Record<string, unknown>): unknown;
  craft(request: Record<string, unknown>): Promise<unknown>;
  startStash(request: Record<string, unknown>): unknown;
  stopStash(): boolean;
  stashStatus(): unknown;
  snapshot(): Record<string, unknown>;
}

export interface StorageZone {
  id: string;
  name: string;
  server: { host: string; port: number };
  dimension: string;
  from: Position;
  to: Position;
  mode: 'bounds' | 'positions';
  positions: Position[];
  categories: StorageCategory[];
  createdAt: number;
  updatedAt: number;
}

export interface StorageCategory {
  id: string;
  name: string;
  items: string[];
  containers: Position[];
  overflow: boolean;
}

export interface StorageApi {
  readonly service: StorageService;
  readonly store: unknown;
  zones(request?: { all?: boolean }): StorageZone[];
  saveZone(request: Partial<StorageZone> & Pick<StorageZone, 'name' | 'from' | 'to'>): Promise<StorageZone>;
  removeZone(reference: string): Promise<boolean>;
  scan(reference: string): unknown;
  inspect(reference: string): unknown;
    find(selector: string, request?: { zone?: string; minimum?: number }): unknown[];
    categories(reference: string): StorageCategory[];
    saveCategory(reference: string, request: Partial<StorageCategory> & Pick<StorageCategory, 'name'>): Promise<StorageCategory>;
    removeCategory(reference: string, category: string): Promise<boolean>;
    planFetch(request: { item: string; count: number; zone: string }): Promise<unknown>;
    fetch(request: { item: string; count: number; zone: string }): Promise<unknown>;
    planDeposit(request: { item?: string; slot?: number; count?: number; zone: string; category?: string }): Promise<unknown>;
    deposit(request: { item?: string; slot?: number; count?: number; zone: string; category?: string }): Promise<unknown>;
    audit(reference: string): unknown;
  status(): unknown;
  stop(): boolean;
  snapshot(): Record<string, unknown>;
}

export interface BlueprintSummary {
  id: string;
  hash: string;
  name: string;
  sourceFile: string;
  sourceFormat: string;
  edition: string;
  version: string;
  detectedVersion: string | null;
  dimensions: Position;
  volume: number;
  offset: Position;
  paletteSize: number;
  blockEntityCount: number;
  materialTypes: number;
  materialCount: number;
  unsupportedCount: number;
  supportSensitiveCount: number;
  importedAt: number;
}

export interface BuildJob {
  id: string;
  owner: string;
  blueprintHash: string;
  blueprintId: string;
  blueprintName: string;
  server: { host: string; port: number };
  dimension: string;
  anchor: Position;
  rotation: 0 | 90 | 180 | 270;
  mirror: 'none' | 'x' | 'z';
  status: 'planned' | 'running' | 'paused' | 'complete' | 'failed' | 'stopped';
  phase: string;
  operationCount: number;
  completedCount: number;
  skippedCount: number;
  failedCount: number;
  latestError: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface BuildStatus {
  active: BuildJob | null;
  jobs: BuildJob[];
}

export interface BuilderApi {
  readonly service: unknown;
  readonly library: unknown;
  list(): BlueprintSummary[];
  inspect(reference: string): unknown;
  materials(reference: string): unknown;
  preview(reference: string, request: Record<string, unknown>): Promise<unknown>;
  plan(reference: string, request: Record<string, unknown>): Promise<unknown>;
  start(reference: string, request: Record<string, unknown>): Promise<BuildJob>;
  resume(id: string): Promise<BuildJob>;
  pause(): boolean;
  stop(): boolean;
  status(): BuildStatus;
  snapshot(): { blueprints: BlueprintSummary[]; build: BuildStatus };
}

export interface InteractionsApi {
  readonly relationships: RelationshipService;
  readonly players: PlayerActionRegistry;
  readonly targets: TargetingService;
  describePlayer(username: string): unknown;
  executePlayer(request: Record<string, unknown>, origin?: Record<string, unknown>): Promise<unknown>;
  snapshotTargets(): unknown;
  executeTarget(request: Record<string, unknown>, origin?: Record<string, unknown>): Promise<unknown>;
}

export class MiningService { constructor(options: Record<string, unknown>); }
export class TreeService { constructor(options: Record<string, unknown>); }
export class InventoryService { constructor(options: Record<string, unknown>); }
export class CraftingService { constructor(options: Record<string, unknown>); }
export class StashService { constructor(options: Record<string, unknown>); }
export class StorageService { constructor(options: Record<string, unknown>); }
export class MemoryStorageStore { constructor(zones?: StorageZone[]); }
export class MemoryBlueprintLibrary { constructor(blueprints?: unknown[]); }
export class MemoryBuildJobStore { constructor(jobs?: unknown[]); }
export class PlayerActionRegistry { constructor(options?: Record<string, unknown>); }
export class RelationshipService { constructor(store: unknown); }
export class TargetingService { constructor(options: Record<string, unknown>); }
export class MemorySettingsStore { constructor(relationships?: unknown[]); }

export const API_VERSION: 1;
export function snapshotValue(value: unknown): unknown;
export function installRuntime(bot: Bot, options?: RuntimeOptions): MinepromptRuntime;
export function getRuntime(bot: Bot): MinepromptRuntime | null;
export function runtimePlugin(options?: RuntimeOptions): (bot: Bot) => MinepromptRuntime;
export function installNavigation(bot: Bot, options?: Record<string, unknown>): NavigationApi;
export function navigationPlugin(options?: Record<string, unknown>): (bot: Bot) => NavigationApi;
export function installMining(bot: Bot, options?: Record<string, unknown>): MiningApi;
export function miningPlugin(options?: Record<string, unknown>): (bot: Bot) => MiningApi;
export function installTrees(bot: Bot, options?: Record<string, unknown>): TreeApi;
export function treePlugin(options?: Record<string, unknown>): (bot: Bot) => TreeApi;
export function installInventory(bot: Bot, options?: Record<string, unknown>): InventoryApi;
export function inventoryPlugin(options?: Record<string, unknown>): (bot: Bot) => InventoryApi;
export function installStorage(bot: Bot, options?: Record<string, unknown>): StorageApi;
export function storagePlugin(options?: Record<string, unknown>): (bot: Bot) => StorageApi;
export function installBuilder(bot: Bot, options?: Record<string, unknown>): BuilderApi;
export function builderPlugin(options?: Record<string, unknown>): (bot: Bot) => BuilderApi;
export function installInteractions(bot: Bot, options?: Record<string, unknown>): InteractionsApi;
export function interactionsPlugin(options?: Record<string, unknown>): (bot: Bot) => InteractionsApi;
export function installToolkit(bot: Bot, options?: Record<string, unknown>): { runtime: MinepromptRuntime; navigation: NavigationApi | null; mining: MiningApi | null; trees: TreeApi | null; inventory: InventoryApi | null; storage: StorageApi | null; builder: BuilderApi | null; interactions: InteractionsApi | null };
export function toolkitPlugin(options?: Record<string, unknown>): (bot: Bot) => ReturnType<typeof installToolkit>;

declare module 'mineflayer' {
  interface Bot {
    mineprompt?: MinepromptRuntime;
  }
}
