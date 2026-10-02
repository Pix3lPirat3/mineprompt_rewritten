'use strict';

const { createBot } = require('mineflayer');
const { attributeValue, createMineflayerUiState, emptyPresentation } = require('../../packages/mineflayer-ui');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const { InventoryEventStream } = require('./inventory-events');
const { containerColumns, defaultWindowTitle, describeWindow, serializeItem, serializeSlots, windowPropertyName } = require('./inventory-model');
const { cancelNavigation } = require('./navigation-service');

function readableReason(reason) {
  if (typeof reason === 'string') return reason;
  if (reason?.toString) return reason.toString();
  try { return JSON.stringify(reason); } catch { return 'Unknown reason'; }
}

function effectAssetName(value) {
  const normalized = String(value || '')
    .replace(/^minecraft:/u, '')
    .replace(/([a-z0-9])([A-Z])/gu, '$1_$2')
    .replace(/[^A-Za-z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
    .toLowerCase();
  return normalized === 'bad_luck' ? 'unluck' : normalized;
}

function effectVisibility(flags, version) {
  if (!Number.isFinite(flags)) return { ambient: false, showParticles: true, showIcon: true };
  const [major = 1, minor = 0] = String(version || '').split('.').map(Number);
  const supportsIcon = major > 1 || major === 1 && minor >= 13;
  return {
    ambient: Boolean(flags & 1),
    showParticles: Boolean(flags & 2),
    showIcon: !supportsIcon || Boolean(flags & 4)
  };
}

class MineflayerClient {
  constructor({
    logger,
    interfaceState,
    store,
    getCommands,
    activities,
    onSnapshot = () => {},
    onInventoryEvent = () => {},
    createBotImpl = createBot,
    pathfinderPlugin = pathfinder,
    MovementsClass = Movements,
    chatFactory = (registry) => require('prismarine-chat')(registry),
    schedule = setTimeout,
    cancelSchedule = clearTimeout,
    playerActions = null,
    sessionId = null,
    edition = 'java',
    installPlugins = () => {}
  }) {
    this.logger = logger;
    this.interface = interfaceState;
    this.store = store;
    this.getCommands = getCommands;
    this.activities = activities;
    this.onSnapshot = onSnapshot;
    this.onInventoryEvent = onInventoryEvent;
    this.createBot = createBotImpl;
    this.pathfinderPlugin = pathfinderPlugin;
    this.Movements = MovementsClass;
    this.chatFactory = chatFactory;
    this.schedule = schedule;
    this.cancelSchedule = cancelSchedule;
    this.playerActions = playerActions;
    this.sessionId = sessionId;
    this.edition = edition;
    this.installPlugins = installPlugins;
    this.bot = null;
    this.chatMessageClass = null;
    this.connectionAttempt = 0;
    this.lastMoveUpdate = 0;
    this.lastPlayerUpdate = 0;
    this.lastTargetUpdate = 0;
    this.lastConnectionOptions = null;
    this.reconnectAttempt = 0;
    this.manualDisconnect = false;
    this.inventoryEvents = new InventoryEventStream((event) => this.onInventoryEvent(event), () => this.chatMessageClass, () => this.bot?.registry || null);
    this.currentWindowTitle = null;
    this.currentWindowProperties = {};
    this.presentation = null;
    this.effectFlags = new Map();
    this.inventoryCache = null;
  }

  async startClient(options, { reconnect = false } = {}) {
    if (!options || typeof options !== 'object') throw new TypeError('Connection options are required.');
    this.activities.stop('reconnect');
    if (this.bot) await this.disconnect('Starting a new connection');
    if (!reconnect) this.reconnectAttempt = 0;
    this.manualDisconnect = false;
    this.lastConnectionOptions = { ...options };
    this.getCommands().setCommands('mineflayer');

    const attempt = ++this.connectionAttempt;
    this.interface.setStatus('connecting');
    const { accountUsername, ...connectionOptions } = options;
    let bot;
    try {
      bot = this.createBot(this.edition === 'bedrock'
        ? { ...connectionOptions, edition: 'bedrock', offline: connectionOptions.auth === 'offline' }
        : connectionOptions);
    } catch (error) {
      this.interface.setFailure(error.message);
      throw error;
    }
    this.bot = bot;
    this.invalidateInventorySnapshot();
    this.effectFlags.clear();
    try {
      this.presentation = createMineflayerUiState(bot, {
        onChange: () => {
          if (this.isCurrent(bot, attempt)) this.onSnapshot();
        },
        onError: (error) => {
          this.logger.warn(`[Presentation] ${error instanceof Error ? error.message : String(error)}`);
          if (error instanceof Error && error.stack) this.logger.debug(error.stack);
        },
        schedule: this.schedule,
        cancelSchedule: this.cancelSchedule
      });
      bot.lastOptions = { ...options };
      bot.loadPlugin(this.pathfinderPlugin);
      await this.installPlugins(bot);
    } catch (error) {
      this.presentation?.close();
      this.presentation = null;
      this.bot = null;
      bot.mineprompt?.close?.();
      try { bot.quit('Plugin initialization failed'); } catch { bot.end('Plugin initialization failed'); }
      this.interface.setFailure(error instanceof Error ? error.message : String(error));
      throw error;
    }
    this.bindEvents(bot, { ...connectionOptions, accountUsername }, attempt);
    return bot;
  }

  setPluginInstaller(installer) {
    if (typeof installer !== 'function') throw new TypeError('A Mineflayer plugin installer must be a function.');
    this.installPlugins = installer;
  }

  bindEvents(bot, options, attempt) {
    bot.once('login', async () => {
      if (!this.isCurrent(bot, attempt)) return;
      this.chatMessageClass = this.chatFactory(bot.registry);
      this.interface.setStatus('joining');
      this.logger.info(`[Connection] Logged in as ${bot.username}.`);
      if (options.accountUsername && options.accountUsername !== bot.username) {
        await this.store.renameAccount(options.accountUsername, bot.username).catch((error) => this.logger.warn(error.message));
      }
    });

    bot.once('spawn', () => {
      if (!this.isCurrent(bot, attempt)) return;
      this.interface.startSession(bot.username);
      this.reconnectAttempt = 0;
      const movements = new this.Movements(bot);
      movements.allow1by1towers = false;
      movements.canDig = false;
      movements.allowFreeMotion = true;
      movements.scafoldingBlocks = [];
      bot.pathfinder.setMovements(movements);
      this.updatePosition(bot, true);
      this.updateVitals(bot);
      this.updateEffects(bot);
      this.inventoryEvents.watch(bot.inventory, 'inventory');
      this.logger.info(`[Connection] Spawned on ${options.host}:${options.port}.`);
      this.onSnapshot();
    });

    bot.on('move', () => {
      this.updatePosition(bot);
      this.updatePlayers();
    });
    bot.on('physicsTick', () => this.updateTargets());
    bot.on('entityMoved', () => this.updateTargets());
    bot.on('entitySpawn', () => this.updateTargets(true));
    bot.on('entityGone', () => this.updateTargets(true));
    bot.on('health', () => this.updateVitals(bot));
    bot.on('experience', () => this.updateVitals(bot));
    bot.on('heldItemChanged', () => this.inventoryEvents.select(bot.quickBarSlot));
    bot.on('entityAttributes', (entity) => {
      if (entity === bot.entity) this.updateVitals(bot);
    });
    bot.on('entityEffect', (entity) => {
      if (entity === bot.entity) this.updateEffects(bot);
    });
    bot.on('entityEffectEnd', (entity) => {
      if (entity === bot.entity) this.updateEffects(bot);
    });

    bot.on('windowOpen', (window) => {
      let title = 'container';
      try { title = typeof window?.title === 'string' ? window.title : new this.chatMessageClass(window?.title).toString(); } catch {}
      this.currentWindowTitle = title.trim() || defaultWindowTitle(window);
      this.currentWindowProperties = {};
      this.logger.info(`[Inventory] Opened ${this.currentWindowTitle}.`);
      this.inventoryEvents.open(window, this.currentWindowTitle);
    });
    bot.on('windowClose', (window) => {
      const title = this.currentWindowTitle;
      this.currentWindowTitle = null;
      this.inventoryEvents.close(window, title);
      this.currentWindowProperties = {};
    });
    bot._client?.on('craft_progress_bar', (packet) => {
      const window = bot.currentWindow;
      if (!window || packet.windowId !== window.id) return;
      this.currentWindowProperties[windowPropertyName(window, packet.property)] = Number(packet.value);
      this.inventoryEvents.property(window, packet.property, packet.value);
    });
    bot._client?.on('entity_effect', (packet) => {
      if (packet.entityId !== bot.entity?.id) return;
      const flags = Number(packet.flags ?? packet.hideParticles);
      this.effectFlags.set(Number(packet.effectId), effectVisibility(flags, bot.version));
      this.updateEffects(bot);
    });
    bot._client?.on('remove_entity_effect', (packet) => {
      if (packet.entityId === bot.entity?.id) this.effectFlags.delete(Number(packet.effectId));
    });
    bot.on('playerJoined', () => this.onSnapshot());
    bot.on('playerLeft', () => this.onSnapshot());
    bot.on('death', () => this.logger.warn(`[Connection] ${bot.username} died.`));
    bot.on('playerCollect', (collector, item) => {
      if (collector.id !== bot.entity?.id) return;
      const dropped = item.getDroppedItem?.();
      if (dropped) this.logger.info(`[Inventory] Collected ${dropped.count} x ${dropped.displayName}.`);
      this.onSnapshot();
    });

    bot.on('message', (message, position) => {
      if (position === 'game_info') return;
      const text = message.getText?.() || message.toString();
      if (text) this.logger.log(text);
    });

    bot.on('chat', (username, message) => this.handleRemoteCommand(bot, username, message));
    bot.on('resourcePack', async () => {
      const policy = await this.store.getSetting('resourcePackPolicy');
      if (policy === 'accept') {
        this.logger.warn('[Security] Accepting a server resource pack according to your saved policy.');
        bot.acceptResourcePack();
      } else {
        this.logger.warn('[Security] Declined a server resource pack. Change resourcePackPolicy to "accept" to allow it.');
        bot.denyResourcePack();
      }
    });

    bot.on('kicked', (reason) => this.logger.warn(`[Connection] Kicked: ${readableReason(reason)}`));
    bot.on('error', (error) => {
      const messages = {
        EAI_AGAIN: 'The server address could not be resolved because of a temporary network problem.',
        ENOTFOUND: 'The server address could not be found.',
        ECONNREFUSED: 'The server refused the connection.',
        ECONNRESET: 'The server closed the connection.',
        ETIMEDOUT: 'The connection timed out.'
      };
      const message = messages[error.code] || error.message || 'An unexpected error occurred.';
      this.logger.error(`[Connection] ${message}`);
      this.interface.setFailure(message);
      this.logger.debug(error.stack);
    });

    bot.once('end', (reason) => {
      if (!this.isCurrent(bot, attempt)) return;
      const reconnect = !this.manualDisconnect;
      this.bot = null;
      this.presentation?.close();
      this.presentation = null;
      this.effectFlags.clear();
      this.chatMessageClass = null;
      this.currentWindowTitle = null;
      this.currentWindowProperties = {};
      this.inventoryEvents.reset();
      this.interface.reset();
      this.interface.stopRuntime();
      this.logger.info(`[Connection] Disconnected${reason ? `: ${reason}` : '.'}`);
      this.onSnapshot();
      if (reconnect) void this.scheduleReconnect(attempt);
    });
  }

  isCurrent(bot, attempt) {
    return this.bot === bot && this.connectionAttempt === attempt;
  }

  updatePosition(bot, immediate = false) {
    const now = Date.now();
    if (!immediate && now - this.lastMoveUpdate < 250) return;
    this.lastMoveUpdate = now;
    if (bot.entity?.position) this.interface.setPosition(bot.entity.position.floored());
  }

  updatePlayers(immediate = false) {
    const now = Date.now();
    if (!immediate && now - this.lastPlayerUpdate < 500) return;
    this.lastPlayerUpdate = now;
    this.onSnapshot();
  }

  updateTargets(immediate = false) {
    const now = Date.now();
    if (!immediate && now - this.lastTargetUpdate < 300) return;
    this.lastTargetUpdate = now;
    this.onSnapshot();
  }

  updateVitals(bot) {
    this.interface.setVitals({
      health: bot.health,
      hunger: bot.food,
      saturation: bot.foodSaturation,
      armor: Math.max(0, Math.min(20, attributeValue(bot.entity?.attributes || {}, 'armor'))),
      experience: bot.experience
    });
  }

  updateEffects(bot) {
    const effects = Object.values(bot.entity?.effects || {}).map((effect) => {
      const details = bot.registry.effects[effect.id];
      const visibility = this.effectFlags.get(Number(effect.id)) || effectVisibility(Number.NaN, bot.version);
      return details ? {
        effect: effectAssetName(details.name),
        displayName: details.displayName,
        amplifier: Number(effect.amplifier) || 0,
        duration: Number(effect.duration) || 0,
        ambient: effect.ambient === true || visibility.ambient,
        showParticles: effect.showParticles === undefined ? visibility.showParticles : effect.showParticles !== false,
        showIcon: effect.showIcon === undefined ? visibility.showIcon : effect.showIcon !== false
      } : null;
    }).filter(Boolean);
    this.interface.setPotionEffects(effects);
  }

  async handleRemoteCommand(bot, username, message) {
    if (username === bot.username || !message.startsWith('!')) return;
    const enabled = await this.store.getSetting('remoteCommandsEnabled');
    const allowedPlayers = await this.store.getSetting('remoteCommandPlayers');
    const capabilities = await this.store.getSetting('remoteCommandCapabilities');
    if (enabled !== true || !Array.isArray(allowedPlayers) || !allowedPlayers.some((name) => name.toLowerCase() === username.toLowerCase())) {
      return;
    }
    await this.getCommands().execute(message.slice(1), {
      type: 'player',
      sessionId: this.sessionId,
      player: username,
      capabilities: Array.isArray(capabilities) ? capabilities : [],
      reply: (response) => bot.chat(`/msg ${username} ${String(response).replace(/[\r\n]+/gu, ' ')}`.slice(0, 256))
    });
  }

  async scheduleReconnect(connectionAttempt = this.connectionAttempt) {
    const [enabled, configuredMaximum] = await Promise.all([
      this.store.getSetting('automaticReconnectEnabled'),
      this.store.getSetting('reconnectAttempts')
    ]);
    const maximum = Number(configuredMaximum ?? 3);
    if (enabled !== true || this.manualDisconnect || this.bot || this.connectionAttempt !== connectionAttempt || !this.lastConnectionOptions || this.reconnectAttempt >= maximum) return;
    this.reconnectAttempt += 1;
    const delay = Math.min(30000, 1000 * 2 ** (this.reconnectAttempt - 1));
    this.interface.setStatus('reconnecting');
    this.logger.info(`[Connection] Reconnecting in ${delay / 1000} seconds (${this.reconnectAttempt}/${maximum}).`);
    const handle = this.schedule(() => {
      this.activities.finish('reconnect');
      if (this.manualDisconnect || this.bot || this.connectionAttempt !== connectionAttempt) return;
      this.startClient(this.lastConnectionOptions, { reconnect: true }).catch((error) => {
        this.logger.error(`[Connection] Reconnect failed: ${error.message}`);
        void this.scheduleReconnect();
      });
    }, delay);
    this.activities.register('reconnect', {
      label: 'Reconnect',
      detail: `Attempt ${this.reconnectAttempt} of ${maximum}`,
      stop: () => this.cancelSchedule(handle)
    });
  }

  invalidateInventorySnapshot() {
    this.inventoryCache = null;
  }

  inventorySnapshot(force = false) {
    const bot = this.bot;
    if (!bot?.entity) return {
      connectionId: this.connectionAttempt,
      windowId: null,
      containerOpen: false,
      inventory: [],
      inventorySlots: [],
      inventoryLayout: null,
      container: [],
      containerSlots: [],
      containerLayout: null,
      inventoryRevision: this.inventoryEvents.revision
    };
    const container = bot.currentWindow;
    const cacheKey = `${this.connectionAttempt}:${this.inventoryEvents.revision}:${container?.id ?? 'inventory'}`;
    if (!force && this.inventoryCache?.key === cacheKey) return this.inventoryCache.value;
    const inventory = bot.inventory;
    const items = (values, window) => values.map((item) => serializeItem(item, window.hotbarStart, window.inventoryEnd, this.chatMessageClass, bot.registry));
    const snapshot = {
      connectionId: this.connectionAttempt,
      inventoryRevision: this.inventoryEvents.revision,
      windowId: container?.id ?? null,
      containerOpen: Boolean(container),
      inventory: items(inventory?.items?.() || [], inventory),
      inventorySlots: serializeSlots(inventory, 0, inventory?.inventoryEnd || 0, this.chatMessageClass, bot.registry),
      inventoryLayout: inventory ? {
        kind: 'player',
        inventoryStart: inventory.inventoryStart,
        inventoryEnd: inventory.inventoryEnd,
        hotbarStart: inventory.hotbarStart,
        selectedHotbar: Number.isInteger(bot.quickBarSlot) ? bot.quickBarSlot : 0
      } : null,
      container: items(container?.containerItems?.() || [], container),
      containerSlots: serializeSlots(container, 0, container?.inventoryStart || 0, this.chatMessageClass, bot.registry),
      containerLayout: container ? {
        ...describeWindow(container, this.currentWindowTitle || (typeof container.title === 'string' ? container.title : 'Open container'), this.chatMessageClass, bot.registry),
        properties: { ...this.currentWindowProperties }
      } : null
    };
    this.inventoryCache = { key: cacheKey, value: snapshot };
    return snapshot;
  }

  snapshot() {
    const bot = this.bot;
    const inventory = this.inventorySnapshot();
    if (!bot?.entity) return {
      ...inventory,
      players: [],
      presentation: emptyPresentation(),
      server: null
    };
    return {
      ...inventory,
      presentation: this.presentation?.snapshot() || emptyPresentation(),
      username: bot.username,
      players: Object.values(bot.players || {}).filter((player) => player.username).map((player) => {
        const distanceValue = bot.entity?.position && player.entity?.position ? bot.entity.position.distanceTo(player.entity.position) : null;
        const distance = Number.isFinite(distanceValue) ? Math.round(distanceValue * 10) / 10 : null;
        return {
          username: player.username,
          uuid: player.uuid || null,
          ping: Number.isFinite(player.ping) && player.ping >= 0 ? player.ping : null,
          visible: Boolean(player.entity),
          nearby: distance !== null,
          distance,
          friend: this.playerActions?.isFriend(player, bot) === true,
          actions: this.playerActions?.describe(bot, player.username) || []
        };
      }).sort((left, right) => Number(right.nearby) - Number(left.nearby) || (left.distance ?? Infinity) - (right.distance ?? Infinity) || left.username.localeCompare(right.username)),
      server: bot.lastOptions ? {
        host: bot.lastOptions.host,
        port: bot.lastOptions.port,
        version: bot.version || bot.lastOptions.version || 'automatic'
      } : null
    };
  }

  async disconnect(reason = 'Disconnected by user') {
    const bot = this.bot;
    this.manualDisconnect = true;
    this.activities.stopAll();
    if (!bot) {
      this.interface.reset();
      return;
    }
    this.bot = null;
    this.presentation?.close();
    this.presentation = null;
    this.effectFlags.clear();
    this.chatMessageClass = null;
    this.currentWindowTitle = null;
    this.currentWindowProperties = {};
    this.inventoryEvents.reset();
    this.invalidateInventorySnapshot();
    this.connectionAttempt += 1;
    try {
      bot.quit(reason);
    } catch {
      bot.end(reason);
    }
    this.interface.reset();
  }

  reload() {
    const bot = this.bot;
    if (!bot) return;
    if (bot.pathfinder?.isMoving() || bot.pathfinder?.goal) cancelNavigation(bot);
    if (bot.targetDigBlock) bot.stopDigging().catch(() => {});
    bot.clearControlStates();
  }

  async close() {
    await this.disconnect('MinePrompt closed');
  }
}

module.exports = { MineflayerClient, attributeValue, containerColumns, effectAssetName, effectVisibility, readableReason, serializeItem, serializeSlots };
