'use strict';

const { MemoryStorageStore, installStorage, storagePlugin } = require('./storage-plugin');
const model = require('../../../src/main/storage-model');
const service = require('../../../src/main/storage-service');

module.exports = { ...model, ...service, MemoryStorageStore, installStorage, storagePlugin };
