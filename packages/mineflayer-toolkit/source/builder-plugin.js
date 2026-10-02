'use strict';

const { installRuntime } = require('./kernel');
const { registerCapability, serviceClient } = require('./shared');
const { BlueprintService } = require('../../../src/main/blueprint-service');
const { blueprintSummary, validateStoredBlueprint } = require('../../../src/main/blueprint-model');

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

function installBuilder(bot, options = {}) {
  const runtime = installRuntime(bot, options.runtime);
  if (runtime.has('builder')) return runtime.get('builder');
  const client = options.client || serviceClient(bot, options.clientState);
  const library = options.library || new MemoryBlueprintLibrary(options.blueprints);
  const service = options.service || new BlueprintService({ library, getClient: () => client });
  const api = Object.freeze({
    service,
    library,
    list: () => service.list(),
    inspect: (reference) => service.inspect(reference),
    materials: (reference) => service.materials(reference),
    preview: (reference, request) => service.preview(reference, request),
    plan: (reference, request) => service.plan(reference, request),
    snapshot: () => service.snapshot()
  });
  return registerCapability(runtime, 'builder', api, 'Version-declared blueprint inspection, transforms, material bills, world diffs, dependency graphs, and safe stance plans.', [
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
    }
  ]);
}

function builderPlugin(options = {}) {
  return (bot) => installBuilder(bot, options);
}

module.exports = { MemoryBlueprintLibrary, builderPlugin, installBuilder };
