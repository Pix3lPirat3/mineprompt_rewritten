'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const outputRoot = path.join(projectRoot, 'out');
const makeRoot = path.join(outputRoot, 'make');
const defaultDestination = path.join(projectRoot, 'release-assets');
const checksumName = 'SHA256SUMS.txt';
const notesName = 'RELEASE_NOTES.md';
const releaseAssetNames = [
  'MinePrompt-Linux-x64.deb',
  'MinePrompt-Linux-x64.rpm',
  'MinePrompt-macOS-arm64.zip',
  'MinePrompt-macOS-x64.zip',
  'MinePrompt-Windows-x64-Setup.exe',
  'MinePrompt-Windows-x64.zip'
];

function filesWithin(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesWithin(target) : [target];
  });
}

function removeGenerated(target) {
  const relative = path.relative(projectRoot, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Unsafe generated path ${target}.`);
  fs.rmSync(target, { recursive: true, force: true });
}

function cleanReleaseOutput() {
  removeGenerated(outputRoot);
  removeGenerated(defaultDestination);
}

function assetDefinitions(platform, arch) {
  if (platform === 'win32' && arch === 'x64') {
    return [
      { name: 'MinePrompt-Windows-x64-Setup.exe', match: (file) => /Setup\.exe$/iu.test(file) },
      { name: 'MinePrompt-Windows-x64.zip', match: (file) => /\.zip$/iu.test(file) }
    ];
  }
  if (platform === 'darwin' && ['arm64', 'x64'].includes(arch)) {
    return [{ name: `MinePrompt-macOS-${arch}.zip`, match: (file) => /\.zip$/iu.test(file) }];
  }
  if (platform === 'linux' && arch === 'x64') {
    return [
      { name: 'MinePrompt-Linux-x64.deb', match: (file) => /\.deb$/iu.test(file) },
      { name: 'MinePrompt-Linux-x64.rpm', match: (file) => /\.rpm$/iu.test(file) }
    ];
  }
  throw new Error(`Unsupported release target ${platform}-${arch}.`);
}

function collectReleaseAssets(options = {}) {
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const source = options.source || makeRoot;
  const destination = options.destination || defaultDestination;
  const available = filesWithin(source);
  const copied = [];
  fs.mkdirSync(destination, { recursive: true });
  for (const definition of assetDefinitions(platform, arch)) {
    const matches = available.filter(definition.match);
    if (matches.length !== 1) throw new Error(`Expected one source for ${definition.name}, found ${matches.length}.`);
    const target = path.join(destination, definition.name);
    fs.copyFileSync(matches[0], target);
    copied.push(target);
  }
  return copied;
}

function digest(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = fs.createReadStream(file);
    input.on('error', reject);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

async function verifyReleaseAssets(destination = defaultDestination) {
  const present = fs.existsSync(destination) ? fs.readdirSync(destination) : [];
  const missing = releaseAssetNames.filter((name) => !present.includes(name));
  const allowed = new Set([...releaseAssetNames, checksumName, notesName]);
  const unexpected = present.filter((name) => !allowed.has(name));
  if (missing.length > 0) throw new Error(`Missing release assets: ${missing.join(', ')}.`);
  if (unexpected.length > 0) throw new Error(`Unexpected release assets: ${unexpected.join(', ')}.`);
  const lines = [];
  for (const name of releaseAssetNames) {
    const file = path.join(destination, name);
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size < 1024) throw new Error(`Release asset ${name} is empty or incomplete.`);
    lines.push(`${await digest(file)}  ${name}`);
  }
  fs.writeFileSync(path.join(destination, checksumName), `${lines.join('\n')}\n`, 'utf8');
  const version = require('../package.json').version;
  const notes = `Current MinePrompt ${version} build for Windows, macOS, and Linux.\n\nThese builds are unsigned. Windows SmartScreen or macOS Gatekeeper may require manual confirmation.\n\nUse ${checksumName} to verify downloads. Older binaries are intentionally removed after each successful release.\n`;
  fs.writeFileSync(path.join(destination, notesName), notes, 'utf8');
  return lines;
}

async function main() {
  const command = process.argv[2];
  if (command === 'clean') cleanReleaseOutput();
  else if (command === 'collect') collectReleaseAssets();
  else if (command === 'verify') await verifyReleaseAssets();
  else throw new Error('Expected release-assets command clean, collect, or verify.');
  process.stdout.write(`[Release] ${command} completed.\n`);
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});

module.exports = { assetDefinitions, cleanReleaseOutput, collectReleaseAssets, releaseAssetNames, verifyReleaseAssets };
