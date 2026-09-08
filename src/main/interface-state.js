'use strict';

const DEFAULT_NAMES = ['Steve', 'Alex', 'Noor', 'Sunny', 'Ari', 'Zuri', 'Makena', 'Kai', 'Efe'];

class InterfaceState {
  constructor(emit, logger) {
    this.emit = emit;
    this.logger = logger;
    this.state = {
      status: 'disconnected',
      username: null,
      displayName: null,
      position: null,
      health: 0,
      hunger: 0,
      effects: [],
      sessionStartedAt: null,
      anonymous: false,
      lastError: null
    };
    this.anonymous = {
      enabled: false,
      anonymous_username: null,
      enable: (username) => this.enableAnonymous(username),
      disable: () => this.disableAnonymous(),
      toggle: () => this.anonymous.enabled ? this.disableAnonymous() : this.enableAnonymous()
    };
  }

  snapshot() {
    return structuredClone(this.state);
  }

  publish() {
    this.emit('state', this.snapshot());
  }

  setStatus(status) {
    this.state.status = status;
    if (['connecting', 'authenticating', 'joining', 'online'].includes(status)) this.state.lastError = null;
    this.publish();
  }

  setFailure(message) {
    this.state.status = 'failed';
    this.state.lastError = String(message || 'The connection failed.');
    this.publish();
  }

  startSession(username) {
    this.state.status = 'online';
    this.state.username = username;
    this.state.displayName = this.anonymous.enabled ? this.anonymous.anonymous_username : username;
    this.state.sessionStartedAt = Date.now();
    if (this.anonymous.enabled) this.applyRedaction();
    this.publish();
  }

  reset() {
    this.state = {
      ...this.state,
      status: 'disconnected',
      username: null,
      displayName: this.anonymous.enabled ? this.anonymous.anonymous_username : null,
      position: null,
      health: 0,
      hunger: 0,
      effects: [],
      sessionStartedAt: null
    };
    this.publish();
  }

  setPosition(position) {
    this.state.position = position?.toString?.() ?? String(position);
    this.publish();
  }

  setHealth(health) {
    this.state.health = Number.isFinite(health) ? health : 0;
    this.publish();
  }

  setHunger(hunger) {
    this.state.hunger = Number.isFinite(hunger) ? hunger : 0;
    this.publish();
  }

  setPotionEffects(effects) {
    this.state.effects = Array.isArray(effects) ? effects : [];
    this.publish();
  }

  stopRuntime() { this.emit('attention', {}); }

  enableAnonymous(username) {
    if (this.anonymous.enabled) {
      this.logger.warn('[Privacy] Anonymous display mode is already enabled.');
      return;
    }
    this.anonymous.enabled = true;
    this.anonymous.anonymous_username = String(username || DEFAULT_NAMES[Math.floor(Math.random() * DEFAULT_NAMES.length)]);
    this.state.anonymous = true;
    this.state.displayName = this.anonymous.anonymous_username;
    this.applyRedaction();
    this.logger.log(`[Privacy] Anonymous display mode enabled as ${this.anonymous.anonymous_username}.`);
    this.publish();
  }

  disableAnonymous() {
    this.anonymous.enabled = false;
    this.anonymous.anonymous_username = null;
    this.state.anonymous = false;
    this.state.displayName = this.state.username;
    this.logger.setRedactor();
    this.logger.log('[Privacy] Anonymous display mode disabled.');
    this.publish();
  }

  applyRedaction() {
    const username = this.state.username;
    const alias = this.anonymous.anonymous_username;
    if (!username || !alias) return;
    const escaped = username.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const pattern = new RegExp(escaped, 'giu');
    this.logger.setRedactor((message) => message.replace(pattern, alias));
  }
}

module.exports = { InterfaceState };
