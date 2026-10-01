'use strict';

const path = require('node:path');
const { fork } = require('node:child_process');
const { ProcessSession } = require('./process-session');

function spawnSessionWorker(rootPath) {
  const child = fork(path.join(rootPath, 'src', 'session-worker.js'), [], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    serialization: 'advanced',
    windowsHide: true
  });
  child.postMessage = (message) => child.send(message);
  return child;
}

function nodeProcessSessionFactory(rootPath) {
  return (options) => new ProcessSession({ ...options, spawn: () => spawnSessionWorker(rootPath) });
}

module.exports = { nodeProcessSessionFactory, spawnSessionWorker };
