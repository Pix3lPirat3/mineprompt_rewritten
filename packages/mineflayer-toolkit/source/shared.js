'use strict';

const { Vec3 } = require('vec3');

const POSITION_SCHEMA = Object.freeze({
  type: 'object',
  properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
  required: ['x', 'y', 'z'],
  additionalProperties: false
});

function position(value) {
  if (!value || ![value.x, value.y, value.z].every(Number.isFinite)) throw new TypeError('A finite x, y, z position is required.');
  return new Vec3(Math.floor(value.x), Math.floor(value.y), Math.floor(value.z));
}

function serviceClient(bot, value = {}) {
  return { bot, connectionAttempt: 1, inventoryEvents: { revision: 0 }, chatMessageClass: null, ...value };
}

function registerActions(runtime, definitions) {
  const disposers = [];
  try {
    for (const definition of definitions) disposers.push(runtime.actions.register(definition));
  } catch (error) {
    for (const remove of disposers.reverse()) remove();
    throw error;
  }
  const dispose = () => {
    for (const remove of disposers.splice(0).reverse()) remove();
  };
  runtime.addDisposer(dispose);
  return dispose;
}

function registerCapability(runtime, id, api, description, actionDefinitions = [], dispose = () => {}) {
  const removeCapability = runtime.register(id, api, { version: 1, description });
  let removeActions;
  try {
    removeActions = registerActions(runtime, actionDefinitions);
  } catch (error) {
    removeCapability();
    throw error;
  }
  let removed = false;
  const remove = () => {
    if (removed) return false;
    removed = true;
    removeActions();
    dispose();
    return removeCapability();
  };
  runtime.addDisposer(remove);
  return api;
}

module.exports = { POSITION_SCHEMA, position, registerCapability, serviceClient };
