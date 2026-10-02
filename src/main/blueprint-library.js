'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { gzipSync, gunzipSync } = require('node:zlib');
const { importedBlueprint, MAX_BLUEPRINT_FILE_BYTES } = require('./blueprint-importer');
const { blueprintSummary, validateStoredBlueprint } = require('./blueprint-model');

const MAX_STORED_BLUEPRINT_BYTES = 268435456;

class BlueprintLibrary {
  constructor({ directory, logger, onChange = () => {} }) {
    this.directory = directory;
    this.logger = logger;
    this.onChange = onChange;
    this.blueprints = new Map();
    this.refreshQueue = Promise.resolve();
    this.watcher = null;
    this.refreshTimer = null;
  }

  async init() {
    await fs.mkdir(this.directory, { recursive: true });
    await this.refresh();
    try {
      this.watcher = require('node:fs').watch(this.directory, { persistent: false }, () => {
        clearTimeout(this.refreshTimer);
        this.refreshTimer = setTimeout(() => { void this.refresh().catch((error) => this.logger.warn(`[Blueprints] ${error.message}`)); }, 50);
      });
    } catch (error) {
      this.logger.warn(`[Blueprints] Directory changes will require a command reload: ${error.message}`);
    }
    return this;
  }

  filePath(hash) {
    return path.join(this.directory, `${hash}.json.gz`);
  }

  refresh() {
    this.refreshQueue = this.refreshQueue.catch(() => {}).then(async () => {
      const entries = await fs.readdir(this.directory, { withFileTypes: true });
      const files = entries.filter((entry) => entry.isFile() && /^[a-f0-9]{64}\.json\.gz$/u.test(entry.name)).map((entry) => entry.name).sort();
      const loaded = new Map();
      for (const file of files) {
        try {
          const blueprint = await this.read(path.join(this.directory, file));
          loaded.set(blueprint.hash, blueprint);
        } catch (error) {
          this.logger.warn(`[Blueprints] Ignored ${file}: ${error.message}`);
        }
      }
      const changed = loaded.size !== this.blueprints.size || [...loaded.keys()].some((key) => !this.blueprints.has(key));
      this.blueprints = loaded;
      if (changed) this.onChange();
    });
    return this.refreshQueue;
  }

  async read(file) {
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size < 1 || stat.size > MAX_BLUEPRINT_FILE_BYTES) throw new Error('Stored blueprint size is invalid.');
    const compressed = await fs.readFile(file);
    const decoded = gunzipSync(compressed, { maxOutputLength: MAX_STORED_BLUEPRINT_BYTES });
    return validateStoredBlueprint(JSON.parse(decoded.toString('utf8')));
  }

  list() {
    return [...this.blueprints.values()].map(blueprintSummary).sort((left, right) => left.name.localeCompare(right.name) || left.hash.localeCompare(right.hash));
  }

  resolve(reference) {
    const target = String(reference || '').trim().toLowerCase();
    if (!target) throw new Error('A blueprint id, hash, or name is required.');
    const values = [...this.blueprints.values()];
    const exact = values.find((entry) => entry.hash === target || entry.id === target || entry.name.toLowerCase() === target);
    if (exact) return exact;
    const prefixes = values.filter((entry) => entry.hash.startsWith(target));
    if (prefixes.length === 1) return prefixes[0];
    if (prefixes.length > 1) throw new Error(`Blueprint reference ${reference} is ambiguous.`);
    throw new Error(`Blueprint ${reference} was not found.`);
  }

  inspect(reference) {
    return structuredClone(this.resolve(reference));
  }

  materials(reference) {
    const blueprint = this.resolve(reference);
    return {
      blueprint: blueprintSummary(blueprint),
      materials: structuredClone(blueprint.materials),
      unsupportedBlocks: [...blueprint.unsupportedBlocks],
      supportSensitiveBlocks: [...blueprint.supportSensitiveBlocks]
    };
  }

  async importFile(file, options = {}) {
    const resolved = path.resolve(String(file || ''));
    const stat = await fs.stat(resolved).catch(() => null);
    if (!stat?.isFile()) throw new Error('The schematic file was not found.');
    if (stat.size < 1 || stat.size > MAX_BLUEPRINT_FILE_BYTES) throw new Error(`Schematic files must contain 1 to ${MAX_BLUEPRINT_FILE_BYTES} bytes.`);
    return this.importBuffer(await fs.readFile(resolved), { ...options, sourceFile: path.basename(resolved), name: options.name || path.basename(resolved, path.extname(resolved)) });
  }

  async importBuffer(buffer, options = {}) {
    const blueprint = importedBlueprint(buffer, {
      ...options,
      sourceFile: path.basename(String(options.sourceFile || 'blueprint'))
    });
    const payload = gzipSync(Buffer.from(JSON.stringify(blueprint)), { level: 9 });
    const finalPath = this.filePath(blueprint.hash);
    const temporaryPath = path.join(this.directory, `.${blueprint.hash}.${crypto.randomUUID()}.tmp`);
    try {
      await fs.writeFile(temporaryPath, payload, { flag: 'wx', mode: 0o600 });
      await fs.link(temporaryPath, finalPath);
    } catch (error) {
      if (error.code === 'EEXIST') throw new Error(`Blueprint ${blueprint.id} is already imported.`);
      throw error;
    } finally {
      await fs.unlink(temporaryPath).catch(() => {});
    }
    this.blueprints.set(blueprint.hash, blueprint);
    this.onChange();
    return blueprintSummary(blueprint);
  }

  async remove(reference) {
    const blueprint = this.resolve(reference);
    await fs.unlink(this.filePath(blueprint.hash));
    this.blueprints.delete(blueprint.hash);
    this.onChange();
    return true;
  }

  async close() {
    clearTimeout(this.refreshTimer);
    this.watcher?.close();
    await this.refreshQueue.catch(() => {});
  }
}

module.exports = { BlueprintLibrary, MAX_STORED_BLUEPRINT_BYTES, blueprintSummary, validateStoredBlueprint };
