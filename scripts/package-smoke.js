'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { listPackage } = require('@electron/asar');

const platformDirectory = `MinePrompt-${process.platform}-${process.arch}`;
const applicationRoot = path.resolve('out', platformDirectory);
const resourcesPath = process.platform === 'darwin'
  ? path.join(applicationRoot, 'MinePrompt.app', 'Contents', 'Resources')
  : path.join(applicationRoot, 'resources');
const asarPath = path.join(resourcesPath, 'app.asar');
const runtimeRoot = path.join(resourcesPath, 'app.asar.unpacked');

assert.equal(fs.existsSync(asarPath), true, `Package not found at ${asarPath}.`);
const packagedFiles = listPackage(asarPath).map((file) => file.replaceAll('\\', '/'));
for (const excluded of ['/test/', '/scripts/', '/.github/', '/CHANGELOG.md', '/TERMS.md']) {
  assert.equal(packagedFiles.some((file) => file === excluded.slice(0, -1) || file.startsWith(excluded)), false, `Unexpected packaged path ${excluded}`);
}
for (const relative of ['src/session-worker.js', 'src/main/process-session.js', 'packages/mineflayer-ui/package.json', 'packages/mineflayer-ui/index.cjs']) {
  assert.equal(fs.existsSync(path.join(runtimeRoot, relative)), true, `Missing packaged runtime file ${relative}`);
}
const ui = require(path.join(runtimeRoot, 'packages', 'mineflayer-ui'));
assert.equal(typeof ui.emptyPresentation, 'function');
process.stdout.write('[Package] Runtime contents verified.\n');
