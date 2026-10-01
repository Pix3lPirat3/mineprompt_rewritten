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
    this.toolCatalog = new ToolCatalog(this);
    this.sessions = new Map();
    this.selectedSessionId = null;
  }

  async init() {
    await this.store.init();
    const session = this.createSession('primary');
    await session.ready;
    this.logger.log(`MinePrompt ${packageJson.version} is ready. Type "help" to see available commands.`);
    this.publishSnapshot();
    return this;
  }

  createSession(id = crypto.randomUUID()) {
    const sessionId = String(id);
    const options = {
      id: sessionId,
      rootPath: this.rootPath,
      privateCommandsPath: path.join(this.userDataPath, 'commands'),
      store: this.store,
      logger: this.logger,
      emit: (channel, payload) => this.handleSessionEvent(sessionId, channel, payload)
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

  async sessionRequest(sessionId, method, ...args) {
    const session = this.sessions.get(sessionId || this.selectedSessionId);
    if (!session) throw new Error('The bot session no longer exists.');
    await session.ready;
    return session[method](...args);
  }

  execute(input, sessionId = this.selectedSessionId, origin = { type: 'terminal' }) {
    return this.sessionRequest(sessionId, 'execute', input, origin || { type: 'terminal' });
  }

  complete(input, sessionId = this.selectedSessionId) {
    return this.sessionRequest(sessionId, 'complete', input);
  }

  async connect(options) {
    let session = this.selectedSession();
    const status = session?.snapshot().state.status;
    if (session && status === 'failed') {
      const failedId = session.id;
      await session.close();
      this.sessions.delete(failedId);
      session = this.createSession(failedId);
    } else if (!session || status !== 'disconnected') {
      session = this.createSession();
    }
    this.selectedSessionId = session.id;
    const result = await this.sessionRequest(session.id, 'connect', options);
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

  stashAction(request = {}) {
    return this.sessionRequest(request.sessionId, 'stashAction', request);
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

  preferences() {
    const settings = this.store.snapshot().settings;
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
      friendPlayers: this.relationships.friendNames()
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
    const selected = this.selectedSession()?.snapshot();
    const sessions = [...this.sessions.values()].map((session) => session.snapshot());
    const data = this.store.snapshot();
    return {
      version: packageJson.version,
      selectedSessionId: this.selectedSessionId,
      sessions,
      state: selected.state,
      accounts: data.accounts,
      servers: data.servers,
      preferences: this.preferences(),
      workflows: data.workflows,
      miningPresets: data.miningPresets,
      activeMiningPresetId: data.activeMiningPresetId,
      activities: selected.activities,
      session: selected.session,
      logs: this.logger.recent(),
      commands: selected.commands
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
    const selected = this.selectedSession()?.snapshot();
    return {
      application: { version: packageJson.version, platform: process.platform, architecture: process.arch },
      state: { status: selected.state.status, lastError: redact(selected.state.lastError || '') },
      sessions: [...this.sessions.values()].map((session) => {
        const snapshot = session.snapshot();
        return {
          id: snapshot.id,
          status: snapshot.state.status,
          process: snapshot.process,
          activities: snapshot.activities.map(({ id, label, startedAt }) => ({ id, label, startedAt })),
          inventoryPipeline: snapshot.diagnostics?.inventory || null
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
    if (this.selectedSession()) this.emit('snapshot', this.snapshot());
  }

  async close() {
    await Promise.all([...this.sessions.values()].map((session) => session.close()));
    await this.store.close();
  }
}

module.exports = { ApplicationRuntime };
