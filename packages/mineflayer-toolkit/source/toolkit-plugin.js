'use strict';

const { installRuntime } = require('./kernel');
const { installNavigation } = require('./navigation-plugin');
const { installMining } = require('./mining-plugin');
const { installTrees } = require('./tree-plugin');
const { installInventory } = require('./inventory-plugin');
const { installStorage } = require('./storage-plugin');
const { installInteractions } = require('./interactions-plugin');

function installToolkit(bot, options = {}) {
  const runtime = installRuntime(bot, options.runtime || options);
  const navigation = options.navigation === false ? null : installNavigation(bot, options.navigation);
  const mining = options.mining === false ? null : installMining(bot, { ...options.mining, navigation });
  const trees = options.trees === false ? null : installTrees(bot, { ...options.trees, mining });
  const inventory = options.inventory === false ? null : installInventory(bot, { ...options.inventory, mining });
  const storage = options.storage === false ? null : installStorage(bot, options.storage);
  const interactions = options.interactions === false ? null : installInteractions(bot, { ...options.interactions, mining, trees, inventory });
  return { runtime, navigation, mining, trees, inventory, storage, interactions };
}

function toolkitPlugin(options = {}) {
  return (bot) => installToolkit(bot, options);
}

module.exports = { installToolkit, toolkitPlugin };
