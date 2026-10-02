'use strict';

const { parseCommandLine } = require('./command-line');

const COMMAND = Object.freeze({
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
});

const ACTIONS = Object.freeze(['list', 'catalog', 'research', 'plan', 'install', 'use', 'remove']);
const PRESETS = Object.freeze(['bedrock', 'bedrock-experimental']);

class EngineController {
  constructor({ manager, store, sessions, selectedSessionId, selectSession, createSession, publishSnapshot, logger }) {
    this.manager = manager;
    this.store = store;
    this.sessions = sessions;
    this.selectedSessionId = selectedSessionId;
    this.selectSession = selectSession;
    this.createSession = createSession;
    this.publishSnapshot = publishSnapshot;
    this.logger = logger;
  }

  descriptor() {
    return { ...COMMAND, aliases: [...COMMAND.aliases] };
  }

  list() {
    return { profiles: this.manager.list(), catalog: this.manager.catalog() };
  }

  research(request = {}) {
    return this.manager.research(request.owner || 'Pix3lPirat3').then((pulls) => ({ pulls }));
  }

  plan(request = {}) {
    if (request.preset) return this.manager.planPreset(request.preset);
    return this.manager.planPackages({ name: request.name, pulls: request.pulls });
  }

  async install(request = {}) {
    const plan = await this.plan(request);
    const existing = this.manager.list().find((profile) => profile.id === plan.id);
    if (existing) return { ok: true, profile: { ...existing, reused: true } };
    const active = [...this.sessions.values()].find((session) => session.snapshot().engine?.profile === plan.profile);
    if (active) throw new Error(`Session ${active.id} is using ${plan.profile}. Select another engine before updating it.`);
    const profile = await this.manager.install(plan, { acknowledgeUnsafe: request.acknowledgeUnsafe === true, timeout: request.timeout });
    this.publishSnapshot();
    return { ok: true, profile };
  }

  async use(request = {}) {
    const profile = this.manager.resolve(request.profile);
    const sessionId = request.sessionId || this.selectedSessionId();
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('The bot session no longer exists.');
    if (session.snapshot().state.status !== 'disconnected') throw new Error('Disconnect the bot before changing its engine profile.');
    await session.close();
    this.sessions.delete(sessionId);
    const replacement = this.createSession(sessionId, profile.id);
    await replacement.ready;
    this.selectSession(sessionId);
    if (request.makeDefault !== false) await this.store.setSetting('defaultEngineProfileId', profile.profile);
    this.publishSnapshot();
    return { ok: true, sessionId, engine: replacement.snapshot().engine };
  }

  async remove(request = {}) {
    const profile = this.manager.resolve(request.profile);
    const active = [...this.sessions.values()].find((session) => session.snapshot().engine?.id === profile.id);
    if (active) throw new Error(`Engine profile ${profile.id} is in use by session ${active.id}.`);
    const result = await this.manager.remove(profile.id);
    if (this.store.snapshot().settings.defaultEngineProfileId === profile.profile) await this.store.setSetting('defaultEngineProfileId', 'stable');
    this.publishSnapshot();
    return result;
  }

  async execute(args = [], sessionId = this.selectedSessionId()) {
    const action = String(args[0] || 'list').toLowerCase();
    try {
      const value = await this.run(action, args, sessionId);
      this.logger.log(`[Engines] ${JSON.stringify(value, null, 2)}`);
      return { ok: true, value };
    } catch (error) {
      this.logger.error(`[Engines] ${error.message}`);
      return { ok: false, error: error.message };
    }
  }

  async run(action, args, sessionId) {
    if (action === 'list' || action === 'catalog') return this.list();
    if (action === 'research') return this.research({ owner: args[1] || 'Pix3lPirat3' });
    if (action === 'plan') return PRESETS.includes(String(args[1] || '').toLowerCase())
      ? this.plan({ preset: args[1] })
      : this.plan({ name: args[1], pulls: args.slice(2) });
    if (action === 'install') {
      const confirmed = args.at(-1)?.toLowerCase() === 'confirm';
      const values = confirmed ? args.slice(1, -1) : args.slice(1);
      return PRESETS.includes(String(values[0] || '').toLowerCase())
        ? this.install({ preset: values[0], acknowledgeUnsafe: confirmed })
        : this.install({ name: values[0], pulls: values.slice(1), acknowledgeUnsafe: confirmed });
    }
    if (action === 'use') return this.use({ profile: args[1], sessionId });
    if (action === 'remove') {
      if (args.at(-1)?.toLowerCase() !== 'confirm') throw new Error('Removing an engine profile requires confirm.');
      return this.remove({ profile: args[1] });
    }
    throw new Error('Usage: engine <list|catalog|research [owner]|plan <name|bedrock> [pulls...]|install <name|bedrock> [pulls...] confirm|use <profile>|remove <profile> confirm>.');
  }

  complete(input) {
    let parsed;
    try { parsed = parseCommandLine(input); } catch { return []; }
    if (parsed.args.length === 0 || parsed.args.length === 1 && !/\s$/u.test(String(input))) return [...ACTIONS];
    const action = parsed.args[0]?.toLowerCase();
    if (action === 'use' || action === 'remove') return this.manager.list().map((profile) => profile.id);
    if (action === 'plan' || action === 'install') return [...PRESETS];
    return [];
  }
}

module.exports = { EngineController };
