'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const packageJson = require('../../package.json');
const { Store } = require('./store');
const { RuntimeLogger } = require('./logger');
const { BotSession } = require('./bot-session');
const { validateServer } = require('./connection-service');
const { RelationshipService } = require('./relationship-service');
const { RendererDiagnostics } = require('./renderer-diagnostics');
const { ToolCatalog } = require('./tool-catalog');
const { SnapshotPublisher } = require('./snapshot-publisher');
const { EngineManager } = require('./engine-manager');
const { parseCommandLine } = require('./command-line');

const REMOTE_CAPABILITIES = new Set(['status', 'chat', 'movement', 'inventory', 'combat', 'world']);

class ApplicationRuntime {
  constructor({ rootPath, userDataPath, emit, sessionFactory = null, originalConsole = console }) {
    this.rootPath = rootPath;
    this.userDataPath = userDataPath;
    this.emit = emit;
    this.sessionFactory = sessionFactory;
    this.logger = new RuntimeLogger(emit, originalConsole);
    this.store = new Store(path.join(userDataPath, 'mineprompt.json'), () => this.storeChanged());
    this.relationships = new RelationshipService(this.store);
    this.rendererDiagnostics = new RendererDiagnostics();
    this.engines = new EngineManager({ directory: path.join(userDataPath, 'engines'), logger: this.logger });
    this.toolCatalog = new ToolCatalog(this);
    this.sessions = new Map();
    this.selectedSessionId = null;
    this.snapshotPublisher = new SnapshotPublisher({
      capture: () => this.snapshot(),
      publish: (snapshot) => this.emit('snapshot', snapshot),
      onError: (error) => this.logger.error(`[Snapshot] ${error instanceof Error ? error.message : String(error)}`)
    });
  }

  async init() {
    await this.store.init();
    await this.engines.init();
    const session = this.createSession('primary');
    await session.ready;
    this.logger.log(`MinePrompt ${packageJson.version} is ready. Type "help" to see available commands.`);
    this.publishSnapshot();
    this.snapshotPublisher.flush();
    return this;
  }

  createSession(id = crypto.randomUUID(), engineProfileId = null) {
    const sessionId = String(id);
    const preferredEngine = engineProfileId || this.store.snapshot().settings.defaultEngineProfileId || 'stable';
    const engine = this.engines.resolve(preferredEngine, false) || this.engines.resolve('stable');
    const options = {
      id: sessionId,
      rootPath: this.rootPath,
      privateCommandsPath: path.join(this.userDataPath, 'commands'),
      store: this.store,
      logger: this.logger,
      emit: (channel, payload) => this.handleSessionEvent(sessionId, channel, payload),
      engine
    };
    const session = this.sessionFactory ? this.sessionFactory(options) : new BotSession({ ...options, logger: this.logger.child(sessionId) });
    this.sessions.set(sessionId, session);
    if (!this.selectedSessionId) this.selectedSessionId = sessionId;
    return session;
  }

  selectedSession(origin = {}) {
    return this.sessions.get(origin.sessionId || this.selectedSessionId) || this.sessions.values().next().value;
  }

  get interface() { return this.selectedSession()?.interface; }
  get activities() { return this.selectedSession()?.activities; }
  get client() { return this.selectedSession()?.client; }
  get connections() { return this.selectedSession()?.connections; }
  get inventory() { return this.selectedSession()?.inventory; }
  get commands() { return this.selectedSession()?.commands; }

  commandDescriptors() {
    const commands = this.selectedSession()?.commandDescriptors?.() || [];
    return [...commands, {
      command: 'engine',
      aliases: ['runtime'],
      category: 'application',
      capability: null,
      description: 'Research, install, verify, select, and remove isolated Mineflayer engine profiles.',
      usage: 'engine <list|catalog|research|plan|install|use|remove>',
      requiresConnection: false,
      toolName: 'command_engine',
      risk: 'dangerous',
      approval: 'required'
    }];
  }

