'use strict';

const { diffBlueprint } = require('./world-diff');

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

  snapshot() {
    return { blueprints: this.library.list() };
  }
}

module.exports = { BlueprintService };
