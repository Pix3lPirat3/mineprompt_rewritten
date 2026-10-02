'use strict';

const kernel = require('./kernel');
const { ActivityManager } = require('../../../src/main/activity-manager');
const { ActionDispatcher } = require('../../../src/main/action-dispatcher');

module.exports = { ...kernel, ActivityManager, ActionDispatcher };
