'use strict';

const HEART_STYLES = new Set(['normal', 'absorbing', 'frozen', 'poisoned', 'withered', 'vehicle']);
const BOSS_COLORS = new Set(['pink', 'blue', 'red', 'green', 'yellow', 'purple', 'white']);

function bounded(value, minimum, maximum, fallback = minimum) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
}

function textValue(value, depth = 0, seen = new Set()) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    const source = value.trim();
    if (depth < 32 && ((source.startsWith('{') && source.endsWith('}')) || (source.startsWith('[') && source.endsWith(']')))) {
      try { return textValue(JSON.parse(source), depth + 1, seen); } catch {}
    }
    return value;
  }
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value !== 'object' || depth >= 32 || seen.has(value)) return '';
  seen.add(value);
  try {
    if (typeof value.getText === 'function') {
      const rendered = value.getText();
      if (typeof rendered === 'string' && rendered !== '[object Object]') return rendered;
    }
    if (typeof value.toString === 'function' && value.toString !== Object.prototype.toString) {
      const rendered = value.toString();
      if (typeof rendered === 'string' && rendered !== '[object Object]') return rendered;
    }
    if (Array.isArray(value)) return value.map((entry) => textValue(entry, depth + 1, seen)).join('');
    let rendered = '';
    if (typeof value.text === 'string' || typeof value.text === 'number') rendered = String(value.text);
    else if (value.translate !== undefined) rendered = textValue(value.fallback ?? value.translate, depth + 1, seen);
    else if (value.selector !== undefined) rendered = textValue(value.selector, depth + 1, seen);
    else if (value.keybind !== undefined) rendered = textValue(value.keybind, depth + 1, seen);
    else if (value.score?.value !== undefined) rendered = textValue(value.score.value, depth + 1, seen);
    return rendered + (Array.isArray(value.extra) ? value.extra.map((entry) => textValue(entry, depth + 1, seen)).join('') : '');
  } catch {
    return '';
  } finally {
    seen.delete(value);
  }
}

function attributeValue(values, suffix, fallback = 0) {
  const entries = values instanceof Map
    ? [...values.entries()]
    : values && typeof values === 'object'
      ? Object.entries(values)
      : [];
  const match = entries.find(([name]) => String(name).replace(/^minecraft:/u, '').replace(/^generic\./u, '') === suffix);
  if (!match) return fallback;
  const attribute = match[1];
  const value = attribute && typeof attribute === 'object' ? attribute.value : attribute;
  const modifiers = attribute && typeof attribute === 'object' && Array.isArray(attribute.modifiers) ? attribute.modifiers : [];
  const base = Number(value) || 0;
  let result = base;
  for (const modifier of modifiers.filter((entry) => Number(entry.operation) === 0)) result += Number(modifier.amount) || 0;
  for (const modifier of modifiers.filter((entry) => Number(entry.operation) === 1)) result += base * (Number(modifier.amount) || 0);
  for (const modifier of modifiers.filter((entry) => Number(entry.operation) === 2)) result *= 1 + (Number(modifier.amount) || 0);
  return bounded(result, 0, 2048, fallback);
}

function heartSprite(style, fill, hardcore = false, blinking = false) {
  const normalizedStyle = HEART_STYLES.has(style) ? style : 'normal';
  if (fill === 'empty') return normalizedStyle === 'vehicle' ? 'vehicle_container' : hardcore ? 'container_hardcore' : 'container';
  const prefix = normalizedStyle === 'normal' ? '' : `${normalizedStyle}_`;
  const middle = hardcore && normalizedStyle !== 'vehicle' ? `hardcore_${fill}` : fill;
  return `${prefix}${middle}${blinking ? '_blinking' : ''}`;
}

function foodSprite(fill, hungry = false) {
  return `${fill}${hungry ? '_hunger' : ''}`;
}

