'use strict';

const { compilePlacementGraph, compileStancePlan, publicPlacementPlan } = require('./placement-compiler');
const { analyzeBlueprint, diffBlueprint } = require('./world-diff');

class BlueprintService {
  constructor({ library, getClient }) {
    this.library = library;
    this.getClient = getClient;
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

  snapshot() {
    return { blueprints: this.library.list() };
  }
}

module.exports = { BlueprintService };
