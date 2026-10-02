'use strict';

const crypto = require('node:crypto');
const { existsSync } = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const packageJson = require('../../package.json');
const { profileId } = require('./engine-reference');
const { GitHubSource } = require('./github-source');
const { runProcess } = require('./process-runner');

const STABLE_ENGINE = Object.freeze({
  schemaVersion: 1,
  id: 'stable',
  profile: 'stable',
  name: 'Stable',
  kind: 'bundled',
  edition: 'java',
  revision: packageJson.version,
  installed: true,
  verified: true,
  source: 'MinePrompt'
});

const BEDROCK_PRESET = Object.freeze({
  schemaVersion: 1,
  id: 'bedrock-experimental',
  profile: 'bedrock-experimental',
  name: 'Bedrock Experimental',
  kind: 'umbrella',
  edition: 'bedrock',
  revision: null,
  repository: 'Pix3lPirat3/mineflayer-bedrock-integration',
  companionPulls: ['PrismarineJS/mineflayer-pathfinder#388']
});

function manifestHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function cleanManifest(value) {
  if (!value || typeof value !== 'object' || value.schemaVersion !== 1) throw new Error('Engine profile manifest is invalid.');
  const id = profileId(value.id);
  const profile = profileId(value.profile);
  if (!['java', 'bedrock'].includes(value.edition)) throw new Error(`Engine profile ${id} has an invalid edition.`);
  if (!['packages', 'umbrella'].includes(value.kind)) throw new Error(`Engine profile ${id} has an invalid kind.`);
  if (!/^[a-f0-9]{64}$/u.test(value.revision)) throw new Error(`Engine profile ${id} has an invalid revision.`);
  if (value.runtimeRoot !== 'runtime') throw new Error(`Engine profile ${id} has an invalid runtime directory.`);
  if (value.verified !== true) throw new Error(`Engine profile ${id} has not been verified.`);
  return {
    schemaVersion: 1,
    id,
    profile,
    name: String(value.name || profile).slice(0, 64),
    kind: value.kind,
    edition: value.edition,
    revision: value.revision,
    installed: true,
    verified: value.verified === true,
    installedAt: String(value.installedAt || ''),
    runtimeRoot: 'runtime',
    sources: Array.isArray(value.sources) ? value.sources : [],
    warnings: Array.isArray(value.warnings) ? value.warnings.map(String) : []
  };
}

function safePackageDirectory(name) {
  return String(name).replace(/^@/u, '').replace(/[^A-Za-z0-9_.-]+/gu, '-');
}

function sourceWarnings(source) {
  return [
    source.state !== 'open' ? `${source.reference} is ${source.state}.` : null,
    source.draft ? `${source.reference} is a draft.` : null,
    source.mergeState === 'dirty' ? `${source.reference} currently conflicts with its base.` : null,
    source.mergeState === 'blocked' ? `${source.reference} currently has blocked checks or reviews.` : null,
    source.mergeState === 'unstable' ? `${source.reference} currently has failing checks.` : null,
    source.mergeState === 'unknown' ? `${source.reference} has not finished GitHub merge analysis.` : null
  ].filter(Boolean);
}

function npmInvocation({ platform = process.platform, environment = process.env, executable = process.execPath, exists = existsSync } = {}) {
  if (platform !== 'win32') return { command: 'npm', prefix: [] };
  const windowsPath = path.win32;
  const directories = [
    windowsPath.dirname(executable),
    ...String(environment.PATH || '').split(';').map((entry) => entry.replace(/^"|"$/gu, ''))
  ].filter(Boolean);
  const cli = [...new Set(directories)].map((directory) => windowsPath.join(directory, 'node_modules', 'npm', 'bin', 'npm-cli.js')).find(exists);
  if (!cli) throw new Error('Node.js and npm must be installed to add an experimental engine profile.');
  return { command: environment.npm_node_execpath || 'node.exe', prefix: [cli] };
}

class EngineManager {
  constructor({ directory, github = new GitHubSource(), run = runProcess, npmCommand = null, gitCommand = 'git', nodeCommand = process.execPath, logger = console } = {}) {
    if (!directory) throw new TypeError('An engine profile directory is required.');
    this.directory = path.resolve(directory);
    this.github = github;
    this.run = run;
    this.npm = npmCommand ? { command: npmCommand, prefix: [] } : null;
    this.gitCommand = gitCommand;
    this.nodeCommand = nodeCommand;
    this.logger = logger;
    this.profiles = new Map([['stable', STABLE_ENGINE]]);
    this.operation = Promise.resolve();
  }

