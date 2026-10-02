'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const project = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const corrections = [
  {
    dependency: 'mineflayer',
    version: '4.39.0',
    changes: [
      {
        file: 'lib/loader.js',
        reference: '#4085',
        before: "const bot = new EventEmitter()\n  bot._client = options.client",
        after: "const bot = new EventEmitter()\n  let interactionSequence = 0\n  bot._nextSequence = () => ++interactionSequence\n  bot._client = options.client"
      },
      {
        file: 'lib/plugins/digging.js',
        reference: '#4085',
        before: 'face: bot.targetDigFace // default face is 1 (top)',
        after: 'face: bot.targetDigFace, // default face is 1 (top)\n      sequence: bot._nextSequence()'
      },
      {
        file: 'lib/plugins/digging.js',
        reference: '#4085',
        before: 'face: bot.targetDigFace // always the same as the start face',
        after: 'face: bot.targetDigFace, // always the same as the start face\n          sequence: bot._nextSequence()'
      },
      {
        file: 'lib/plugins/digging.js',
        reference: '#4085',
        before: 'face: cancellationDiggingFace\n      })',
        after: 'face: cancellationDiggingFace,\n        sequence: 0\n      })'
      },
      {
        file: 'lib/plugins/generic_place.js',
        reference: '#4085',
        before: 'sequence: 0, // 1.19.0',
        after: 'sequence: bot._nextSequence(), // 1.19.0'
      },
      {
        file: 'lib/plugins/generic_place.js',
        reference: '#4085',
        before: "if (options.swingArm) {\n      bot.swingArm(options.swingArm, options.showHand)\n    }\n\n    if (bot.supportFeature('blockPlaceHasHeldItem'))",
        after: "if (bot.supportFeature('blockPlaceHasHeldItem'))"
      },
      {
        file: 'lib/plugins/generic_place.js',
        reference: '#4085',
        before: '    }\n\n    return pos',
        after: "    }\n\n    if (options.swingArm) {\n      bot.swingArm(options.swingArm, options.showHand)\n    }\n\n    return pos"
      },
      {
        file: 'lib/plugins/inventory.js',
        reference: '#4085',
        before: 'let eatingTask = createDoneTask()\n  let sequence = 0\n\n  let nextActionNumber = 0',
        after: 'let eatingTask = createDoneTask()\n\n  let nextActionNumber = 0'
      },
      {
        file: 'lib/plugins/inventory.js',
        reference: '#4085',
        before: 'function activateItem (offHand = false) {\n    bot.usingHeldItem = true\n    sequence++',
        after: "function activateItem (offHand = false) {\n    if (!(offHand ? bot.inventory.slots[45] : bot.heldItem)) return\n    bot.usingHeldItem = true"
      },
      {
        file: 'lib/plugins/inventory.js',
        reference: '#4085',
        before: 'hand: offHand ? 1 : 0,\n        sequence,',
        after: 'hand: offHand ? 1 : 0,\n        sequence: bot._nextSequence(),'
      },
      {
        file: 'lib/plugins/inventory.js',
        reference: '#4085',
        before: "cursorPos = cursorPos ?? new Vec3(0.5, 0.5, 0.5)\n    // TODO: tell the server that we are not sneaking while doing this\n    await bot.lookAt(block.position.offset(0.5, 0.5, 0.5), false)",
        after: "cursorPos = cursorPos ?? new Vec3(0.5 + direction.x * 0.5, 0.5 + direction.y * 0.5, 0.5 + direction.z * 0.5)\n    // TODO: tell the server that we are not sneaking while doing this\n    await bot.lookAt(block.position.plus(cursorPos), false)"
      },
      {
        file: 'lib/plugins/inventory.js',
        reference: '#4085',
        before: 'sequence: 0, // 1.19.0+',
        after: 'sequence: bot._nextSequence(), // 1.19.0+'
      },
      {
        file: 'lib/plugins/place_entity.js',
        reference: '#4085',
        before: "const assert = require('assert')\n\nmodule.exports = inject",
        after: "const assert = require('assert')\nconst { toNotchianYaw, toNotchianPitch } = require('../conversions')\n\nmodule.exports = inject"
      },
      {
        file: 'lib/plugins/place_entity.js',
        reference: '#4085',
        before: "bot._client.write('use_item', {\n          hand: options.offhand ? 1 : 0\n        })",
        after: "bot._client.write('use_item', {\n          hand: options.offhand ? 1 : 0,\n          sequence: bot._nextSequence(),\n          rotation: {\n            x: toNotchianYaw(bot.entity.yaw),\n            y: toNotchianPitch(bot.entity.pitch)\n          }\n        })"
      }
    ]
  },
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
