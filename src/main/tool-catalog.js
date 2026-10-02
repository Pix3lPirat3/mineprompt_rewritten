'use strict';

const { Type } = require('@sinclair/typebox');
const { compileSchema, strictOpenAiSchema } = require('./schema');
const { quoteArgument } = require('./command-line');
const { TARGET_ACTION_IDS } = require('./target-actions');

const SessionId = Type.Optional(Type.String({ minLength: 1, maxLength: 128, description: 'Bot session id. Uses the selected session when omitted.' }));
const EmptyInput = Type.Object({}, { additionalProperties: false });
const Position = Type.Object({ x: Type.Number(), y: Type.Number(), z: Type.Number() }, { additionalProperties: false });
const MiningPolicy = Type.Object({
  tool: Type.Optional(Type.Union(['auto', 'held', 'hand'].map((value) => Type.Literal(value)))),
  lowDurability: Type.Optional(Type.Union(['switch', 'stop', 'skip'].map((value) => Type.Literal(value)))),
  minimumDurability: Type.Optional(Type.Integer({ minimum: 0, maximum: 65535 })),
  allowFluidAdjacent: Type.Optional(Type.Boolean()),
  allowFalling: Type.Optional(Type.Boolean()),
  include: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 128 }), { maxItems: 128 })),
  exclude: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 128 }), { maxItems: 128 })),
  reach: Type.Optional(Type.Number({ minimum: 3, maximum: 5.5 })),
  maxBlocks: Type.Optional(Type.Integer({ minimum: 1, maximum: 16384 }))
}, { additionalProperties: false });
const TreePolicy = Type.Object({
  tool: Type.Optional(Type.Union(['auto', 'held', 'hand'].map((value) => Type.Literal(value)))),
  lowDurability: Type.Optional(Type.Union(['switch', 'stop', 'skip'].map((value) => Type.Literal(value)))),
  minimumDurability: Type.Optional(Type.Integer({ minimum: 0, maximum: 65535 })),
  allowFluidAdjacent: Type.Optional(Type.Boolean()),
  allowFalling: Type.Optional(Type.Boolean()),
  include: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 128 }), { maxItems: 128 })),
  exclude: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 128 }), { maxItems: 128 })),
  reach: Type.Optional(Type.Number({ minimum: 3, maximum: 5.5 })),
  maxBlocks: Type.Optional(Type.Integer({ minimum: 1, maximum: 4096 })),
  leafSupport: Type.Optional(Type.Union(['never', 'safe', 'always'].map((value) => Type.Literal(value)))),
  logSupport: Type.Optional(Type.Union(['never', 'stump'].map((value) => Type.Literal(value)))),
  radius: Type.Optional(Type.Integer({ minimum: 1, maximum: 64 })),
  maxTrees: Type.Optional(Type.Integer({ minimum: 1, maximum: 128 })),
  collectDrops: Type.Optional(Type.Boolean()),
  collectionRadius: Type.Optional(Type.Integer({ minimum: 1, maximum: 32 })),
  replant: Type.Optional(Type.Union(['never', 'available', 'required'].map((value) => Type.Literal(value)))),
  onFailure: Type.Optional(Type.Union(['stop', 'skip'].map((value) => Type.Literal(value)))),
  requireNatural: Type.Optional(Type.Boolean())
}, { additionalProperties: false });

function tool(name, description, inputSchema, execute, options = {}) {
  return Object.freeze({
    name,
    title: options.title || name.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join(' '),
    description,
    inputSchema,
    outputSchema: options.outputSchema || null,
    annotations: {
      readOnlyHint: options.readOnly === true,
      destructiveHint: options.destructive === true,
      idempotentHint: options.idempotent === true,
      openWorldHint: options.openWorld === true
    },
    capability: options.capability || null,
    approval: options.approval || 'none',
    validate: compileSchema(inputSchema),
    execute
  });
}

function session(runtime, sessionId) {
  const direct = runtime.selectedSession?.({ sessionId });
  if (direct) return direct.snapshot();
  const snapshot = runtime.snapshot();
  const id = sessionId || snapshot.selectedSessionId;
  const selected = snapshot.sessions.find((entry) => entry.id === id);
  if (!selected) throw new Error('The bot session no longer exists.');
  return selected;
}