  async sessionRequest(sessionId, method, ...args) {
    const session = this.sessions.get(sessionId || this.selectedSessionId);
    if (!session) throw new Error('The bot session no longer exists.');
    await session.ready;
    return session[method](...args);
  }

  execute(input, sessionId = this.selectedSessionId, origin = { type: 'terminal' }) {
    let parsed;
    try { parsed = parseCommandLine(input); } catch {}
    if (['engine', 'runtime'].includes(parsed?.name?.toLowerCase())) return this.executeEngineCommand(parsed.args, sessionId, origin);
    return this.sessionRequest(sessionId, 'execute', input, origin || { type: 'terminal' });
  }

  complete(input, sessionId = this.selectedSessionId) {
    if (/^\s*(?:engine|runtime)(?:\s|$)/iu.test(String(input || ''))) return Promise.resolve(this.completeEngineCommand(input));
    return this.sessionRequest(sessionId, 'complete', input);
  }

  async connect(options) {
    let session = this.selectedSession();
    let status = session?.snapshot().state.status;
    const requestedEngine = options?.engineProfileId ? this.engines.resolve(options.engineProfileId) : null;
    if (session && requestedEngine && session.snapshot().engine?.id !== requestedEngine.id) {
      if (['disconnected', 'failed'].includes(status)) {
        const id = session.id;
        await session.close();
        this.sessions.delete(id);
        session = this.createSession(id, requestedEngine.id);
      } else {
        session = this.createSession(crypto.randomUUID(), requestedEngine.id);
      }
      status = session.snapshot().state.status;
    }
    if (session && status === 'failed') {
      const failedId = session.id;
      await session.close();
      this.sessions.delete(failedId);
      session = this.createSession(failedId);
    } else if (!session || status !== 'disconnected') {
      session = this.createSession();
    }
    this.selectedSessionId = session.id;
    const { engineProfileId, ...connectionOptions } = options || {};
    const result = await this.sessionRequest(session.id, 'connect', connectionOptions);
    this.publishSnapshot();
    return result;
  }

  async disconnect(sessionId = this.selectedSessionId) {
    const result = await this.sessionRequest(sessionId, 'disconnect');
    this.publishSnapshot();
    return result;
  }

  selectSession(sessionId) {
    if (!this.sessions.has(sessionId)) throw new Error('The bot session no longer exists.');
    this.selectedSessionId = sessionId;
    this.publishSnapshot();
    return { ok: true };
  }

