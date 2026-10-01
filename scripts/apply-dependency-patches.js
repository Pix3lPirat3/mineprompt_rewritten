'use strict';

const fs = require('node:fs');
const path = require('node:path');

const dependency = 'mineflayer-pathfinder';
const supportedVersion = '2.4.5';
const project = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'));
const declaredVersion = project.dependencies[dependency];
if (declaredVersion !== supportedVersion) {
  throw new Error(`${dependency} must remain pinned to ${supportedVersion} until its corrections are reviewed.`);
}
const root = path.resolve(__dirname, '..', 'node_modules', dependency);
const installedVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
if (installedVersion !== supportedVersion) {
  throw new Error(`${dependency} ${installedVersion} requires a review of the corrections written for ${supportedVersion}.`);
}
const changes = [
  { file: 'lib/heap.js', upstream: '#369', before: 'if (smallerChild < size - 1) {', after: 'if (smallerChild < size) {' },
  { file: 'lib/goals.js', upstream: '#369', before: 'let max = Number.MIN_VALUE', after: 'let max = -Infinity' },
  {
    file: 'lib/goto.js',
    upstream: '#375',
    before: "if (results.path.length === 0) {\n        cleanup()\n      } else if (results.status === 'noPath') {\n        cleanup(error('NoPath', 'No path to the goal!'))\n      } else if (results.status === 'timeout') {\n        cleanup(error('Timeout', 'Took to long to decide path to goal!'))\n      }",
    after: "if (results.status === 'noPath') {\n        cleanup(error('NoPath', 'No path to the goal!'))\n      } else if (results.status === 'timeout') {\n        cleanup(error('Timeout', 'Took to long to decide path to goal!'))\n      } else if (results.status === 'success' && results.path.length === 0) {\n        cleanup()\n      }"
  },
  {
    file: 'index.js',
    upstream: '#375',
    before: 'bot.pathfinder.stop = () => {\n    stopPathing = true',
    after: 'bot.pathfinder.stop = () => {\n    if (!stateGoal && path.length === 0) return\n    stopPathing = true'
  }
];

for (const change of changes) {
  const file = path.join(root, change.file);
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes(change.after)) continue;
  if (!source.includes(change.before)) throw new Error(`Cannot apply ${dependency} correction ${change.upstream} to ${change.file}.`);
  fs.writeFileSync(file, source.replace(change.before, change.after), 'utf8');
  process.stdout.write(`[Dependencies] Corrected ${dependency}/${change.file} from ${change.upstream}.\n`);
}
