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
const { TreeService } = require('./tree-service');
const { StashService } = require('./stash-service');
const { CraftingService } = require('./crafting-service');
const { PlayerActionRegistry } = require('./player-actions');
const { RelationshipService } = require('./relationship-service');
const { TargetingService } = require('./targeting-service');
const { WorkflowRunner } = require('./workflow-runtime');
const { DebugEvaluator } = require('./debug-evaluator');
const { resolveMiningPolicy } = require('./mining-presets');
const { SnapshotPublisher } = require('./snapshot-publisher');
const { loadEngine } = require('./engine-loader');
const { Vec3 } = require('vec3');
const { installToolkit } = require('../../packages/mineflayer-toolkit');

class BotSession {
  constructor({ id, rootPath, privateCommandsPath, store, logger, emit, engine = null }) {
    this.id = String(id);
    this.store = store;
    this.logger = logger;
    this.emit = emit;
    this.engine = loadEngine(engine || {});
    this.snapshotPublisher = new SnapshotPublisher({
      capture: () => this.snapshot(),
      publish: (snapshot) => this.emit('session-snapshot', snapshot),
      onError: (error) => this.logger.error(`[Snapshot] ${error instanceof Error ? error.message : String(error)}`)
    });
    this.interface = new InterfaceState((channel, payload) => this.publish(channel, payload), logger);
    this.activities = new ActivityManager(
      () => this.publishSnapshot(),
      (error) => this.logger.error(`[Activity] ${error instanceof Error ? error.message : String(error)}`)
    );
    this.automation = new AutomationRuntime(this.activities, logger);
    this.relationships = new RelationshipService(store);
    this.playerActions = new PlayerActionRegistry({ relationships: this.relationships, logger });
    this.inventoryPipeline = new InventoryPipeline({
      snapshot: () => this.client.inventorySnapshot(true),
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
      sessionId: this.id,
      edition: this.engine.edition,
      createBotImpl: this.engine.createBot,
      pathfinderPlugin: this.engine.pathfinder,
      MovementsClass: this.engine.Movements,
      chatFactory: this.engine.chatFactory
    });
    this.connections = new ConnectionService({ client: this.client, store, logger, interfaceState: this.interface });
    const inventoryChanged = () => {
      this.client.invalidateInventorySnapshot();
      this.publishSnapshot();
    };
    this.inventory = new InventoryService({ getClient: () => this.client, onChange: inventoryChanged });
    this.crafting = new CraftingService({ getClient: () => this.client, onChange: inventoryChanged });
    this.mining = new MiningService({
      getClient: () => this.client,
      activities: this.activities,
      logger,
      onChange: () => this.publishSnapshot()
    });
    this.trees = new TreeService({
      getClient: () => this.client,
      activities: this.activities,
      mining: this.mining,
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
      trees: this.trees,
      stash: this.stash,
      logger,
      onChange: () => this.publishSnapshot()
    });
    this.client.setPluginInstaller((bot) => installToolkit(bot, {
      runtime: { activities: this.activities, logger: this.logger },
      mining: { client: this.client, service: this.mining },
      trees: { client: this.client, service: this.trees },
      inventory: { client: this.client, service: this.inventory, crafting: this.crafting, stash: this.stash },
      interactions: {
        client: this.client,
        store: this.store,
        relationships: this.relationships,
        playerActions: this.playerActions,
        targets: this.targets
      }
    }));
    this.workflows = new WorkflowRunner({ automation: this.automation, commands: this.commands, logger });
    this.debug = new DebugEvaluator({ context: () => this.debugContext(), logger });
    this.ready = Promise.resolve(this.init());
  }

  init() {
    this.commands.setCommands('global');
    this.publishSnapshot();
    this.snapshotPublisher.flush();
    return this;
  }

