'use strict';

const { MemorySettingsStore, installInteractions, interactionsPlugin } = require('./interactions-plugin');
const players = require('../../../src/main/player-actions');
const relationships = require('../../../src/main/relationship-service');
const targets = require('../../../src/main/targeting-service');

module.exports = { ...players, ...relationships, ...targets, MemorySettingsStore, installInteractions, interactionsPlugin };
