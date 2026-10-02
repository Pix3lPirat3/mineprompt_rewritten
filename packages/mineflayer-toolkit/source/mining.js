'use strict';

const { installMining, miningPlugin, miningPlanner, miningPolicy } = require('./mining-plugin');
const mining = require('../../../src/main/mining-service');
const pathCosts = require('../../../src/main/path-cost-planner');

module.exports = { ...mining, ...miningPlanner, ...miningPolicy, ...pathCosts, installMining, miningPlugin };
