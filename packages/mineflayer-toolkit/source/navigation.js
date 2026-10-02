'use strict';

const { installNavigation, navigationPlugin } = require('./navigation-plugin');
const navigation = require('../../../src/main/navigation-service');
const pathCosts = require('../../../src/main/path-cost-planner');

module.exports = { ...navigation, ...pathCosts, installNavigation, navigationPlugin };
