export type HeartStyle = 'normal' | 'absorbing' | 'frozen' | 'poisoned' | 'withered' | 'vehicle';
export type FillState = 'empty' | 'half' | 'full';

export interface HudState {
  health: number;
  maxHealth: number;
  absorption: number;
  food: number;
  saturation: number;
  oxygen: number;
  armor: number;
  armorToughness: number;
  experience: { level: number; progress: number; points: number };
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

export interface ScoreboardState {
  name: string;
  title: string;
  items: Array<{ name: string; displayName: string; value: number }>;
}

export interface VehicleState {
  id: number;
  name: string;
  displayName: string;
  health: number | null;
  maxHealth: number | null;
}

export interface PresentationSnapshot {
  hud: HudState;
  bossBars: BossBarState[];
  scoreboard: ScoreboardState | null;
  overlay: { title: string; subtitle: string; actionBar: string };
  vehicle: VehicleState | null;
}

export interface MineflayerUiOptions {
  onChange?(snapshot: PresentationSnapshot): void;
  onError?(error: unknown): void;
  schedule?: typeof setTimeout;
  cancelSchedule?: typeof clearTimeout;
}

export class MineflayerUiState {
  constructor(bot: unknown, options?: MineflayerUiOptions);
  snapshot(): PresentationSnapshot;
  subscribe(subscriber: (snapshot: PresentationSnapshot) => void, emitInitial?: boolean): () => boolean;
  close(): void;
}

export function createMineflayerUiState(bot: unknown, options?: MineflayerUiOptions): MineflayerUiState;
export function mineflayerUiPlugin(bot: unknown): void;
export function emptyPresentation(): PresentationSnapshot;
export function heartSprite(style: HeartStyle, fill: FillState, hardcore?: boolean, blinking?: boolean): string;
export function foodSprite(fill: FillState, hungry?: boolean): string;
export function formatDuration(ticks: number): string;
export function hud(bot: unknown): HudState;
export function bossBars(bot: unknown): BossBarState[];
export function scoreboard(bot: unknown): ScoreboardState | null;
export function vehicle(bot: unknown): VehicleState | null;
export function textValue(value: unknown): string;
export function bounded(value: unknown, minimum: number, maximum: number, fallback?: number): number;
export function attributeValue(attributes: unknown, suffix: string, fallback?: number): number;

declare module 'mineflayer' {
  interface Bot {
    mineflayerUi: MineflayerUiState;
  }
}