  async init() {
    await fs.mkdir(this.directory, { recursive: true });
    const entries = await fs.readdir(this.directory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      try {
        const manifest = cleanManifest(JSON.parse(await fs.readFile(path.join(this.directory, entry.name, 'manifest.json'), 'utf8')));
        if (manifest.id !== entry.name) throw new Error('The engine manifest does not match its directory.');
        await fs.access(path.join(this.directory, entry.name, manifest.runtimeRoot, 'package.json'));
        this.profiles.set(manifest.id, { ...manifest, root: path.join(this.directory, entry.name, manifest.runtimeRoot) });
      } catch (error) {
        this.logger.warn?.(`[Engines] Ignored ${entry.name}: ${error.message}`);
      }
    }
    return this;
  }

  catalog() {
    return [STABLE_ENGINE, { ...BEDROCK_PRESET, installed: Boolean(this.resolve(BEDROCK_PRESET.id, false)) }];
  }

  list() {
    return [...this.profiles.values()].map(({ root, ...manifest }) => ({ ...manifest })).sort((left, right) => left.name.localeCompare(right.name));
  }

  resolve(value = 'stable', required = true) {
    const requested = profileId(value || 'stable');
    if (this.profiles.has(requested)) return this.profiles.get(requested);
    const candidates = [...this.profiles.values()].filter((entry) => entry.profile === requested).sort((left, right) => String(right.installedAt).localeCompare(String(left.installedAt)));
    if (candidates.length) return candidates[0];
    if (required) throw new Error(`Engine profile ${requested} is not installed.`);
    return null;
  }

  async research(owner = 'Pix3lPirat3') {
    return this.github.openPulls(owner);
  }

  async planPackages({ name, pulls }) {
    const references = [...new Set((Array.isArray(pulls) ? pulls : []).map(String))];
    if (!references.length || references.length > 32) throw new Error('An engine package plan requires 1 to 32 pull requests.');
    const sources = await Promise.all(references.map((reference) => this.github.pull(reference)));
    sources.sort((left, right) => left.reference.localeCompare(right.reference));
    const grouped = Object.values(sources.reduce((result, source) => {
      result[source.package] ||= { package: source.package, sources: [] };
      result[source.package].sources.push(source);
      return result;
    }, {})).sort((left, right) => left.package.localeCompare(right.package));
    const profile = profileId(name || sources.map((source) => source.package).join('-')).slice(0, 48).replace(/-+$/u, '');
    if (profile === 'stable') throw new Error('The bundled stable engine profile name is reserved.');
    const warnings = sources.flatMap(sourceWarnings);
    const revision = manifestHash({ kind: 'packages', sources: sources.map((source) => [source.reference, source.head.sha, source.base.sha]) });
    return {
      schemaVersion: 1,
      id: `${profile}-${revision.slice(0, 12)}`,
      profile,
      name: String(name || profile).slice(0, 64),
      kind: 'packages',
      edition: 'java',
      revision,
      sources,
      packages: grouped,
      warnings
    };
  }

  async planPreset(value) {
    const preset = String(value || '').toLowerCase();
    if (!['bedrock', BEDROCK_PRESET.id].includes(preset)) throw new Error(`Unknown engine preset: ${value}.`);
    const repository = await this.github.repository('Pix3lPirat3', 'mineflayer-bedrock-integration');
    const companions = await Promise.all(BEDROCK_PRESET.companionPulls.map((reference) => this.github.pull(reference)));
    const revision = manifestHash({ repository: repository.sha, companions: companions.map((source) => source.head.sha) });
    return {
      schemaVersion: 1,
      id: `${BEDROCK_PRESET.id}-${revision.slice(0, 12)}`,
      profile: BEDROCK_PRESET.id,
      name: BEDROCK_PRESET.name,
      kind: 'umbrella',
      edition: 'bedrock',
      revision,
      repository,
      sources: companions,
      warnings: companions.flatMap(sourceWarnings)
    };
  }

  install(plan, options = {}) {
    if (options.acknowledgeUnsafe !== true) return Promise.reject(new Error('Experimental engine installation requires acknowledgeUnsafe=true.'));
    const operation = this.operation.then(() => this.installNow(plan, options));
    this.operation = operation.catch(() => {});
    return operation;
  }