function formatDuration(ticks) {
  const value = Number(ticks);
  if (!Number.isFinite(value)) return 'Infinite';
  const seconds = Math.max(0, Math.ceil(value / 20));
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function emptyPresentation() {
  return {
    hud: {
      health: 0,
      maxHealth: 20,
      absorption: 0,
      food: 0,
      saturation: 0,
      oxygen: 20,
      armor: 0,
      armorToughness: 0,
      experience: { level: 0, progress: 0, points: 0 },
      selectedHotbar: 0,
      usingItem: false,
      hardcore: false,
      gameMode: '',
      dimension: ''
    },
    bossBars: [],
    scoreboard: null,
    overlay: { title: '', subtitle: '', actionBar: '' },
    vehicle: null
  };
}

function bossBars(bot) {
  return Object.values(bot?.bossBars || {}).map((bar) => ({
    id: String(bar.entityUUID || ''),
    title: textValue(bar.title),
    progress: bounded(bar.health, 0, 1),
    dividers: [0, 6, 10, 12, 20].includes(Number(bar.dividers)) ? Number(bar.dividers) : 0,
    color: BOSS_COLORS.has(bar.color) ? bar.color : 'purple',
    darkenSky: bar.shouldDarkenSky === true,
    dragon: bar.isDragonBar === true,
    fog: bar.shouldCreateFog === true
  }));
}

function scoreboard(bot) {
  const board = bot?.scoreboard?.sidebar;
  if (!board) return null;
  const normalized = {
    name: String(board.name || ''),
    title: textValue(board.title),
    items: (Array.isArray(board.items) ? board.items : []).slice(0, 80).map((item) => ({
      name: String(item.name || ''),
      displayName: textValue(item.displayName || item.name),
      value: Number(item.value) || 0
    }))
  };
  return normalized.title.trim() || normalized.items.length ? normalized : null;
}

function vehicle(bot) {
  const entity = bot?.vehicle;
  if (!entity) return null;
  const health = Number(entity.health);
  const maxHealth = Number(entity.maxHealth);
  return {
    id: Number(entity.id) || 0,
    name: String(entity.name || entity.mobType || entity.objectType || 'vehicle'),
    displayName: textValue(entity.displayName || entity.name || entity.mobType || 'Mount'),
    health: Number.isFinite(health) ? Math.max(0, health) : null,
    maxHealth: Number.isFinite(maxHealth) && maxHealth > 0 ? maxHealth : null
  };
}

function hud(bot) {
  return {
    health: bounded(bot?.health, 0, 2048),
    maxHealth: attributeValue(bot?.entity?.attributes || {}, 'max_health', 20) || 20,
    absorption: bounded(bot?.absorptionAmount, 0, 2048),
    food: bounded(bot?.food, 0, 20),
    saturation: bounded(bot?.foodSaturation, 0, 20),
    oxygen: bounded(bot?.oxygenLevel, 0, 20, 20),
    armor: attributeValue(bot?.entity?.attributes || {}, 'armor', 0),
    armorToughness: attributeValue(bot?.entity?.attributes || {}, 'armor_toughness', 0),
    experience: {
      level: Math.max(0, Math.floor(Number(bot?.experience?.level) || 0)),
      progress: bounded(bot?.experience?.progress, 0, 1),
      points: Math.max(0, Math.floor(Number(bot?.experience?.points) || 0))
    },
    selectedHotbar: Math.max(0, Math.min(8, Math.floor(Number(bot?.quickBarSlot) || 0))),
    usingItem: bot?.usingHeldItem === true,
    hardcore: bot?.game?.hardcore === true,
    gameMode: String(bot?.game?.gameMode || ''),
    dimension: String(bot?.game?.dimension || '')
  };
}

class MineflayerUiState {
  constructor(bot, options = {}) {
    this.bot = bot;
    this.subscribers = new Set();
    if (typeof options.onChange === 'function') this.subscribers.add(options.onChange);
    this.onError = typeof options.onError === 'function' ? options.onError : () => {};
    this.schedule = options.schedule || setTimeout;
    this.cancelSchedule = options.cancelSchedule || clearTimeout;
    this.overlay = { title: '', subtitle: '', actionBar: '' };
    this.titleTimes = { fadeIn: 10, stay: 70, fadeOut: 20 };
    this.listeners = [];
    this.timers = new Set();
    this.lastTick = 0;
    this.dynamicSignature = '';
    this.titleTimer = null;
    this.actionBarTimer = null;
    this.bind();
  }

  listen(event, listener) {
    this.bot.on(event, listener);
    this.listeners.push([event, listener]);
  }

  later(callback, milliseconds) {
    const timer = this.schedule(() => {
      this.timers.delete(timer);
      callback();
    }, milliseconds);
    this.timers.add(timer);
    return timer;
  }

  replaceTimer(name, callback, milliseconds) {
    const previous = this[name];
    if (previous) {
      this.cancelSchedule(previous);
      this.timers.delete(previous);
    }
    const timer = this.later(() => {
      this[name] = null;
      callback();
    }, milliseconds);
    this[name] = timer;
  }

  changed() {
    let snapshot;
    try {
      snapshot = this.snapshot();
    } catch (error) {
      this.onError(error);
      return;
    }
    for (const subscriber of this.subscribers) {
      try { subscriber(snapshot); } catch (error) { this.onError(error); }
    }
  }

  subscribe(subscriber, emitInitial = true) {
    if (typeof subscriber !== 'function') throw new TypeError('A presentation subscriber is required.');
    this.subscribers.add(subscriber);
    if (emitInitial) subscriber(this.snapshot());
    return () => this.subscribers.delete(subscriber);
  }

  bind() {
    for (const event of ['health', 'experience', 'heldItemChanged', 'mount', 'dismount', 'bossBarCreated', 'bossBarDeleted', 'bossBarUpdated', 'scoreboardCreated', 'scoreboardDeleted', 'scoreboardTitleChanged', 'scoreUpdated', 'scoreRemoved', 'scoreboardPosition']) {
      this.listen(event, () => this.changed());
    }
    this.listen('physicsTick', () => {
      const now = Date.now();
      if (now - this.lastTick < 250) return;
      this.lastTick = now;
      const current = JSON.stringify([this.bot?.oxygenLevel, this.bot?.usingHeldItem, this.bot?.vehicle?.id, this.bot?.vehicle?.health]);
      if (current === this.dynamicSignature) return;
      this.dynamicSignature = current;
      this.changed();
    });
    this.listen('title_times', (fadeIn, stay, fadeOut) => {
      const timing = (value, fallback) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : fallback;
      this.titleTimes = { fadeIn: timing(fadeIn, 10), stay: timing(stay, 70), fadeOut: timing(fadeOut, 20) };
    });
    this.listen('title', (value, type) => {
      this.overlay[type === 'subtitle' ? 'subtitle' : 'title'] = textValue(value);
      const lifetime = (this.titleTimes.fadeIn + this.titleTimes.stay + this.titleTimes.fadeOut) * 50;
      this.changed();
      this.replaceTimer('titleTimer', () => {
        this.overlay = { ...this.overlay, title: '', subtitle: '' };
        this.changed();
      }, lifetime);
    });
    this.listen('title_clear', () => {
      this.overlay = { ...this.overlay, title: '', subtitle: '' };
      if (this.titleTimer) {
        this.cancelSchedule(this.titleTimer);
        this.timers.delete(this.titleTimer);
        this.titleTimer = null;
      }
      this.changed();
    });
    this.listen('actionBar', (value) => {
      this.overlay = { ...this.overlay, actionBar: textValue(value) };
      this.changed();
      this.replaceTimer('actionBarTimer', () => {
        this.overlay = { ...this.overlay, actionBar: '' };
        this.changed();
      }, 3000);
    });
  }

  snapshot() {
    return {
      hud: hud(this.bot),
      bossBars: bossBars(this.bot),
      scoreboard: scoreboard(this.bot),
      overlay: { ...this.overlay },
      vehicle: vehicle(this.bot)
    };
  }

  close() {
    for (const [event, listener] of this.listeners) this.bot.removeListener(event, listener);
    this.listeners = [];
    for (const timer of this.timers) this.cancelSchedule(timer);
    this.timers.clear();
    this.subscribers.clear();
  }
}

function createMineflayerUiState(bot, options) {
  if (!bot?.on || !bot?.removeListener) throw new TypeError('A Mineflayer-compatible bot is required.');
  return new MineflayerUiState(bot, options);
}

function mineflayerUiPlugin(bot) {
  bot.mineflayerUi?.close?.();
  bot.mineflayerUi = createMineflayerUiState(bot);
}

export { MineflayerUiState, attributeValue, bossBars, bounded, createMineflayerUiState, emptyPresentation, foodSprite, formatDuration, heartSprite, hud, mineflayerUiPlugin, scoreboard, textValue, vehicle };