  async closeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('The bot session no longer exists.');
    await session.close();
    this.sessions.delete(sessionId);
    if (!this.sessions.size) {
      const replacement = this.createSession('primary');
      await replacement.ready;
    }
    if (!this.sessions.has(this.selectedSessionId)) this.selectedSessionId = this.sessions.keys().next().value;
    this.publishSnapshot();
    return { ok: true };
  }

  async reloadCommands(sessionId = this.selectedSessionId) {
    const result = await this.sessionRequest(sessionId, 'reloadCommands');
    this.publishSnapshot();
    return result;
  }

  engineList() {
    return { profiles: this.engines.list(), catalog: this.engines.catalog() };
  }

  engineResearch(request = {}) {
    return this.engines.research(request.owner || 'Pix3lPirat3').then((pulls) => ({ pulls }));
  }

  enginePlan(request = {}) {
    if (request.preset) return this.engines.planPreset(request.preset);
    return this.engines.planPackages({ name: request.name, pulls: request.pulls });
  }

  async engineInstall(request = {}) {
    const plan = await this.enginePlan(request);
    const existing = this.engines.list().find((profile) => profile.id === plan.id);
    if (existing) return { ok: true, profile: { ...existing, reused: true } };
    const active = [...this.sessions.values()].find((session) => session.snapshot().engine?.profile === plan.profile);
    if (active) throw new Error(`Session ${active.id} is using ${plan.profile}. Select another engine before updating it.`);
    const profile = await this.engines.install(plan, { acknowledgeUnsafe: request.acknowledgeUnsafe === true, timeout: request.timeout });
    this.publishSnapshot();
    return { ok: true, profile };
  }

  async engineUse(request = {}) {
    const profile = this.engines.resolve(request.profile);
    const sessionId = request.sessionId || this.selectedSessionId;
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('The bot session no longer exists.');
    if (session.snapshot().state.status !== 'disconnected') throw new Error('Disconnect the bot before changing its engine profile.');
    await session.close();
    this.sessions.delete(sessionId);
    const replacement = this.createSession(sessionId, profile.id);
    await replacement.ready;
    this.selectedSessionId = sessionId;
    if (request.makeDefault !== false) await this.store.setSetting('defaultEngineProfileId', profile.profile);
    this.publishSnapshot();
    return { ok: true, sessionId, engine: replacement.snapshot().engine };
  }

  async engineRemove(request = {}) {
    const profile = this.engines.resolve(request.profile);
    const active = [...this.sessions.values()].find((session) => session.snapshot().engine?.id === profile.id);
    if (active) throw new Error(`Engine profile ${profile.id} is in use by session ${active.id}.`);
    const result = await this.engines.remove(profile.id);
    if (this.store.snapshot().settings.defaultEngineProfileId === profile.profile) await this.store.setSetting('defaultEngineProfileId', 'stable');
    this.publishSnapshot();
    return result;
  }

  async executeEngineCommand(args = [], sessionId = this.selectedSessionId) {
    const action = String(args[0] || 'list').toLowerCase();
    try {
      let value;
      if (action === 'list' || action === 'catalog') value = this.engineList();
      else if (action === 'research') value = await this.engineResearch({ owner: args[1] || 'Pix3lPirat3' });
      else if (action === 'plan') value = ['bedrock', 'bedrock-experimental'].includes(String(args[1] || '').toLowerCase())
        ? await this.enginePlan({ preset: args[1] })
        : await this.enginePlan({ name: args[1], pulls: args.slice(2) });
      else if (action === 'install') {
        const confirmed = args.at(-1)?.toLowerCase() === 'confirm';
        const values = confirmed ? args.slice(1, -1) : args.slice(1);
        value = ['bedrock', 'bedrock-experimental'].includes(String(values[0] || '').toLowerCase())
          ? await this.engineInstall({ preset: values[0], acknowledgeUnsafe: confirmed })
          : await this.engineInstall({ name: values[0], pulls: values.slice(1), acknowledgeUnsafe: confirmed });
      } else if (action === 'use') value = await this.engineUse({ profile: args[1], sessionId });
      else if (action === 'remove') {
        if (args.at(-1)?.toLowerCase() !== 'confirm') throw new Error('Removing an engine profile requires confirm.');
        value = await this.engineRemove({ profile: args[1] });
      } else throw new Error('Usage: engine <list|catalog|research [owner]|plan <name|bedrock> [pulls...]|install <name|bedrock> [pulls...] confirm|use <profile>|remove <profile> confirm>.');
      this.logger.log(`[Engines] ${JSON.stringify(value, null, 2)}`);
      return { ok: true, value };
    } catch (error) {
      this.logger.error(`[Engines] ${error.message}`);
      return { ok: false, error: error.message };
    }
  }

  completeEngineCommand(input) {
    let parsed;
    try { parsed = parseCommandLine(input); } catch { return []; }
    if (parsed.args.length === 0 || parsed.args.length === 1 && !/\s$/u.test(String(input))) return ['list', 'catalog', 'research', 'plan', 'install', 'use', 'remove'];
    const action = parsed.args[0]?.toLowerCase();
    if (action === 'use' || action === 'remove') return this.engines.list().map((profile) => profile.id);
    if (action === 'plan' || action === 'install') return ['bedrock', 'bedrock-experimental'];
    return [];
  }

  async reload(request = {}) {
    const scope = String(request.scope || 'commands').toLowerCase();
    if (!['commands', 'renderer', 'all'].includes(scope)) throw new Error('Reload scope must be commands, renderer, or all.');
    if (scope === 'commands' || scope === 'all') await this.reloadCommands(request.sessionId);
    if (scope === 'renderer' || scope === 'all') this.emit('renderer-reload', { requestedAt: Date.now() });
    return { ok: true, scope };
  }

  inventoryAction(request) {
    if (!Number.isInteger(request?.connectionId) || !Object.hasOwn(request, 'windowId')) throw new Error('The inventory view is missing session details.');
    return this.sessionRequest(request.sessionId, 'inventoryAction', request);
  }

  inventoryInspect(request = {}) {
    return this.sessionRequest(request.sessionId, 'inventoryInspect', request);
  }

  debugEvaluate(request = {}) {
    return this.sessionRequest(request.sessionId, 'debugEvaluate', request);
  }

  playerAction(request, origin = { type: 'gui' }) {
    return this.sessionRequest(request?.sessionId, 'playerAction', request, origin || { type: 'gui' });
  }

  targetAction(request, origin = { type: 'gui' }) {
    return this.sessionRequest(request?.sessionId, 'targetAction', request, origin || { type: 'gui' });
  }

  miningAction(request, origin = { type: 'agent' }) {
    return this.sessionRequest(request?.sessionId, 'miningAction', request, origin || { type: 'agent' });
  }

  treeAction(request = {}) {
    return this.sessionRequest(request.sessionId, 'treeAction', request);
  }

  stashAction(request = {}) {
    return this.sessionRequest(request.sessionId, 'stashAction', request);
  }

  capabilities(request = {}) {
    return this.sessionRequest(request.sessionId, 'capabilities');
  }

  capabilityAction(request = {}, origin = { type: 'agent' }) {
    return this.sessionRequest(request.sessionId, 'capabilityAction', request, origin || { type: 'agent' });
  }

  recipes(request = {}) {
    return this.sessionRequest(request.sessionId, 'recipes', request);
  }

  craft(request = {}) {
    return this.sessionRequest(request.sessionId, 'craft', request);
  }

  async saveWorkflow(workflow) {
    const saved = await this.store.saveWorkflow(workflow);
    return { ok: true, workflow: saved };
  }

  async removeWorkflow(id) {
    const removed = await this.store.removeWorkflow(id);
    if (!removed) throw new Error('The workflow no longer exists.');
    return { ok: true };
  }

  async saveMiningPreset(input) {
    const preset = await this.store.saveMiningPreset(input);
    return { ok: true, preset };
  }

  async removeMiningPreset(id) {
    const removed = await this.store.removeMiningPreset(id);
    if (!removed) throw new Error('The mining policy no longer exists.');
    return { ok: true };
  }

  async selectMiningPreset(id) {
    const activeMiningPresetId = await this.store.selectMiningPreset(id ?? null);
    return { ok: true, activeMiningPresetId };
  }

  runWorkflow(request = {}) {
    const workflow = this.store.snapshot().workflows.find((entry) => entry.id === request.workflowId);
    if (!workflow) throw new Error('The workflow no longer exists.');
    return this.sessionRequest(request.sessionId, 'runWorkflow', workflow);
  }

  stopWorkflow(request = {}) {
    return this.sessionRequest(request.sessionId, 'stopWorkflow', request.workflowId);
  }

  preferences(snapshot = null) {
    const data = snapshot || this.store.snapshot();
    const settings = data.settings;
    return {
      resourcePackPolicy: settings.resourcePackPolicy === 'accept' ? 'accept' : 'deny',
      externalPlayerHeadsEnabled: settings.externalPlayerHeadsEnabled === true,
      remoteCommandsEnabled: settings.remoteCommandsEnabled === true,
      remoteCommandPlayers: Array.isArray(settings.remoteCommandPlayers) ? settings.remoteCommandPlayers : [],
      remoteCommandCapabilities: Array.isArray(settings.remoteCommandCapabilities)
        ? settings.remoteCommandCapabilities.filter((value) => REMOTE_CAPABILITIES.has(value))
        : [],
      automaticReconnectEnabled: settings.automaticReconnectEnabled === true,
      reconnectAttempts: Number.isInteger(settings.reconnectAttempts) ? settings.reconnectAttempts : 3,
      friendPlayers: this.relationships.friendNames(data)
    };
  }

  async saveProfile(profile) {
    const authentication = profile?.authentication;
    if (![true, false, 'microsoft', 'offline'].includes(authentication)) throw new Error('Select a valid authentication mode.');
    const saved = await this.store.saveAccount({
      originalUsername: profile?.originalUsername,
      username: profile?.username,
      authentication: authentication === true || authentication === 'microsoft'
    });
    return { ok: true, profile: saved };
  }

  async removeProfile(username) {
    const removed = await this.store.removeAccount(username);
    if (!removed) throw new Error('The profile no longer exists.');
    return { ok: true };
  }

  async saveServer(profile) {
    const server = validateServer(profile);
    const saved = await this.store.saveServer({ originalName: profile?.originalName, name: profile?.name, ...server });
    return { ok: true, server: saved };
  }

  async removeServer(name) {
    const removed = await this.store.removeServer(name);
    if (!removed) throw new Error('The server profile no longer exists.');
    return { ok: true };
  }

  async savePreferences(preferences) {
    const resourcePackPolicy = preferences?.resourcePackPolicy;
    if (!['accept', 'deny'].includes(resourcePackPolicy)) throw new Error('Invalid resource-pack policy.');
    const uniqueNames = (values) => (Array.isArray(values) ? values : []).map((name) => String(name).trim()).filter(Boolean).filter((name, index, names) =>
      names.findIndex((candidate) => candidate.toLowerCase() === name.toLowerCase()) === index);
    const remoteCommandPlayers = uniqueNames(preferences?.remoteCommandPlayers);
    const friendPlayers = uniqueNames(preferences?.friendPlayers);
    const validName = (name) => /^[A-Za-z0-9_]{1,16}$/u.test(name);
    if (remoteCommandPlayers.some((name) => !validName(name))) throw new Error('Remote player names may contain only letters, numbers, and underscores.');
    if (friendPlayers.some((name) => !validName(name))) throw new Error('Friend names may contain only letters, numbers, and underscores.');
    const capabilities = Array.isArray(preferences?.remoteCommandCapabilities) ? preferences.remoteCommandCapabilities : [];
    if (capabilities.some((value) => !REMOTE_CAPABILITIES.has(value))) throw new Error('A remote command permission is invalid.');
    const reconnectAttempts = Number(preferences?.reconnectAttempts ?? 3);
    if (!Number.isInteger(reconnectAttempts) || reconnectAttempts < 1 || reconnectAttempts > 10) throw new Error('Reconnect attempts must be an integer from 1 to 10.');
    await this.store.setSettings({
      resourcePackPolicy,
      externalPlayerHeadsEnabled: preferences.externalPlayerHeadsEnabled === true,
      remoteCommandsEnabled: preferences.remoteCommandsEnabled === true,
      remoteCommandPlayers,
      remoteCommandCapabilities: [...new Set(capabilities)],
      automaticReconnectEnabled: preferences.automaticReconnectEnabled === true,
      reconnectAttempts,
      relationships: [
        ...this.relationships.list().filter((relationship) => relationship.kind !== 'friend'),
        ...friendPlayers.map((username) => ({ kind: 'friend', username, uuid: null, server: null }))
      ]
    });
    return { ok: true, preferences: this.preferences() };
  }

  relationshipsList() {
    return this.relationships.list();
  }

  reportRendererIssue(issue) {
    return { ok: true, issue: this.rendererDiagnostics.record(issue) };
  }

  reportRendererState(state) {
    this.rendererDiagnostics.updateView(state);
    return { ok: true };
  }

  uiState(request = {}) {
    const snapshot = this.snapshot();
    const sessionId = request.sessionId || snapshot.selectedSessionId;
    const selected = snapshot.sessions.find((session) => session.id === sessionId);
    if (!selected) throw new Error('The bot session no longer exists.');
    return {
      application: { version: packageJson.version, platform: process.platform, architecture: process.arch },
      selectedSessionId: snapshot.selectedSessionId,
      session: selected,
      renderer: this.rendererDiagnostics.view(),
      rendererIssues: this.rendererDiagnostics.recent(request.maximumIssues)
    };
  }

  async relationshipAdd(input) {
    const relationship = await this.relationships.add(input);
    return { ok: true, relationship };
  }

  async relationshipRemove(input) {
    const removed = await this.relationships.remove(input?.kind, input?.username, input?.server);
    return { ok: true, removed };
  }

  tools() {
    return this.toolCatalog.list();
  }

  callTool(name, input, origin) {
    return this.toolCatalog.call(name, input, origin);
  }

  openAiTools() {
    return this.toolCatalog.openAiTools();
  }

  snapshot() {
    const sessions = [...this.sessions.values()].map((session) => session.snapshot());
    const selected = sessions.find((session) => session.id === this.selectedSessionId) || sessions[0];
    const data = this.store.snapshot();
    return {
      version: packageJson.version,
      selectedSessionId: this.selectedSessionId,
      sessions,
      state: selected.state,
      accounts: data.accounts,
      servers: data.servers,
      preferences: this.preferences(data),
      workflows: data.workflows,
      miningPresets: data.miningPresets,
      activeMiningPresetId: data.activeMiningPresetId,
      activities: selected.activities,
      session: selected.session,
      logs: this.logger.recent(),
      commands: this.commandDescriptors(),
      engines: this.engineList()
    };
  }

  diagnostics() {
    const data = this.store.snapshot();
    const sensitive = [
      ...data.accounts.map((account) => account.username),
      ...data.servers.flatMap((server) => [server.name, server.host, server.fakeHost])
    ].filter(Boolean).sort((left, right) => right.length - left.length);
    const redact = (message) => sensitive.reduce((value, secret) => value.replaceAll(secret, '[redacted]'), String(message));
    const redactValue = (value) => {
      if (typeof value === 'string') return redact(value);
      if (Array.isArray(value)) return value.map(redactValue);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redactValue(entry)]));
      return value;
    };
    const sessions = [...this.sessions.values()].map((session) => session.snapshot());
    const selected = sessions.find((session) => session.id === this.selectedSessionId) || sessions[0];
    return {
      application: { version: packageJson.version, platform: process.platform, architecture: process.arch },
      state: { status: selected.state.status, lastError: redact(selected.state.lastError || '') },
      sessions: sessions.map((snapshot) => {
        return {
          id: snapshot.id,
          engine: snapshot.engine,
          status: snapshot.state.status,
          process: snapshot.process,
          activities: snapshot.activities.map(({ id, label, startedAt }) => ({ id, label, startedAt })),
          inventoryPipeline: snapshot.diagnostics?.inventory || null,
          snapshotPipeline: snapshot.diagnostics?.snapshots || null
        };
      }),
      logs: this.logger.recent().filter((entry) => entry.level !== 'log').map((entry) => ({ ...entry, message: redact(entry.message) })),
      renderer: redactValue(this.rendererDiagnostics.view()),
      rendererIssues: redactValue(this.rendererDiagnostics.recent(100))
    };
  }

  handleSessionEvent(sessionId, channel, payload) {
    if (channel === 'session-snapshot') {
      this.publishSnapshot();
      return;
    }
    this.emit(channel, { ...payload, sessionId });
  }

  storeChanged() {
    const snapshot = this.store.snapshot();
    for (const session of this.sessions.values()) session.updateStore(snapshot);
    this.publishSnapshot();
  }

  publishSnapshot() {
    if (this.selectedSession()) this.snapshotPublisher.request();
  }

  async close() {
    this.snapshotPublisher.close();
    await Promise.all([...this.sessions.values()].map((session) => session.close()));
    await this.store.close();
  }
}

module.exports = { ApplicationRuntime };