function commandTool(command) {
  const schema = Type.Object({
    sessionId: SessionId,
    arguments: Type.Optional(Type.Array(Type.String({ maxLength: 4096 }), { maxItems: 128, description: 'Command arguments in terminal order.' }))
  }, { additionalProperties: false });
  const risky = command.risk === 'dangerous';
  return tool(
    `command_${command.command.replaceAll('-', '_')}`,
    `${command.description || `Run the ${command.command} command`} Usage: ${command.usage || command.command}`,
    schema,
    async (runtime, input, origin) => {
      const argumentsList = Array.isArray(input.arguments) ? input.arguments : [];
      const commandLine = [command.command, ...argumentsList.map(quoteArgument)].join(' ');
      return runtime.execute(commandLine, input.sessionId, origin);
    },
    { capability: command.capability, destructive: risky, approval: command.approval, openWorld: command.requiresConnection }
  );
}

class ToolCatalog {
  constructor(runtime) {
    this.runtime = runtime;
    this.fixed = new Map();
    this.registerBuiltIns();
  }

  register(definition) {
    if (this.fixed.has(definition.name)) throw new Error(`Tool ${definition.name} is already registered.`);
    this.fixed.set(definition.name, definition);
    return () => this.fixed.delete(definition.name);
  }

  registerBuiltIns() {
    this.register(tool('mineprompt_status', 'Read bot sessions, connection state, players, inventory, containers, activities, and command availability.', Type.Object({ sessionId: SessionId }, { additionalProperties: false }),
      async (runtime, input) => session(runtime, input.sessionId), { readOnly: true }));
    this.register(tool('mineprompt_ui_state', 'Read the selected GUI session exactly as the application sees it, including inventory slots, open container layout, HUD state, players, targets, activities, process state, and recent renderer issues.', Type.Object({
      sessionId: SessionId,
      maximumIssues: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 }))
    }, { additionalProperties: false }), async (runtime, input) => runtime.uiState(input), { readOnly: true, capability: 'debug' }));
    this.register(tool('mineprompt_diagnostics', 'Read bounded application, subprocess, runtime log, and renderer incident diagnostics with saved account and server identifiers redacted.', EmptyInput,
      async (runtime) => runtime.diagnostics(), { readOnly: true, capability: 'debug' }));
    this.register(tool('mineprompt_connect', 'Connect a new bot session using the selected Java or Bedrock engine profile.', Type.Object({
      username: Type.String({ minLength: 1, maxLength: 254 }),
      auth: Type.Union([Type.Literal('microsoft'), Type.Literal('offline')]),
      host: Type.String({ minLength: 1, maxLength: 253 }),
      port: Type.Optional(Type.Integer({ minimum: 1, maximum: 65535 })),
      version: Type.Optional(Type.String({ maxLength: 32 })),
      fakeHost: Type.Optional(Type.String({ maxLength: 253 })),
      engineProfileId: Type.Optional(Type.String({ minLength: 1, maxLength: 80 }))
    }, { additionalProperties: false }), async (runtime, input) => runtime.connect(Object.fromEntries(Object.entries(input).filter(([, value]) => value !== null))), { openWorld: true }));
    this.register(tool('mineprompt_disconnect', 'Disconnect a bot session.', Type.Object({ sessionId: SessionId }, { additionalProperties: false }),
      async (runtime, input) => runtime.disconnect(input.sessionId), { destructive: true, idempotent: true }));
    this.register(tool('mineprompt_select_session', 'Select the bot session used when another tool omits a session id.', Type.Object({ sessionId: Type.String({ minLength: 1, maxLength: 128 }) }, { additionalProperties: false }),
      async (runtime, input) => runtime.selectSession(input.sessionId), { idempotent: true }));
    this.register(tool('mineprompt_reload', 'Reload command modules, the graphical renderer, or both without closing the application or disconnecting bot sessions. Backend service module changes still require a process restart.', Type.Object({
      sessionId: SessionId,
      scope: Type.Union([Type.Literal('commands'), Type.Literal('renderer'), Type.Literal('all')])
    }, { additionalProperties: false }), async (runtime, input) => runtime.reload(input), { idempotent: true, capability: 'debug' }));
    this.register(tool('mineprompt_engines', 'List isolated Mineflayer engine profiles, research public PrismarineJS pull requests, or prepare a deterministic installation plan.', Type.Object({
      action: Type.Union(['list', 'research', 'plan'].map((value) => Type.Literal(value))),
      owner: Type.Optional(Type.String({ minLength: 1, maxLength: 39 })),
      name: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
      preset: Type.Optional(Type.Union([Type.Literal('bedrock'), Type.Literal('bedrock-experimental')])),
      pulls: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 256 }), { minItems: 1, maxItems: 32 }))
    }, { additionalProperties: false }), async (runtime, input) => {
      if (input.action === 'list') return runtime.engineList();
      if (input.action === 'research') return runtime.engineResearch(input);
      return runtime.enginePlan(input);
    }, { readOnly: true, capability: 'engines.read', openWorld: true }));
    this.register(tool('mineprompt_engine_manage', 'Install, select, or remove an isolated Mineflayer engine profile. Installation may run third-party package code and requires explicit acknowledgement.', Type.Object({
      action: Type.Union(['install', 'use', 'remove'].map((value) => Type.Literal(value))),
      name: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
      preset: Type.Optional(Type.Union([Type.Literal('bedrock'), Type.Literal('bedrock-experimental')])),
      pulls: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 256 }), { minItems: 1, maxItems: 32 })),
      profile: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
      sessionId: SessionId,
      makeDefault: Type.Optional(Type.Boolean()),
      acknowledgeUnsafe: Type.Optional(Type.Boolean()),
      timeout: Type.Optional(Type.Integer({ minimum: 30000, maximum: 3600000 }))
    }, { additionalProperties: false }), async (runtime, input) => {
      if (input.action === 'install') return runtime.engineInstall(input);
      if (input.action === 'use') return runtime.engineUse(input);
      return runtime.engineRemove(input);
    }, { destructive: true, capability: 'engines.manage', approval: 'required', openWorld: true }));
    this.register(tool('mineprompt_capabilities', 'List installed Mineflayer capability plugins and their live structured action manifests for a bot session.', Type.Object({ sessionId: SessionId }, { additionalProperties: false }),
      async (runtime, input) => runtime.capabilities(input), { readOnly: true, capability: 'status', openWorld: true }));
    this.register(tool('mineprompt_capability_action', 'Execute an installed capability action. Inspect mineprompt_capabilities first, then provide an action id and a JSON object matching its input schema.', Type.Object({
      sessionId: SessionId,
      actionId: Type.String({ minLength: 1, maxLength: 128 }),
      inputJson: Type.Optional(Type.String({ maxLength: 65536 }))
    }, { additionalProperties: false }), async (runtime, input, origin) => {
      let details = {};
      if (input.inputJson) {
        try { details = JSON.parse(input.inputJson); } catch { throw new Error('Capability action input must be a valid JSON object.'); }
        if (!details || typeof details !== 'object' || Array.isArray(details)) throw new Error('Capability action input must be a JSON object.');
      }
      return runtime.capabilityAction({ sessionId: input.sessionId, actionId: input.actionId, input: details }, origin);
    }, { destructive: true, capability: 'plugins.execute', approval: 'required', openWorld: true }));
    this.register(tool('mineprompt_player_action', 'Inspect or interact with an online player through relationship-aware safety policies.', Type.Object({
      sessionId: SessionId,
      username: Type.String({ minLength: 1, maxLength: 16 }),
      action: Type.Union(['inspect', 'follow', 'goto', 'look', 'message', 'attack'].map((value) => Type.Literal(value))),
      message: Type.Optional(Type.String({ maxLength: 240 })),
      range: Type.Optional(Type.Number({ minimum: 1, maximum: 16 })),
      overrideFriendProtection: Type.Optional(Type.Boolean({ description: 'Request an explicit friend protection override.' })),
      confirmOverride: Type.Optional(Type.Boolean({ description: 'Set true only after the user approves a friend protection override.' }))
    }, { additionalProperties: false }), async (runtime, input, origin) => runtime.playerAction({
      sessionId: input.sessionId,
      username: input.username,
      actionId: `player.${input.action}`,
      message: input.message,
      range: input.range,
      overrideFriendProtection: input.overrideFriendProtection,
      confirmOverride: input.confirmOverride
    }, origin), { destructive: true, capability: 'players.control', approval: 'recommended', openWorld: true }));
    this.register(tool('mineprompt_target_action', 'Run the same target action exposed by the GUI and terminal. Entity activate calls bot.activateEntity, entity useitem calls bot.useOn with the held item, entity attack calls bot.attack, and block activate calls bot.activateBlock.', Type.Object({
      sessionId: SessionId,
      actionId: Type.Union(TARGET_ACTION_IDS.map((value) => Type.Literal(value))),
      target: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
      entityId: Type.Optional(Type.Integer({ minimum: 0 })),
      position: Type.Optional(Position),
      range: Type.Optional(Type.Number({ minimum: 1, maximum: 16 })),
      depth: Type.Optional(Type.Integer({ minimum: 1, maximum: 16 })),
      preset: Type.Optional(Type.String({ minLength: 1, maxLength: 48 })),
      policy: Type.Optional(MiningPolicy),
      overrideFriendProtection: Type.Optional(Type.Boolean()),
      confirmOverride: Type.Optional(Type.Boolean())
    }, { additionalProperties: false }), async (runtime, input, origin) => runtime.targetAction(input, origin), {
      destructive: true, capability: 'world', approval: 'recommended', openWorld: true
    }));
    this.register(tool('mineprompt_mining', 'Run policy-driven single, consistent, cuboid, or current-chunk mining with durability, tool switching, reach, and hazard controls.', Type.Object({
      sessionId: SessionId,
      action: Type.Union(['once', 'consistent', 'region', 'chunk', 'stop', 'status'].map((value) => Type.Literal(value))),
      position: Type.Optional(Position),
      from: Type.Optional(Position),
      to: Type.Optional(Position),
      depth: Type.Optional(Type.Integer({ minimum: 1, maximum: 16 })),
      preset: Type.Optional(Type.String({ minLength: 1, maxLength: 48 })),
      policy: Type.Optional(MiningPolicy)
    }, { additionalProperties: false }), async (runtime, input, origin) => runtime.miningAction(input, origin), {
      destructive: true, capability: 'world', approval: 'recommended', openWorld: true
    }));
    this.register(tool('mineprompt_tree', 'Inspect, fell, or farm trees with topology detection, support-aware route planning, durability controls, drop collection, optional replanting, and continuous replanning.', Type.Object({
      sessionId: SessionId,
      action: Type.Union(['inspect', 'fell', 'farm', 'stop', 'status'].map((value) => Type.Literal(value))),
      target: Type.Optional(Type.Union([Type.Literal('cursor'), Type.Literal('nearest'), Type.Literal('position')])),
      position: Type.Optional(Position),
      preset: Type.Optional(Type.String({ minLength: 1, maxLength: 48 })),
      policy: Type.Optional(TreePolicy)
    }, { additionalProperties: false }), async (runtime, input) => runtime.treeAction(input), {
      destructive: true, capability: 'world', approval: 'recommended', openWorld: true
    }));
    this.register(tool('mineprompt_stash', 'Collect nearby dropped items, deposit only the collected inventory increase into the nearest chest, barrel, or shulker box, then restore the saved position and view. Can also deposit an explicitly selected inventory item.', Type.Object({
      sessionId: SessionId,
      action: Type.Union(['nearby', 'inventory', 'status', 'stop'].map((value) => Type.Literal(value))),
      selector: Type.Optional(Type.Union([Type.String({ minLength: 1, maxLength: 128 }), Type.Integer({ minimum: 0 })])),
      confirmed: Type.Optional(Type.Boolean({ description: 'Required when selector is all.' })),
      collectionRadius: Type.Optional(Type.Integer({ minimum: 1, maximum: 64 })),
      containerRadius: Type.Optional(Type.Integer({ minimum: 1, maximum: 64 }))
    }, { additionalProperties: false }), async (runtime, input) => runtime.stashAction(input), {
      destructive: true, capability: 'inventory', approval: 'recommended', openWorld: true
    }));
      this.register(tool('mineprompt_storage', 'Register and categorize bounded storage zones, scan loaded containers, query exact variants, and safely plan or perform reserved fetches and deposits.', Type.Object({
        sessionId: SessionId,
        action: Type.Union(['zones', 'save', 'remove', 'scan', 'inspect', 'find', 'categories', 'category-save', 'category-remove', 'plan', 'fetch', 'plan-deposit', 'deposit', 'status', 'stop'].map((value) => Type.Literal(value))),
      zone: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
      name: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
      from: Type.Optional(Position),
      to: Type.Optional(Position),
        item: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
        slot: Type.Optional(Type.Integer({ minimum: 9, maximum: 44 })),
        minimum: Type.Optional(Type.Integer({ minimum: 0, maximum: 2147483647 })),
        count: Type.Optional(Type.Integer({ minimum: 1, maximum: 2147483647 })),
        category: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
        items: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 128 }), { maxItems: 256 })),
        containers: Type.Optional(Type.Array(Position, { maxItems: 512 })),
        overflow: Type.Optional(Type.Boolean()),
        all: Type.Optional(Type.Boolean())
    }, { additionalProperties: false }), async (runtime, input) => runtime.storageAction(input), {
      destructive: true, capability: 'world', approval: 'recommended', openWorld: true
    }));
    this.register(tool('mineprompt_blueprints', 'List and inspect imported version-declared blueprints, read their material bills, or compare a transformed blueprint with the loaded world. Import and removal remain local application operations.', Type.Object({
      sessionId: SessionId,
      action: Type.Union(['list', 'inspect', 'materials', 'preview', 'conflicts', 'requirements'].map((value) => Type.Literal(value))),
      blueprint: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
      anchor: Type.Optional(Position),
      rotation: Type.Optional(Type.Union([0, 90, 180, 270].map((value) => Type.Literal(value)))),
      mirror: Type.Optional(Type.Union(['none', 'x', 'z'].map((value) => Type.Literal(value)))),
      policy: Type.Optional(Type.Object({
        terrain: Type.Optional(Type.Union(['preserve', 'replace', 'flatten'].map((value) => Type.Literal(value)))),
        conflicts: Type.Optional(Type.Union(['stop', 'skip', 'replace'].map((value) => Type.Literal(value)))),
        air: Type.Optional(Type.Union([Type.Literal('ignore'), Type.Literal('clear')])),
        maximumReplacements: Type.Optional(Type.Integer({ minimum: 0, maximum: 1048576 })),
        maximumRange: Type.Optional(Type.Integer({ minimum: 1, maximum: 4096 }))
      }, { additionalProperties: false }))
    }, { additionalProperties: false }), async (runtime, input) => runtime.blueprintAction(input), {
      readOnly: true, capability: 'world', openWorld: true
    }));
    this.register(tool('mineprompt_inventory_action', 'Run the same validated inventory or open-container action exposed by the GUI and terminal. Use equips the selected item and calls bot.activateItem. Swing optionally equips an item and calls bot.swingArm with the requested arm. Transfer moves one, half, or a full stack between the player inventory and open container.', Type.Object({
      sessionId: Type.String({ minLength: 1, maxLength: 128 }),
      connectionId: Type.Integer({ minimum: 0 }),
      windowId: Type.Union([Type.Integer(), Type.Null()]),
      expectedRevision: Type.Optional(Type.Integer({ minimum: 0 })),
      scope: Type.Union([Type.Literal('inventory'), Type.Literal('container')]),
      action: Type.Union(['inspect', 'equip', 'select', 'use', 'swing', 'drop', 'take', 'deposit', 'transfer', 'click', 'move', 'trade', 'workstation', 'close'].map((value) => Type.Literal(value))),
      target: Type.Optional(Type.Union([Type.String({ maxLength: 128 }), Type.Integer({ minimum: 0 })])),
      destination: Type.Optional(Type.Union(['hand', 'head', 'torso', 'legs', 'feet', 'off-hand'].map((value) => Type.Literal(value)))),
      hand: Type.Optional(Type.Union([Type.Literal('mainhand'), Type.Literal('offhand')])),
      arm: Type.Optional(Type.Union([Type.Literal('left'), Type.Literal('right')])),
      showHand: Type.Optional(Type.Boolean()),
      quantity: Type.Optional(Type.Union(['one', 'half', 'stack', 'all'].map((value) => Type.Literal(value)))),
      confirmed: Type.Optional(Type.Boolean()),
      sourceScope: Type.Optional(Type.Union([Type.Literal('inventory'), Type.Literal('container')])),
      fromScope: Type.Optional(Type.Union([Type.Literal('inventory'), Type.Literal('container')])),
      toScope: Type.Optional(Type.Union([Type.Literal('inventory'), Type.Literal('container')])),
      fromSlot: Type.Optional(Type.Integer({ minimum: 0 })),
      toSlot: Type.Optional(Type.Integer({ minimum: 0 })),
      count: Type.Optional(Type.Integer({ minimum: 1, maximum: 2304 })),
      button: Type.Optional(Type.Union([Type.Literal('left'), Type.Literal('right')])),
      tradeIndex: Type.Optional(Type.Integer({ minimum: 0 })),
      operation: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
      choice: Type.Optional(Type.Integer({ minimum: 0 })),
      first: Type.Optional(Type.String({ maxLength: 128 })),
      second: Type.Optional(Type.String({ maxLength: 128 })),
      name: Type.Optional(Type.String({ maxLength: 50 }))
    }, { additionalProperties: false }), async (runtime, input) => runtime.inventoryAction(Object.fromEntries(Object.entries(input).filter(([key, value]) => key === 'windowId' || value !== null))), {
      destructive: true, capability: 'inventory', approval: 'recommended', openWorld: true
    }));
    this.register(tool('mineprompt_inventory_inspect', 'Read one live inventory or container item with its rendered name, lore, enchantments, durability, tooltip policy, components, and NBT data. The target can be a slot such as 36 or an item name.', Type.Object({
      sessionId: SessionId,
      scope: Type.Optional(Type.Union([Type.Literal('inventory'), Type.Literal('container')])),
      target: Type.Union([Type.String({ minLength: 1, maxLength: 128 }), Type.Integer({ minimum: 0 })])
    }, { additionalProperties: false }), async (runtime, input) => runtime.inventoryInspect(input), {
      readOnly: true, capability: 'inventory', openWorld: true
    }));
    this.register(tool('mineprompt_debug_evaluate', 'Run intentionally unsafe JavaScript inside the selected live bot process. Useful expressions include bot.inventory.slots[36], bot.inventory, and bot.currentWindow. Exposes bot, session, client, inventory, mining, targets, activities, automation, relationships, commands, store, require, process, Buffer, and console.', Type.Object({
      sessionId: SessionId,
      code: Type.String({ minLength: 1, maxLength: 16384 }),
      acknowledgeUnsafe: Type.Literal(true, { description: 'Confirm that this code is trusted and may inspect or mutate the live process.' }),
      timeout: Type.Optional(Type.Integer({ minimum: 100, maximum: 30000 })),
      depth: Type.Optional(Type.Integer({ minimum: 1, maximum: 12 })),
      entries: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 }))
    }, { additionalProperties: false }), async (runtime, input) => runtime.debugEvaluate(input), {
      destructive: true, capability: 'debug', approval: 'required', openWorld: true
    }));
    this.register(tool('mineprompt_relationships_list', 'List protected and trusted player relationships.', EmptyInput,
      async (runtime) => runtime.relationshipsList(), { readOnly: true, capability: 'relationships.read' }));
    this.register(tool('mineprompt_relationship_add', 'Add a player relationship.', Type.Object({
      kind: Type.Union([Type.Literal('friend'), Type.Literal('blocked'), Type.Literal('trusted')]),
      username: Type.String({ minLength: 1, maxLength: 16 }),
      uuid: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
      server: Type.Optional(Type.String({ minLength: 1, maxLength: 253 }))
    }, { additionalProperties: false }), async (runtime, input) => runtime.relationshipAdd(input), { destructive: true, capability: 'relationships.write', approval: 'required' }));
    this.register(tool('mineprompt_relationship_remove', 'Remove an exact player relationship.', Type.Object({
      kind: Type.Union([Type.Literal('friend'), Type.Literal('blocked'), Type.Literal('trusted')]),
      username: Type.String({ minLength: 1, maxLength: 16 }),
      server: Type.Optional(Type.String({ minLength: 1, maxLength: 253 }))
    }, { additionalProperties: false }), async (runtime, input) => runtime.relationshipRemove(input), { destructive: true, idempotent: true, capability: 'relationships.write', approval: 'required' }));
  }

  list() {
    const commands = this.runtime.commandDescriptors?.() || this.runtime.snapshot().commands || [];
    const dynamic = commands.filter((command) => command.agentVisible !== false).map(commandTool);
    return [...this.fixed.values(), ...dynamic].map(({ validate, execute, ...definition }) => definition);
  }

  resolve(name) {
    if (this.fixed.has(name)) return this.fixed.get(name);
    const commands = this.runtime.commandDescriptors?.() || this.runtime.snapshot().commands || [];
    const command = commands.find((entry) => entry.agentVisible !== false && `command_${entry.command.replaceAll('-', '_')}` === name);
    return command ? commandTool(command) : null;
  }

  async call(name, input = {}, origin = { type: 'agent', capabilities: [] }) {
    const definition = this.resolve(name);
    if (!definition) throw new Error(`Unknown tool: ${name}.`);
    definition.validate(input);
    return definition.execute(this.runtime, input, origin);
  }

  openAiTools() {
    return this.list().map((definition) => ({
      type: 'function',
      name: definition.name,
      description: definition.description,
      parameters: strictOpenAiSchema(definition.inputSchema),
      strict: true
    }));
  }
}

module.exports = { ToolCatalog, commandTool, session, tool };
