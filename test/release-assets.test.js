'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { assetDefinitions, collectReleaseAssets, releaseAssetNames, verifyReleaseAssets } = require('../scripts/release-assets');

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mineprompt-release-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('normalizes maker output for a Windows release', (t) => {
  const directory = temporaryDirectory(t);
  const source = path.join(directory, 'make');
  const destination = path.join(directory, 'release');
  fs.mkdirSync(path.join(source, 'squirrel'), { recursive: true });
  fs.mkdirSync(path.join(source, 'zip'), { recursive: true });
  fs.writeFileSync(path.join(source, 'squirrel', 'MinePrompt Setup.exe'), Buffer.alloc(2048));
  fs.writeFileSync(path.join(source, 'squirrel', 'MinePrompt.nupkg'), Buffer.alloc(2048));
  fs.writeFileSync(path.join(source, 'zip', 'MinePrompt.zip'), Buffer.alloc(2048));
  const copied = collectReleaseAssets({ platform: 'win32', arch: 'x64', source, destination });
  assert.deepEqual(copied.map((file) => path.basename(file)).sort(), ['MinePrompt-Windows-x64-Setup.exe', 'MinePrompt-Windows-x64.zip']);
});

test('defines every supported release target', () => {
  assert.deepEqual(assetDefinitions('darwin', 'x64').map((asset) => asset.name), ['MinePrompt-macOS-x64.zip']);
  assert.deepEqual(assetDefinitions('darwin', 'arm64').map((asset) => asset.name), ['MinePrompt-macOS-arm64.zip']);
  assert.deepEqual(assetDefinitions('linux', 'x64').map((asset) => asset.name), ['MinePrompt-Linux-x64.deb', 'MinePrompt-Linux-x64.rpm']);
  assert.throws(() => assetDefinitions('linux', 'arm64'), /Unsupported release target/u);
});

test('verifies the complete cross-platform release and writes checksums', async (t) => {
  const directory = temporaryDirectory(t);
  for (const [index, name] of releaseAssetNames.entries()) fs.writeFileSync(path.join(directory, name), Buffer.alloc(2048, index));
  const checksums = await verifyReleaseAssets(directory);
  assert.equal(checksums.length, releaseAssetNames.length);
  assert.equal(fs.readFileSync(path.join(directory, 'SHA256SUMS.txt'), 'utf8').trim().split('\n').length, releaseAssetNames.length);
  assert.match(fs.readFileSync(path.join(directory, 'RELEASE_NOTES.md'), 'utf8'), /unsigned/u);
});

test('rejects incomplete or unexpected release contents', async (t) => {
  const directory = temporaryDirectory(t);
  for (const name of releaseAssetNames) fs.writeFileSync(path.join(directory, name), Buffer.alloc(2048));
  fs.writeFileSync(path.join(directory, 'old-build.zip'), Buffer.alloc(2048));
  await assert.rejects(verifyReleaseAssets(directory), /Unexpected release assets/u);
});
