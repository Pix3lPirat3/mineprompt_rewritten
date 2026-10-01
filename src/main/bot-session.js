'use strict';

const { CommandRegistry } = require('./command-registry');
const { InterfaceState } = require('./interface-state');
const { MineflayerClient } = require('./mineflayer-client');
const { ActivityManager } = require('./activity-manager');
const { AutomationRuntime } = require('./automation-runtime');
const { ConnectionService } = require('./connection-service');
const { InventoryService } = require('./inventory-service');
const { InventoryPipeline } = require('./inventory-pipeline');
const { MiningService } = require('./mining-service');
const { StashService } = require('./stash-service');
const { CraftingService } = require('./crafting-service');
const { PlayerActionRegistry } = require('./player-actions');
const { RelationshipService } = require('./relationship-service');
const { TargetingService } = require('./targeting-service');
const { WorkflowRunner } = require('./workflow-runtime');
const { DebugEvaluator } = require('./debug-evaluator');
const { resolveMiningPolicy } = require('./mining-presets');
const { Vec3 } = require('vec3');

class BotSession {
  constructor({ id, rootPath, privateCommandsPath, store, logger, emit }) {
    this.id = String(id);
    this.store = store;
    this.logger = logger;
    this.emit = emit;
    this.interface = new InterfaceState((channel, payload) => this.publish(channel, payload), logger);
    this.activities = new ActivityManager(() => this.publishSnapshot());
    this.automation = new AutomationRuntime(this.activities, logger);
    this.relationships = new RelationshipService(store);
    this.playerActions = new PlayerActionRegistry({ relationships: this.relationships, logger });
    this.inventoryPipeline = new InventoryPipeline({
      snapshot: () => this.client.inventorySnapshot(),
      publish: (payload) => this.publish('inventory', payload)
    });
    this.commands = new CommandRegistry({
      rootPath,
      privateCommandsPath,
      logger,
      getContext: (origin) => this.commandContext(origin)
    });
    this.client = new MineflayerClient({
      logger,
      interfaceState: this.interface,
      store,
      getCommands: () => this.commands,
      activities: this.activities,
      automation: this.automation,
      onSnapshot: () => this.publishSnapshot(),
      onInventoryEvent: (event) => this.inventoryPipeline.receive(event),
      playerActions: this.playerActions,
      sessionId: this.id
    });
    this.connections = new ConnectionService({ client: this.client, store, logger, interfaceState: this.interface });
    this.inventory = new InventoryService({ getClient: () => this.client, onChange: () => this.publishSnapshot() });
    this.crafting = new CraftingService({ getClient: () => this.client, onChange: () => this.publishSnapshot() });
    this.mining = new MiningService({
      getClient: () => this.client,
      activities: this.activities,
      logger,
      onChange: () => this.publishSnapshot()
    });
    this.stash = new StashService({
      getClient: () => this.client,
      activities: this.activities,
      mining: this.mining,
      logger,
      onChange: () => this.publishSnapshot()
    });
    this.targets = new TargetingService({
      getClient: () => this.client,
      activities: this.activities,
      playerActions: this.playerActions,
      mining: this.mining,
      stash: this.stash,
      logger,
      onChange: () => this.publishSnapshot()
    });
    this.workflows = new WorkflowRunner({ automation: this.automation, commands: this.commands, logger });
    this.debug = new DebugEvaluator({ context: () => this.debugContext(), logger });
    this.ready = Promise.resolve(this.init());
  }

  init() {
    this.commands.setCommands('global');
    this.publishSnapshot();
    return this;
  }

  commandContext(origin = {}) {
    return Object.freeze({
      actions: this.playerActions,
      activities: this.activities,
      automation: this.automation,
      bot: this.client.bot,
      chatMessageClass: this.client.chatMessageClass,
      client: this.client,
      commands: this.commands,
      connections: this.connections,
      crafting: this.crafting,
      debug: this.debug,
      interfaceState: this.interface,
      inventory: this.inventory,
      logger: this.logger,
      mining: this.mining,
      stash: this.stash,
      relationships: this.relationships,
      targets: this.targets,
      store: this.store,
      workflowRunner: this.workflows,
      dispatchPlayerAction: (request, childOrigin = {}) => this.executePlayerAction(request, childOrigin),
      dispatchTargetAction: (request, childOrigin = {}) => this.targetAction(request, childOrigin),
      requestRendererReload: () => this.publish('renderer-reload', { requestedAt: Date.now() }),
      execute: (input, childOrigin = {}) => this.commands.execute(input, { reply: this.logger.log, ...childOrigin, sessionId: this.id })
    });
  }

  async connect(options) {
    await this.connections.connect(options);
    this.publishSnapshot();
    return { ok: true, sessionId: this.id };
  }

  execute(input, origin = { type: 'terminal' }) {
    const requestOrigin = origin || { type: 'terminal' };
    return this.commands.execute(input, { ...requestOrigin, sessionId: this.id, reply: requestOrigin.reply || this.logger.log });
  }

  complete(input) {
    return this.commands.complete(input, { type: 'terminal', sessionId: this.id });
  }

  async disconnect() {
    await this.client.disconnect();
    this.publishSnapshot();
    return { ok: true };
  }

  reloadCommands() {
    this.commands.reload();
    this.publishSnapshot();
    return { ok: true };
  }

  async inventoryAction(request) {
    const result = await this.inventory.execute(request);
    this.logger.log(result.message);
    return { ok: true, ...result };
  }

