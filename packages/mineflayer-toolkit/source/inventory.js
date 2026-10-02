'use strict';

const { installInventory, inventoryPlugin } = require('./inventory-plugin');
const { InventoryService } = require('../../../src/main/inventory-service');
const { CraftingService, recipeIngredients } = require('../../../src/main/crafting-service');
const stash = require('../../../src/main/stash-service');
const model = require('../../../src/main/inventory-model');

module.exports = { ...model, ...stash, CraftingService, InventoryService, installInventory, inventoryPlugin, recipeIngredients };
