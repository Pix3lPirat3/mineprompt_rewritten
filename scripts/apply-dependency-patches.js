'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'node_modules', 'mineflayer-pathfinder');
const changes = [
  { file: 'lib/heap.js', before: 'if (smallerChild < size - 1) {', after: 'if (smallerChild < size) {' },
  { file: 'lib/goals.js', before: 'let max = Number.MIN_VALUE', after: 'let max = -Infinity' },
  {
    file: 'lib/goto.js',
    before: "if (results.path.length === 0) {\n        cleanup()\n      } else if (results.status === 'noPath') {\n        cleanup(error('NoPath', 'No path to the goal!'))\n      } else if (results.status === 'timeout') {\n        cleanup(error('Timeout', 'Took to long to decide path to goal!'))\n      }",
    after: "if (results.status === 'noPath') {\n        cleanup(error('NoPath', 'No path to the goal!'))\n      } else if (results.status === 'timeout') {\n        cleanup(error('Timeout', 'Took to long to decide path to goal!'))\n      } else if (results.status === 'success' && results.path.length === 0) {\n        cleanup()\n      }"
  },
  {
    file: 'index.js',
    before: 'bot.pathfinder.stop = () => {\n    stopPathing = true',
    after: 'bot.pathfinder.stop = () => {\n    if (!stateGoal && path.length === 0) return\n    stopPathing = true'
  }
];

for (const change of changes) {
  const file = path.join(root, change.file);
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes(change.after)) continue;
  if (!source.includes(change.before)) throw new Error(`Cannot apply the Mineflayer Pathfinder correction to ${change.file}.`);
  fs.writeFileSync(file, source.replace(change.before, change.after), 'utf8');
  process.stdout.write(`[Dependencies] Corrected mineflayer-pathfinder/${change.file}.\n`);
}
