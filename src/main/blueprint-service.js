'use strict';

const { compilePlacementGraph, compileStancePlan, publicPlacementPlan } = require('./placement-compiler');
const { analyzeBlueprint, diffBlueprint } = require('./world-diff');
const { BuildExecutor } = require('./build-executor');

class BlueprintService {
  constructor({ library, getClient, store = null, activities = null, logger = null, owner = '', onChange = () => {} }) {
    this.library = library;
    this.getClient = getClient;
    this.executor = store && activities ? new BuildExecutor({
      compile: (reference, request) => this.compile(reference, request),
      getClient,
      store,
      activities,
      logger,
      owner,
      onChange
    }) : null;
  }

  list() {
    return this.library.list();
  }

  inspect(reference) {
    return this.library.inspect(reference);
  }

  materials(reference) {
    return this.library.materials(reference);
  }

  importFile(file, options = {}) {
    return this.library.importFile(file, options);
  }

  remove(reference) {
    return this.library.remove(reference);
  }

  preview(reference, request = {}) {
    return diffBlueprint(this.getClient()?.bot, this.library.resolve(reference), request);
  }

  async compile(reference, request = {}) {
    const bot = this.getClient()?.bot;
    const analysis = await analyzeBlueprint(bot, this.library.resolve(reference), request, { records: true });
    const graph = compilePlacementGraph(bot, analysis);
    const stances = compileStancePlan(bot, graph, request.stances);
    return { analysis, graph, stances };
  }

  async plan(reference, request = {}) {
    const compiled = await this.compile(reference, request);
    return publicPlacementPlan(compiled.analysis, compiled.graph, compiled.stances);
  }

  requireExecutor() {
    if (!this.executor) throw new Error('Build execution is not configured.');
    return this.executor;
  }

  start(reference, request = {}) {
    return this.requireExecutor().start(reference, request);
  }

  resume(id) {
    return this.requireExecutor().resume(id);
  }

  pause() {
    return this.requireExecutor().pause();
  }

  stop() {
    return this.requireExecutor().stop();
  }

  buildStatus() {
    return this.executor ? this.executor.status() : { active: null, jobs: [] };
  }

  snapshot() {
    return { blueprints: this.library.list(), build: this.buildStatus() };
  }
}

module.exports = { BlueprintService };
