'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const project = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const corrections = [
  {
    dependency: 'mineflayer-pathfinder',
    version: '2.4.5',
    changes: [
      { file: 'lib/heap.js', reference: '#369', before: 'if (smallerChild < size - 1) {', after: 'if (smallerChild < size) {' },
      { file: 'lib/goals.js', reference: '#369', before: 'let max = Number.MIN_VALUE', after: 'let max = -Infinity' },
      {
        file: 'lib/goto.js',
        reference: '#375',
        before: "if (results.path.length === 0) {\n        cleanup()\n      } else if (results.status === 'noPath') {\n        cleanup(error('NoPath', 'No path to the goal!'))\n      } else if (results.status === 'timeout') {\n        cleanup(error('Timeout', 'Took to long to decide path to goal!'))\n      }",
        after: "if (results.status === 'noPath') {\n        cleanup(error('NoPath', 'No path to the goal!'))\n      } else if (results.status === 'timeout') {\n        cleanup(error('Timeout', 'Took to long to decide path to goal!'))\n      } else if (results.status === 'success' && results.path.length === 0) {\n        cleanup()\n      }"
      },
      {
        file: 'index.js',
        reference: '#375',
        before: 'bot.pathfinder.stop = () => {\n    stopPathing = true',
        after: 'bot.pathfinder.stop = () => {\n    if (!stateGoal && path.length === 0) return\n    stopPathing = true'
      }
    ]
  },
  {
    dependency: 'prismarine-item',
    version: '1.18.0',
    changes: [
      {
        file: 'index.js',
        reference: 'component-equality',
        before: [
          "(matchNbt ? JSON.stringify(item1.nbt) === JSON.stringify(item2.nbt) : true)\n        )",
          "(matchNbt ? JSON.stringify(item1.nbt) === JSON.stringify(item2.nbt) : true) &&\n          (matchNbt ? JSON.stringify(item1.components) === JSON.stringify(item2.components) : true) &&\n          (matchNbt ? JSON.stringify(item1.removedComponents) === JSON.stringify(item2.removedComponents) : true)\n        )"
        ],
        after: "(matchNbt ? JSON.stringify(item1.nbt) === JSON.stringify(item2.nbt) : true) &&\n          (matchNbt ? JSON.stringify([...(item1.components || [])].sort((a, b) => String(a.type).localeCompare(String(b.type)))) === JSON.stringify([...(item2.components || [])].sort((a, b) => String(a.type).localeCompare(String(b.type)))) : true) &&\n          (matchNbt ? JSON.stringify([...(item1.removedComponents || [])].sort()) === JSON.stringify([...(item2.removedComponents || [])].sort()) : true)\n        )"
      }
    ]
  }
];

for (const correction of corrections) {
  const declaredVersion = project.dependencies[correction.dependency];
  if (declaredVersion !== correction.version) throw new Error(`${correction.dependency} must remain pinned to ${correction.version} until its corrections are reviewed.`);
  const dependencyRoot = path.join(root, 'node_modules', correction.dependency);
  const installedVersion = JSON.parse(fs.readFileSync(path.join(dependencyRoot, 'package.json'), 'utf8')).version;
  if (installedVersion !== correction.version) throw new Error(`${correction.dependency} ${installedVersion} requires a review of the corrections written for ${correction.version}.`);
  for (const change of correction.changes) {
    const file = path.join(dependencyRoot, change.file);
    const source = fs.readFileSync(file, 'utf8');
    if (source.includes(change.after)) continue;
    const candidates = Array.isArray(change.before) ? change.before : [change.before];
    const before = candidates.find((candidate) => source.includes(candidate));
    if (!before) throw new Error(`Cannot apply ${correction.dependency} correction ${change.reference} to ${change.file}.`);
    fs.writeFileSync(file, source.replace(before, change.after), 'utf8');
    process.stdout.write(`[Dependencies] Corrected ${correction.dependency}/${change.file} from ${change.reference}.\n`);
  }
}
