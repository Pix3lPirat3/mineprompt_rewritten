'use strict';

const { GoalFollow, GoalNear } = require('mineflayer-pathfinder').goals;
const { ActionDispatcher } = require('./action-dispatcher');
const { cancelNavigation, navigateGoal } = require('./navigation-service');

const PLAYER_ACTION_INPUT = Object.freeze({
  type: 'object',
  properties: {
    username: { type: 'string', minLength: 1, maxLength: 16 },
    message: { type: 'string', maxLength: 240 },
    range: { type: 'number', minimum: 1, maximum: 16 },
    overrideFriendProtection: { type: 'boolean' },
    confirmOverride: { type: 'boolean' }
  },
  required: ['username'],
  additionalProperties: false
});

const PLAYER_ACTIONS = Object.freeze([
  Object.freeze({ id: 'player.inspect', label: 'View player details', detail: 'players <name> inspect', order: 10, unavailable: 'disable', capability: 'status', risk: 'read' }),
  Object.freeze({ id: 'player.friend.add', label: 'Add friend', detail: 'friends add <name>', order: 15, unavailable: 'hide', relationshipOperation: 'add', capability: 'relationships.write' }),
  Object.freeze({ id: 'player.friend.remove', label: 'Remove friend', detail: 'friends remove <name>', order: 15, unavailable: 'hide', relationshipOperation: 'remove', capability: 'relationships.write' }),
  Object.freeze({ id: 'player.follow', label: 'Follow player', detail: 'follow <name> | GoalFollow', order: 20, unavailable: 'hide', requiresNearby: true, capability: 'movement' }),
  Object.freeze({ id: 'player.goto', label: 'Go to player', detail: 'players <name> goto | pathfinder.goto', order: 30, unavailable: 'disable', requiresNearby: true, capability: 'movement' }),
  Object.freeze({ id: 'player.look', label: 'Look at player', detail: 'players <name> look | bot.lookAt', order: 40, unavailable: 'disable', requiresNearby: true, capability: 'movement' }),
  Object.freeze({ id: 'player.message', label: 'Message player', detail: 'players <name> message | bot.chat', order: 50, unavailable: 'disable', excludesSelf: true, preparesInput: true, capability: 'chat' }),
  Object.freeze({
    id: 'player.attack',
    label: 'Attack player',
    detail: 'players <name> attack | bot.attack',
    order: 90,
    unavailable: 'hide',
    excludesSelf: true,
    requiresNearby: true,
    capability: 'combat',
    risk: 'dangerous',
    relationshipPolicy: 'protect-friends',
    allowsRelationshipOverride: true
  })
]);

function findPlayer(bot, username) {
  const requested = String(username || '').toLowerCase();
  return Object.values(bot?.players || {}).find((player) => player.username?.toLowerCase() === requested) || null;
}

