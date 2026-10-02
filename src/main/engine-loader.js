'use strict';

const path = require('node:path');
const { createRequire } = require('node:module');

function loadEngine(engine = {}) {
  const stable = !engine.root;
  const load = stable ? require : createRequire(path.join(engine.root, 'package.json'));
  const mineflayer = load('mineflayer');
  const pathfinder = load('mineflayer-pathfinder');
  const chat = load('prismarine-chat');
  if (typeof mineflayer?.createBot !== 'function') throw new Error(`Engine ${engine.id || 'stable'} does not provide mineflayer.createBot.`);
  if (typeof pathfinder?.pathfinder !== 'function' || typeof pathfinder?.Movements !== 'function') throw new Error(`Engine ${engine.id || 'stable'} does not provide a compatible Pathfinder plugin.`);
  return Object.freeze({
    id: engine.id || 'stable',
    profile: engine.profile || engine.id || 'stable',
    name: engine.name || 'Stable',
    edition: engine.edition || 'java',
    revision: engine.revision || null,
    createBot: mineflayer.createBot,
    pathfinder: pathfinder.pathfinder,
    Movements: pathfinder.Movements,
    chatFactory: (registry) => chat(registry)
  });
}

module.exports = { loadEngine };