  inventoryInspect(request) {
    return this.inventory.inspect(request);
  }

  debugEvaluate(request) {
    return this.debug.evaluate(request);
  }

  debugContext() {
    return {
      bot: this.client.bot,
      session: this,
      client: this.client,
      inventory: this.inventory,
      mining: this.mining,
      stash: this.stash,
      targets: this.targets,
      activities: this.activities,
      automation: this.automation,
      relationships: this.relationships,
      commands: this.commands,
      store: this.store
    };
  }

  async executePlayerAction(request, origin = { type: 'terminal' }) {
    if (!this.client.bot?.entity) throw new Error('An active connection is required.');
    const result = await this.playerActions.execute(request, {
      bot: this.client.bot,
      activities: this.activities,
      origin: origin || { type: 'terminal' }
    });
    this.logger.log(result.message);
    this.publishSnapshot();
    return { ok: true, ...result };
  }

  playerAction(request, origin = { type: 'gui' }) {
    return this.executePlayerAction(request, origin);
  }

  async targetAction(request, origin = { type: 'gui' }) {
    const miningRequest = String(request?.actionId || '').startsWith('block.mine') || request?.actionId === 'block.dig';
    const result = await this.targets.execute(miningRequest ? { ...request, policy: this.resolveMiningPolicy(request.policy, request.presetId || request.preset) } : request, origin);
    this.logger.log(result.message);
    this.publishSnapshot();
    return { ok: true, ...result };
  }

  async miningAction(request = {}, origin = { type: 'agent' }) {
    const action = String(request.action || 'status');
    if (action === 'stop') return { ok: this.activities.stop('regionmine') || this.activities.stop('consistentmine') };
    if (action === 'status') return { ok: true, status: this.mining.status(), activities: this.activities.snapshot().filter((activity) => ['regionmine', 'consistentmine'].includes(activity.id)) };
    const bot = this.client.bot;
    if (!bot?.entity) throw new Error('An active connection is required.');
    const policy = this.resolveMiningPolicy(request.policy, request.presetId || request.preset);
    if (action === 'once' || action === 'consistent') {
      const position = request.position ? new Vec3(Math.trunc(request.position.x), Math.trunc(request.position.y), Math.trunc(request.position.z)) : null;
      const block = position ? bot.blockAt(position) : bot.blockAtCursor?.(32);
      if (!block || ['air', 'cave_air', 'void_air'].includes(block.name)) throw new Error('The mining target is no longer available.');
      if (action === 'once') {
        const result = await this.mining.mineOnce(block, policy);
        this.publishSnapshot();
        return { ok: true, ...result };
      }
      return { ok: true, ...this.mining.startConsistent(block, Math.max(1, Math.min(16, Number(request.depth) || 1)), policy) };
    }
    if (action === 'region') {
      if (!request.from || !request.to) throw new Error('Region mining requires from and to positions.');
      return { ok: true, ...this.mining.startRegion(request.from, request.to, policy) };
    }
    if (action === 'chunk') {
      const depth = Math.max(1, Math.min(16, Number(request.depth) || 1));
      const originPosition = bot.entity.position.floored();
      const x = Math.floor(originPosition.x / 16) * 16;
      const z = Math.floor(originPosition.z / 16) * 16;
      return { ok: true, ...this.mining.startRegion({ x, y: originPosition.y - depth + 1, z }, { x: x + 15, y: originPosition.y, z: z + 15 }, policy) };
    }
    throw new Error('Unknown mining action.');
  }

  stashAction(request = {}) {
    const action = String(request.action || 'nearby').toLowerCase();
    if (action === 'status') return { ok: true, status: this.stash.status() };
    if (action === 'stop') return { ok: this.stash.stop(), status: this.stash.status() };
    const status = this.stash.start({
      mode: action,
      selector: request.selector,
      confirmed: request.confirmed,
      collectionRadius: request.collectionRadius,
      containerRadius: request.containerRadius
    });
    return { ok: true, status };
  }

  resolveMiningPolicy(policy = {}, reference = null) {
    const data = this.store.snapshot();
    return resolveMiningPolicy(policy || {}, data.miningPresets || [], reference || data.activeMiningPresetId || null);
  }

  recipes(request = {}) {
    return this.crafting.list(request);
  }

  async craft(request = {}) {
    const result = await this.crafting.craft(request);
    this.logger.log(result.message);
    return { ok: true, ...result };
  }

  runWorkflow(workflow) {
    const result = this.workflows.run(workflow, this.id);
    this.publishSnapshot();
    return { ok: true, ...result };
  }

  stopWorkflow(workflowId) {
    const stopped = this.workflows.stop(workflowId);
    this.publishSnapshot();
    return { ok: stopped };
  }

  snapshot() {
    return {
      id: this.id,
      state: this.interface.snapshot(),
      activities: this.activities.snapshot(),
      session: { ...this.client.snapshot(), targets: this.targets.snapshot() },
      commands: this.commands.descriptors(),
      diagnostics: { inventory: this.inventoryPipeline.telemetry.snapshot() },
      process: { isolated: false, pid: process.pid, status: 'running' }
    };
  }

  publish(channel, payload) {
    this.emit(channel, { ...payload, sessionId: this.id });
  }

  publishSnapshot() {
    this.emit('session-snapshot', this.snapshot());
  }

  updateStore() {}

  async close() {
    this.inventoryPipeline.close();
    this.workflows.close();
    this.automation.close();
    await this.client.close();
  }
}

module.exports = { BotSession };
