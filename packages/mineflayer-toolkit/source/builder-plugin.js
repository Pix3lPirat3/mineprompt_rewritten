'use strict';

const { installRuntime } = require('./kernel');
const { POSITION_SCHEMA, registerCapability, serviceClient } = require('./shared');
const { BlueprintService } = require('../../../src/main/blueprint-service');
const { blueprintSummary, validateStoredBlueprint } = require('../../../src/main/blueprint-model');
const { MAX_BUILD_JOBS, cleanBuildJob, cleanBuildJobs } = require('../../../src/main/build-job');

class MemoryBlueprintLibrary {
  constructor(blueprints = []) {
    this.blueprints = new Map(blueprints.map((blueprint) => {
      const value = validateStoredBlueprint(structuredClone(blueprint));
      return [value.hash, value];
    }));
  }

  list() {
    return [...this.blueprints.values()].map(blueprintSummary).sort((left, right) => left.name.localeCompare(right.name));
  }

  resolve(reference) {
    const target = String(reference || '').trim().toLowerCase();
    const value = [...this.blueprints.values()].find((entry) => entry.id === target || entry.hash === target || entry.name.toLowerCase() === target);
    if (!value) throw new Error(`Blueprint ${reference} was not found.`);
    return value;
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
}

class MemoryBuildJobStore {
  constructor(jobs = []) {
    this.data = { buildJobs: cleanBuildJobs(jobs) };
  }

  snapshot() {
    return structuredClone(this.data);
  }

  async saveBuildJob(input) {
    const job = cleanBuildJob(input);
    const index = this.data.buildJobs.findIndex((entry) => entry.id === job.id);
    if (index >= 0) this.data.buildJobs[index] = job;
    else this.data.buildJobs.push(job);
    this.data.buildJobs.sort((left, right) => right.updatedAt - left.updatedAt);
    this.data.buildJobs = this.data.buildJobs.slice(0, MAX_BUILD_JOBS);
    return structuredClone(job);
  }

  async removeBuildJob(id) {
    const target = String(id || '').trim().toLowerCase();
    const length = this.data.buildJobs.length;
    this.data.buildJobs = this.data.buildJobs.filter((job) => job.id !== target);
    return this.data.buildJobs.length !== length;
  }
}

function installBuilder(bot, options = {}) {
  const runtime = installRuntime(bot, options.runtime);
  if (runtime.has('builder')) return runtime.get('builder');
  const client = options.client || serviceClient(bot, options.clientState);
  const library = options.library || new MemoryBlueprintLibrary(options.blueprints);
  const store = options.store || new MemoryBuildJobStore(options.jobs);
  const service = options.service || new BlueprintService({
    library,
    getClient: () => client,
    store,
    activities: runtime.activities,
    storage: options.storage || null,
    logger: runtime.logger,
    owner: options.owner || bot.username || 'builder',
    onChange: () => runtime.emit('builderChange')
  });
  const api = Object.freeze({
    service,
    library,
    list: () => service.list(),
    inspect: (reference) => service.inspect(reference),
    materials: (reference) => service.materials(reference),
    preview: (reference, request) => service.preview(reference, request),
    plan: (reference, request) => service.plan(reference, request),
    start: (reference, request) => service.start(reference, request),
    resume: (id) => service.resume(id),
    pause: () => service.pause(),
    stop: () => service.stop(),
    status: () => service.buildStatus(),
    snapshot: () => service.snapshot()
  });
  return registerCapability(runtime, 'builder', api, 'Version-declared blueprint inspection, transforms, material bills, world diffs, dependency graphs, safe stance plans, and verified survival execution.', [
    {
      id: 'builder.list',
      title: 'List blueprints',
      capability: 'builder',
      risk: 'read',
      inputSchema: { type: 'object', additionalProperties: false },
      execute: () => api.list()
    },
    {
      id: 'builder.inspect',
      title: 'Inspect a blueprint',
      capability: 'builder',
      risk: 'read',
      inputSchema: { type: 'object', properties: { blueprint: { type: 'string' } }, required: ['blueprint'], additionalProperties: false },
      execute: ({ request }) => api.inspect(request.blueprint)
    },
    {
      id: 'builder.materials',
      title: 'Read blueprint materials',
      capability: 'builder',
      risk: 'read',
      inputSchema: { type: 'object', properties: { blueprint: { type: 'string' } }, required: ['blueprint'], additionalProperties: false },
      execute: ({ request }) => api.materials(request.blueprint)
    },
    {
      id: 'builder.preview',
      title: 'Compare a blueprint with the world',
      capability: 'builder',
      risk: 'read',
      inputSchema: { type: 'object', additionalProperties: true },
      execute: ({ request }) => api.preview(request.blueprint, request)
    },
    {
      id: 'builder.plan',
      title: 'Compile a blueprint placement plan',
      capability: 'builder',
      risk: 'read',
      inputSchema: { type: 'object', additionalProperties: true },
      execute: ({ request }) => api.plan(request.blueprint, request)
    },
    {
      id: 'builder.start',
      title: 'Start a verified blueprint build',
      capability: 'builder',
      risk: 'dangerous',
      inputSchema: { type: 'object', properties: { blueprint: { type: 'string' }, anchor: POSITION_SCHEMA, rotation: { enum: [0, 90, 180, 270] }, mirror: { enum: ['none', 'x', 'z'] }, policy: { type: 'object', additionalProperties: true }, confirmed: { type: 'boolean' } }, required: ['blueprint', 'anchor'], additionalProperties: false },
      execute: ({ request }) => api.start(request.blueprint, request)
    },
    {
      id: 'builder.resume',
      title: 'Resume a durable build job',
      capability: 'builder',
      risk: 'dangerous',
      inputSchema: { type: 'object', properties: { job: { type: 'string' } }, required: ['job'], additionalProperties: false },
      execute: ({ request }) => api.resume(request.job)
    },
    {
      id: 'builder.pause',
      title: 'Pause the active build',
      capability: 'builder',
      risk: 'dangerous',
      inputSchema: { type: 'object', additionalProperties: false },
      execute: () => api.pause()
    },
    {
      id: 'builder.stop',
      title: 'Stop the active build',
      capability: 'builder',
      risk: 'dangerous',
      inputSchema: { type: 'object', additionalProperties: false },
      execute: () => api.stop()
    },
    {
      id: 'builder.status',
      title: 'Read build job status',
      capability: 'builder',
      risk: 'read',
      inputSchema: { type: 'object', additionalProperties: false },
      execute: () => api.status()
    }
  ]);
}

function builderPlugin(options = {}) {
  return (bot) => installBuilder(bot, options);
}

module.exports = { MemoryBlueprintLibrary, MemoryBuildJobStore, builderPlugin, installBuilder };