  commandContext(origin = {}) {
    const mining = this.capability('mining')?.service || this.mining;
    const trees = this.capability('trees')?.service || this.trees;
    const inventory = this.capability('inventory')?.service || this.inventory;
    const crafting = this.capability('inventory')?.crafting || this.crafting;
    const stash = this.capability('inventory')?.stash || this.stash;
    const interactions = this.capability('interactions');
    return Object.freeze({
      actions: interactions?.players || this.playerActions,
      activities: this.activities,
      automation: this.automation,
      bot: this.client.bot,
      chatMessageClass: this.client.chatMessageClass,
      client: this.client,
      commands: this.commands,
      connections: this.connections,
      crafting,
      debug: this.debug,
      interfaceState: this.interface,
      inventory,
      logger: this.logger,
      mining,
      trees,
      stash,
      relationships: interactions?.relationships || this.relationships,
      targets: interactions?.targets || this.targets,
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
    const result = await (this.capability('inventory')?.execute(request) || this.inventory.execute(request));
    this.logger.log(result.message);
    return { ok: true, ...result };
  }

  inventoryInspect(request) {
    return this.capability('inventory')?.inspect(request) || this.inventory.inspect(request);
  }

  debugEvaluate(request) {
    return this.debug.evaluate(request);
  }

  debugContext() {
    return {
      bot: this.client.bot,
      runtime: this.client.bot?.mineprompt || null,
      session: this,
      client: this.client,
      inventory: this.inventory,
      mining: this.mining,
      trees: this.trees,
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
    const interactions = this.capability('interactions');
    const result = interactions
      ? await interactions.executePlayer(request, origin || { type: 'terminal' })
      : await this.playerActions.execute(request, { bot: this.client.bot, activities: this.activities, origin: origin || { type: 'terminal' } });
    this.logger.log(result.message);
    this.publishSnapshot();
    return { ok: true, ...result };
  }

  playerAction(request, origin = { type: 'gui' }) {
    return this.executePlayerAction(request, origin);
  }

  async targetAction(request, origin = { type: 'gui' }) {
    const worldAction = String(request?.actionId || '').startsWith('block.mine') || request?.actionId === 'block.dig' || String(request?.actionId || '').startsWith('block.tree-');
    const input = worldAction ? { ...request, policy: this.resolveMiningPolicy(request.policy, request.presetId || request.preset) } : request;
    const interactions = this.capability('interactions');
    const result = interactions ? await interactions.executeTarget(input, origin) : await this.targets.execute(input, origin);
    this.logger.log(result.message);
    this.publishSnapshot();
    return { ok: true, ...result };
  }

  async miningAction(request = {}, origin = { type: 'agent' }) {
    const action = String(request.action || 'status');
    const mining = this.capability('mining');
    if (action === 'stop') return { ok: mining ? mining.stop() : this.activities.stop('regionmine') || this.activities.stop('consistentmine') };
    if (action === 'status') return { ok: true, status: mining?.status() || this.mining.status(), activities: this.activities.snapshot().filter((activity) => ['regionmine', 'consistentmine'].includes(activity.id)) };
    const bot = this.client.bot;
    if (!bot?.entity) throw new Error('An active connection is required.');
    const policy = this.resolveMiningPolicy(request.policy, request.presetId || request.preset);
    if (action === 'once' || action === 'consistent') {
      const position = request.position ? new Vec3(Math.trunc(request.position.x), Math.trunc(request.position.y), Math.trunc(request.position.z)) : null;
      const block = position ? bot.blockAt(position) : bot.blockAtCursor?.(32);
      if (!block || ['air', 'cave_air', 'void_air'].includes(block.name)) throw new Error('The mining target is no longer available.');
      if (action === 'once') {
        const result = mining ? await mining.mine(block, policy) : await this.mining.mineOnce(block, policy);
        this.publishSnapshot();
        return { ok: true, ...result };
      }
      const result = mining ? mining.consistent(block, Math.max(1, Math.min(16, Number(request.depth) || 1)), policy) : this.mining.startConsistent(block, Math.max(1, Math.min(16, Number(request.depth) || 1)), policy);
      return { ok: true, ...result };
    }
    if (action === 'region') {
      if (!request.from || !request.to) throw new Error('Region mining requires from and to positions.');
      return { ok: true, ...(mining ? mining.region(request.from, request.to, policy) : this.mining.startRegion(request.from, request.to, policy)) };
    }
    if (action === 'chunk') {
      const depth = Math.max(1, Math.min(16, Number(request.depth) || 1));
      const originPosition = bot.entity.position.floored();
      const x = Math.floor(originPosition.x / 16) * 16;
      const z = Math.floor(originPosition.z / 16) * 16;
      const from = { x, y: originPosition.y - depth + 1, z };
      const to = { x: x + 15, y: originPosition.y, z: z + 15 };
      return { ok: true, ...(mining ? mining.region(from, to, policy) : this.mining.startRegion(from, to, policy)) };
    }
    throw new Error('Unknown mining action.');
  }

  treeAction(request = {}) {
    const action = String(request.action || 'inspect').toLowerCase();
    const trees = this.capability('trees');
    if (action === 'status') return { ok: true, status: trees?.status() || this.trees.status() };
    if (action === 'stop') return { ok: trees ? trees.stop() : this.trees.stop(), status: trees?.status() || this.trees.status() };
    const policy = this.resolveMiningPolicy(request.policy, request.presetId || request.preset);
    const treePolicy = { ...policy, ...(request.policy || {}) };
    if (action === 'inspect') return { ok: true, ...(trees ? trees.inspect({ ...request, policy: treePolicy }) : this.trees.inspect({ ...request, policy: treePolicy })) };
    if (action === 'fell' || action === 'farm') {
      const status = trees ? trees[action]({ ...request, policy: treePolicy }) : this.trees.start({ ...request, mode: action, policy: treePolicy });
      return { ok: true, status };
    }
    throw new Error('Unknown tree action.');
  }

  stashAction(request = {}) {
    const action = String(request.action || 'nearby').toLowerCase();
    const inventory = this.capability('inventory');
    if (action === 'status') return { ok: true, status: inventory?.stashStatus() || this.stash.status() };
    if (action === 'stop') return { ok: inventory ? inventory.stopStash() : this.stash.stop(), status: inventory?.stashStatus() || this.stash.status() };
    const input = {
      mode: action,
      selector: request.selector,
      confirmed: request.confirmed,
      collectionRadius: request.collectionRadius,
      containerRadius: request.containerRadius
    };
    const status = inventory ? inventory.startStash(input) : this.stash.start(input);
    return { ok: true, status };
  }

  capabilities() {
    const runtime = this.client.bot?.mineprompt;
    if (!runtime) return { apiVersion: null, revision: 0, capabilities: [], actions: [], activities: this.activities.snapshot(), tasks: { active: [], recent: [] } };
    return runtime.snapshot();
  }

  capabilityAction(request = {}, origin = { type: 'agent' }) {
    const runtime = this.client.bot?.mineprompt;
    if (!runtime) throw new Error('An active connection with MinePrompt plugins is required.');
    const actionId = String(request.actionId || '').trim();
    if (!actionId) throw new Error('A capability action id is required.');
    const input = request.input && typeof request.input === 'object' && !Array.isArray(request.input) ? request.input : {};
    return runtime.actions.execute(actionId, input, { origin: origin || { type: 'agent' }, bot: this.client.bot, runtime });
  }

  resolveMiningPolicy(policy = {}, reference = null) {
    const data = this.store.snapshot();
    return resolveMiningPolicy(policy || {}, data.miningPresets || [], reference || data.activeMiningPresetId || null);
  }

  recipes(request = {}) {
    return this.capability('inventory')?.recipes(request) || this.crafting.list(request);
  }

  async craft(request = {}) {
    const result = await (this.capability('inventory')?.craft(request) || this.crafting.craft(request));
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

  capability(id) {
    return this.client.bot?.mineprompt?.get(id) || null;
  }

  commandDescriptors() {
    return this.commands.descriptors();
  }

  snapshot() {
    const extensions = this.client.bot?.mineprompt?.summary() || { apiVersion: null, revision: 0, capabilities: [], actionCount: 0, tasks: { active: [] } };
    return {
      id: this.id,
      engine: {
        id: this.engine.id,
        profile: this.engine.profile,
        name: this.engine.name,
        edition: this.engine.edition,
        revision: this.engine.revision
      },
      state: this.interface.snapshot(),
      activities: this.activities.snapshot(),
      session: { ...this.client.snapshot(), targets: this.targets.snapshot() },
      commands: this.commands.descriptors(),
      diagnostics: { inventory: this.inventoryPipeline.telemetry.snapshot(), snapshots: this.snapshotPublisher.snapshot() },
      extensions: {
        apiVersion: extensions.apiVersion,
        revision: extensions.revision,
        capabilities: extensions.capabilities,
        actionCount: extensions.actionCount,
        tasks: { active: extensions.tasks.active }
      },
      process: { isolated: false, pid: process.pid, status: 'running' }
    };
  }

  publish(channel, payload) {
    this.emit(channel, { ...payload, sessionId: this.id });
  }

  publishSnapshot() {
    this.snapshotPublisher.request();
  }

  updateStore() {}

  async close() {
    this.snapshotPublisher.close();
    this.inventoryPipeline.close();
    this.workflows.close();
    this.automation.close();
    await this.client.close();
  }
}

module.exports = { BotSession };
