'use strict';

const { installTrees, treeLifecycle, treeNavigation, treePlanner, treePlugin, treePolicy } = require('./tree-plugin');
const { TreeService } = require('../../../src/main/tree-service');

module.exports = { ...treePlanner, ...treePolicy, ...treeLifecycle, ...treeNavigation, TreeService, installTrees, treePlugin };