function playerDistance(bot, player) {
  if (!bot?.entity?.position || !player?.entity?.position) return null;
  const value = bot.entity.position.distanceTo(player.entity.position);
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

function canOverrideRelationshipProtection(request, origin = {}) {
  const requestOrigin = origin || {};
  if (request?.overrideFriendProtection !== true) return false;
  if (requestOrigin.type === 'gui' || requestOrigin.type === 'terminal') return true;
  return request.confirmOverride === true && Array.isArray(requestOrigin.capabilities) && requestOrigin.capabilities.includes('relationships.override');
}

class PlayerActionRegistry {
  constructor({ relationships = null, logger = null } = {}) {
    this.relationships = relationships;
    this.logger = logger;
    this.dispatcher = new ActionDispatcher({
      audit: (event) => {
        if (event.input?.overrideFriendProtection === true) {
          const status = event.status === 'completed' ? 'used' : 'attempted';
          this.logger?.warn?.(`[Relationships] ${status} friend protection override for ${event.input.username}.`);
        }
      }
    });
    for (const action of PLAYER_ACTIONS) {
      this.dispatcher.register({ ...action, inputSchema: PLAYER_ACTION_INPUT, execute: (context) => this.executeBuiltIn(action.id, context) });
    }
    this.dispatcher.registerPolicy('core', ({ action, bot, player }) => {
      const self = player.username?.toLowerCase() === bot.username?.toLowerCase();
      if (action.excludesSelf && self) return { visible: false, enabled: false, reason: 'Unavailable for the current bot.' };
      if (action.requiresNearby && !player.entity) return { enabled: false, reason: 'Player is not nearby.' };
      return null;
    });
    this.dispatcher.registerPolicy('relationships', ({ action, bot, player, request, origin }) => {
      if (action.relationshipOperation === 'add') return { visible: !this.isFriend(player, bot), enabled: !this.isFriend(player, bot) };
      if (action.relationshipOperation === 'remove') return { visible: this.isFriend(player, bot), enabled: this.isFriend(player, bot) };
      if (action.relationshipPolicy !== 'protect-friends' || !this.isFriend(player, bot)) return null;
      if (canOverrideRelationshipProtection(request, origin)) return null;
      return {
        enabled: false,
        reason: request?.overrideFriendProtection ? 'Friend protection override was not authorized.' : 'Friend protected. Hold Ctrl+Shift to override.',
        relationshipProtected: true,
        overrideAllowed: action.allowsRelationshipOverride === true
      };
    });
  }

  get actions() {
    return this.dispatcher.actions;
  }

  get policies() {
    return this.dispatcher.policies;
  }

  isFriend(player, bot = null) {
    return this.relationships?.isFriend(player, { server: bot?.lastOptions?.host || null }) === true;
  }

  register(action) {
    return this.dispatcher.register({ order: 50, unavailable: 'disable', inputSchema: PLAYER_ACTION_INPUT, ...action });
  }

  registerPolicy(id, evaluate) {
    return this.dispatcher.registerPolicy(id, evaluate);
  }

  evaluate(action, context) {
    return this.dispatcher.evaluate(action, context);
  }

  describe(bot, username) {
    const player = findPlayer(bot, username);
    if (!player) return [];
    return [...this.actions.values()].sort((left, right) => left.order - right.order).flatMap((action) => {
      const availability = this.evaluate(action, { bot, player, request: null, origin: null });
      if (!availability.visible) return [];
      if (!availability.enabled && action.unavailable === 'hide' && !availability.overrideAllowed) return [];
      return [{
        id: action.id,
        label: action.label,
        detail: action.detail,
        enabled: availability.enabled,
        reason: availability.reason,
        danger: action.risk === 'dangerous',
        preparesInput: action.preparesInput === true,
        relationshipProtected: availability.relationshipProtected,
        overrideAllowed: availability.overrideAllowed
      }];
    });
  }

  async execute(request, { bot, activities, origin = { type: 'terminal' } }) {
    const actionId = String(request?.actionId || '');
    const player = findPlayer(bot, request?.username);
    if (!player) throw new Error('The player is no longer online.');
    const input = {
      username: player.username,
      ...(request.message !== undefined ? { message: String(request.message) } : {}),
      ...(request.range !== undefined ? { range: Number(request.range) } : {}),
      ...(request.overrideFriendProtection === true ? { overrideFriendProtection: true } : {}),
      ...(request.confirmOverride === true ? { confirmOverride: true } : {})
    };
    return this.dispatcher.execute(actionId, input, { bot, player, activities, origin });
  }

  async executeBuiltIn(id, { request, bot, player, activities }) {
    const distance = playerDistance(bot, player);
    if (id === 'player.friend.add') {
      await this.relationships.add({ kind: 'friend', username: player.username, uuid: player.uuid || null, server: bot.lastOptions?.host || null });
      return { message: `[Friends] Added ${player.username}.` };
    }
    if (id === 'player.friend.remove') {
      const matches = this.relationships.find(player, { server: bot.lastOptions?.host || null }).filter((entry) => entry.kind === 'friend');
      await Promise.all(matches.map((entry) => this.relationships.remove('friend', entry.username, entry.server)));
      return { message: `[Friends] Removed ${player.username}.` };
    }
    if (id === 'player.inspect') {
      return {
        message: `[Player] ${player.username}\nDistance: ${distance === null ? 'Not nearby' : `${distance} blocks`}\nPing: ${Number.isFinite(player.ping) ? `${player.ping} ms` : 'Unknown'}`
      };
    }
    if (id === 'player.follow') {
      bot.pathfinder.setGoal(new GoalFollow(player.entity, 2), true);
      activities.register('follow', {
        label: `Following ${player.username}`,
        detail: 'Maintaining a 2 block distance',
        resources: ['movement'],
        stop: () => cancelNavigation(bot)
      });
      return { message: `[Follow] Now following ${player.username}.` };
    }
    if (id === 'player.goto') {
      const { x, y, z } = player.entity.position;
      await navigateGoal(bot, new GoalNear(x, y, z, request.range || 2), { description: player.username });
      return { message: `[Goto] Reached ${player.username}.` };
    }
    if (id === 'player.look') {
      await bot.lookAt(player.entity.position.offset(0, player.entity.height || 1.62, 0), true);
      return { message: `[Look] Looking at ${player.username}.` };
    }
    if (id === 'player.message') {
      const message = String(request.message || '').trim();
      if (!message) return { message: `[Message] Enter a message for ${player.username}.`, prepareCommand: `cmd msg ${player.username} ` };
      bot.chat(`/msg ${player.username} ${message}`.slice(0, 256));
      return { message: `[Message] Sent a message to ${player.username}.` };
    }
    if (id === 'player.attack') {
      if (distance === null || distance > 4.5) throw new Error('The player is outside attack range.');
      await bot.attack(player.entity);
      return { message: `[Combat] Attacked ${player.username}.` };
    }
    throw new Error('The player action has no executor.');
  }
}

module.exports = { PLAYER_ACTIONS, PLAYER_ACTION_INPUT, PlayerActionRegistry, canOverrideRelationshipProtection, findPlayer, playerDistance };
