'use strict';

const { createBot } = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');

function readableReason(reason) {
  if (typeof reason === 'string') return reason;
  if (reason?.toString) return reason.toString();
  try { return JSON.stringify(reason); } catch { return 'Unknown reason'; }
}

class MineflayerClient {
  constructor({
    logger,
    interfaceState,
    store,
    getCommands,
    activities,
    createBotImpl = createBot,
    pathfinderPlugin = pathfinder,
    MovementsClass = Movements,
    chatFactory = (registry) => require('prismarine-chat')(registry)
  }) {
    this.logger = logger;
    this.interface = interfaceState;
    this.store = store;
    this.getCommands = getCommands;
    this.activities = activities;
    this.createBot = createBotImpl;
    this.pathfinderPlugin = pathfinderPlugin;
    this.Movements = MovementsClass;
    this.chatFactory = chatFactory;
    this.bot = null;
    this.chatMessageClass = null;
    this.connectionAttempt = 0;
    this.lastMoveUpdate = 0;
  }

  async startClient(options) {
    if (!options || typeof options !== 'object') throw new TypeError('Connection options are required.');
    if (this.bot) await this.disconnect('Starting a new connection');
    this.getCommands().setCommands('mineflayer');

    const attempt = ++this.connectionAttempt;
    this.interface.setStatus('connecting');
    const { accountUsername, ...connectionOptions } = options;
    const bot = this.createBot(connectionOptions);
    this.bot = bot;
    bot.lastOptions = { ...options };
    bot.loadPlugin(this.pathfinderPlugin);
    this.bindEvents(bot, { ...connectionOptions, accountUsername }, attempt);
    return bot;
  }

  bindEvents(bot, options, attempt) {
    bot.once('login', async () => {
      if (!this.isCurrent(bot, attempt)) return;
      this.chatMessageClass = this.chatFactory(bot.registry);
      this.logger.info(`[Connection] Logged in as ${bot.username}.`);
      if (options.accountUsername && options.accountUsername !== bot.username) {
        await this.store.renameAccount(options.accountUsername, bot.username).catch((error) => this.logger.warn(error.message));
      }
    });

    bot.once('spawn', () => {
      if (!this.isCurrent(bot, attempt)) return;
      this.interface.startSession(bot.username);
      const movements = new this.Movements(bot);
      movements.allow1by1towers = false;
      movements.canDig = false;
      movements.allowFreeMotion = true;
      movements.scafoldingBlocks = [];
      bot.pathfinder.setMovements(movements);
      this.updatePosition(bot, true);
      this.updateVitals(bot);
      this.updateEffects(bot);
      this.logger.info(`[Connection] Spawned on ${options.host}:${options.port}.`);
    });

    bot.on('move', () => this.updatePosition(bot));
    bot.on('health', () => this.updateVitals(bot));
    bot.on('entityEffect', (entity) => {
      if (entity === bot.entity) this.updateEffects(bot);
    });
    bot.on('entityEffectEnd', (entity) => {
      if (entity === bot.entity) this.updateEffects(bot);
    });

    bot.on('windowOpen', (window) => {
      const title = window?.title?.toString?.() || 'container';
      this.logger.info(`[Inventory] Opened ${title}.`);
    });
    bot.on('death', () => this.logger.warn(`[Connection] ${bot.username} died.`));
    bot.on('playerCollect', (collector, item) => {
      if (collector.id !== bot.entity?.id) return;
      const dropped = item.getDroppedItem?.();
      if (dropped) this.logger.info(`[Inventory] Collected ${dropped.count} x ${dropped.displayName}.`);
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
      this.logger.error(`[Connection] ${messages[error.code] || error.message || 'An unexpected error occurred.'}`);
      this.logger.debug(error.stack);
    });

    bot.once('end', (reason) => {
      if (!this.isCurrent(bot, attempt)) return;
      this.bot = null;
      this.chatMessageClass = null;
      this.interface.reset();
      this.interface.stopRuntime();
      this.logger.info(`[Connection] Disconnected${reason ? `: ${reason}` : '.'}`);
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

  updateVitals(bot) {
    this.interface.setHealth(bot.health);
    this.interface.setHunger(bot.food);
  }

  updateEffects(bot) {
    const effects = Object.values(bot.entity?.effects || {}).map((effect) => {
      const details = bot.registry.effects[effect.id];
      return details ? { effect: details.name, displayName: details.displayName } : null;
    }).filter(Boolean);
    this.interface.setPotionEffects(effects);
  }

  async handleRemoteCommand(bot, username, message) {
    if (username === bot.username || !message.startsWith('!')) return;
    const enabled = await this.store.getSetting('remoteCommandsEnabled');
    const allowedPlayers = await this.store.getSetting('remoteCommandPlayers');
    if (enabled !== true || !Array.isArray(allowedPlayers) || !allowedPlayers.some((name) => name.toLowerCase() === username.toLowerCase())) {
      return;
    }
    await this.getCommands().execute(message.slice(1), {
      type: 'player',
      player: username,
      reply: (response) => bot.chat(`/msg ${username} ${String(response).replace(/[\r\n]+/gu, ' ')}`.slice(0, 256))
    });
  }

  async disconnect(reason = 'Disconnected by user') {
    const bot = this.bot;
    if (!bot) return;
    this.bot = null;
    this.connectionAttempt += 1;
    this.activities.stopAll();
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
    if (bot.pathfinder?.isMoving()) bot.pathfinder.stop();
    if (bot.targetDigBlock) bot.stopDigging().catch(() => {});
    bot.clearControlStates();
  }

  async close() {
    await this.disconnect('MinePrompt closed');
  }
}

module.exports = { MineflayerClient, readableReason };