  async installNow(plan, options) {
    if (!plan || plan.schemaVersion !== 1 || !['packages', 'umbrella'].includes(plan.kind)) throw new Error('An unresolved engine plan cannot be installed.');
    if (profileId(plan.id) !== plan.id || profileId(plan.profile) !== plan.profile || !/^[a-f0-9]{64}$/u.test(plan.revision)) throw new Error('The engine plan identity is invalid.');
    const existing = this.profiles.get(plan.id);
    if (existing) return { ...existing, reused: true };
    const staging = path.join(this.directory, `.install-${crypto.randomUUID()}`);
    const target = path.join(this.directory, plan.id);
    await fs.mkdir(staging, { recursive: true });
    try {
      const runtimeRoot = plan.kind === 'umbrella'
        ? await this.installUmbrella(plan, staging, options)
        : await this.installPackages(plan, staging, options);
      await this.verifyRuntime(runtimeRoot, plan);
      const manifest = cleanManifest({ ...plan, installedAt: new Date().toISOString(), runtimeRoot: path.relative(staging, runtimeRoot), verified: true });
      await fs.writeFile(path.join(staging, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
      await fs.rename(staging, target);
      const installed = { ...manifest, root: path.join(target, manifest.runtimeRoot) };
      this.profiles.set(installed.id, installed);
      await this.removeSuperseded(installed);
      const { root, ...result } = installed;
      return result;
    } catch (error) {
      await fs.rm(staging, { recursive: true, force: true });
      throw error;
    }
  }

  async installPackages(plan, staging, options) {
    const npm = this.npm || (this.npm = npmInvocation());
    const runtimeRoot = path.join(staging, 'runtime');
    const buildRoot = path.join(staging, 'build');
    const sourcesRoot = path.join(buildRoot, 'sources');
    const packagesRoot = path.join(runtimeRoot, '.packages');
    await fs.mkdir(runtimeRoot, { recursive: true });
    await fs.mkdir(sourcesRoot, { recursive: true });
    await fs.mkdir(packagesRoot, { recursive: true });
    const dependencies = {
      mineflayer: packageJson.dependencies.mineflayer,
      'mineflayer-pathfinder': packageJson.dependencies['mineflayer-pathfinder'],
      'prismarine-chat': packageJson.dependencies['prismarine-chat']
    };
    const overrides = {};
    for (const group of plan.packages) {
      let spec;
      if (group.sources.length === 1) {
        const source = group.sources[0];
        spec = `git+${source.head.cloneUrl}#${source.head.sha}`;
      } else {
        const sourceDirectory = path.join(sourcesRoot, safePackageDirectory(group.package));
        await this.buildComposite(group, sourceDirectory, options);
        const result = await this.execute(npm.command, [...npm.prefix, 'pack', '--ignore-scripts', '--json', '--pack-destination', packagesRoot], { cwd: sourceDirectory, timeout: options.timeout, logOutput: false });
        const packed = JSON.parse(result.stdout);
        const filename = Array.isArray(packed) ? packed[0]?.filename : null;
        const archive = path.resolve(packagesRoot, String(filename || ''));
        if (!filename || path.dirname(archive) !== packagesRoot) throw new Error(`Could not pack the combined ${group.package} source.`);
        spec = `file:${path.relative(runtimeRoot, archive).replaceAll('\\', '/')}`;
      }
      dependencies[group.package] = spec;
      overrides[group.package] = `$${group.package}`;
    }
    const definition = {
      name: `mineprompt-engine-${plan.profile}`,
      private: true,
      version: '0.0.0',
      dependencies,
      overrides
    };
    await fs.writeFile(path.join(runtimeRoot, 'package.json'), `${JSON.stringify(definition, null, 2)}\n`, 'utf8');
    await this.execute(npm.command, [...npm.prefix, 'install', '--ignore-scripts', '--allow-git=all', '--no-audit', '--no-fund'], { cwd: runtimeRoot, timeout: options.timeout });
    await fs.writeFile(path.join(runtimeRoot, 'package.json'), `${JSON.stringify({ name: definition.name, private: true, version: definition.version }, null, 2)}\n`, 'utf8');
    await fs.rm(path.join(runtimeRoot, 'package-lock.json'), { force: true });
    await fs.rm(packagesRoot, { recursive: true, force: true });
    await fs.rm(buildRoot, { recursive: true, force: true });
    return runtimeRoot;
  }

  async buildComposite(group, destination, options) {
    const repositories = new Set(group.sources.map((source) => source.base.repository));
    if (repositories.size !== 1) throw new Error(`Cannot combine ${group.package} pull requests from different base repositories.`);
    const first = group.sources[0];
    await this.git(['clone', '--quiet', '--filter=blob:none', '--no-tags', first.base.cloneUrl, destination], { timeout: options.timeout });
    await this.git(['checkout', '--quiet', '--detach', first.base.sha], { cwd: destination, timeout: options.timeout });
    const env = {
      GIT_AUTHOR_NAME: 'MinePrompt',
      GIT_AUTHOR_EMAIL: 'mineprompt@localhost',
      GIT_COMMITTER_NAME: 'MinePrompt',
      GIT_COMMITTER_EMAIL: 'mineprompt@localhost'
    };
    for (const source of group.sources) {
      await this.git(['fetch', '--quiet', '--no-tags', source.head.cloneUrl, source.head.sha], { cwd: destination, timeout: options.timeout, env });
      await this.git(['-c', 'commit.gpgSign=false', 'merge', '--no-edit', '--no-ff', '--no-verify', source.head.sha], { cwd: destination, timeout: options.timeout, env });
    }
  }

  async installUmbrella(plan, staging, options) {
    const npm = this.npm || (this.npm = npmInvocation());
    const runtimeRoot = path.join(staging, 'runtime');
    await this.git(['clone', '--quiet', '--recurse-submodules', plan.repository.cloneUrl, runtimeRoot], { timeout: options.timeout });
    await this.git(['checkout', '--quiet', '--detach', plan.repository.sha], { cwd: runtimeRoot, timeout: options.timeout });
    await this.git(['submodule', 'update', '--quiet', '--init', '--recursive'], { cwd: runtimeRoot, timeout: options.timeout });
    await this.execute(npm.command, [...npm.prefix, 'run', 'bootstrap'], { cwd: runtimeRoot, timeout: options.timeout || 20 * 60 * 1000 });
    for (const source of plan.sources || []) {
      const spec = `${source.package}@git+${source.head.cloneUrl}#${source.head.sha}`;
      await this.execute(npm.command, [...npm.prefix, 'install', '--no-save', '--ignore-scripts', '--allow-git=all', '--no-audit', '--no-fund', spec], { cwd: runtimeRoot, timeout: options.timeout });
    }
    return runtimeRoot;
  }

  async verifyRuntime(runtimeRoot) {
    const script = "const {createRequire}=require('node:module');const path=require('node:path');const load=createRequire(path.join(process.argv[1],'package.json'));const mineflayer=load('mineflayer');const pathfinder=load('mineflayer-pathfinder');const chat=load('prismarine-chat');if(typeof mineflayer.createBot!=='function')throw new Error('mineflayer.createBot is unavailable');if(typeof pathfinder.pathfinder!=='function'||typeof pathfinder.Movements!=='function')throw new Error('pathfinder plugin is unavailable');if(typeof chat!=='function')throw new Error('prismarine-chat is unavailable')";
    await this.execute(this.nodeCommand, ['-e', script, runtimeRoot], {
      cwd: runtimeRoot,
      timeout: 30000,
      env: process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}
    });
  }

  execute(command, args, options = {}) {
    return this.run(command, args, {
      ...options,
      onOutput: options.logOutput === false ? undefined : (stream, chunk) => {
        const line = chunk.trim();
        if (line) this.logger.info?.(`[Engines] ${line.slice(-1000)}`);
      }
    });
  }

  git(args, options = {}) {
    return this.execute(this.gitCommand, args, {
      ...options,
      env: {
        GIT_TERMINAL_PROMPT: '0',
        GCM_INTERACTIVE: 'Never',
        ...(options.env || {})
      }
    });
  }

  async removeSuperseded(installed) {
    const superseded = [...this.profiles.values()].filter((entry) => entry.id !== installed.id && entry.profile === installed.profile && entry.id !== 'stable');
    for (const entry of superseded) {
      try { await this.remove(entry.id); } catch (error) { this.logger.warn?.(`[Engines] Could not remove superseded profile ${entry.id}: ${error.message}`); }
    }
  }

  async remove(value) {
    const profile = this.resolve(value);
    if (profile.id === 'stable') throw new Error('The bundled stable engine cannot be removed.');
    const target = path.resolve(this.directory, profile.id);
    if (path.dirname(target) !== this.directory) throw new Error('Engine profile path is outside the engine directory.');
    await fs.rm(target, { recursive: true, force: true });
    this.profiles.delete(profile.id);
    return { ok: true, id: profile.id };
  }
}

module.exports = { BEDROCK_PRESET, EngineManager, STABLE_ENGINE, cleanManifest, manifestHash, npmInvocation, safePackageDirectory, sourceWarnings };
