'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { EngineManager, cleanManifest, npmInvocation } = require('../src/main/engine-manager');

function pull(reference, packageName, sha, mergeState = 'clean') {
  const [repository, number] = reference.split('#');
  return {
    reference,
    number: Number(number),
    title: reference,
    state: 'open',
    draft: false,
    mergeable: mergeState !== 'dirty',
    mergeState,
    updatedAt: '2026-09-23',
    url: `https://github.com/${repository}/pull/${number}`,
    package: packageName,
    packageVersion: '1.0.0',
    head: { sha, repository: `Pix3lPirat3/${repository.split('/')[1]}`, cloneUrl: `https://github.com/Pix3lPirat3/${repository.split('/')[1]}.git` },
    base: { sha: 'f'.repeat(40), repository, cloneUrl: `https://github.com/${repository}.git` }
  };
}

class FixtureManager extends EngineManager {
  async installPackages(plan, staging) {
    const runtime = path.join(staging, 'runtime');
    await fs.mkdir(runtime, { recursive: true });
    await fs.writeFile(path.join(runtime, 'package.json'), JSON.stringify({ name: plan.profile }), 'utf8');
    return runtime;
  }

  async verifyRuntime() {}
}

test('builds deterministic package plans and groups same-package pulls', async () => {
  const values = new Map([
    ['PrismarineJS/mineflayer#4140', pull('PrismarineJS/mineflayer#4140', 'mineflayer', 'a'.repeat(40), 'blocked')],
    ['PrismarineJS/mineflayer#4138', pull('PrismarineJS/mineflayer#4138', 'mineflayer', 'b'.repeat(40))],
    ['PrismarineJS/mineflayer-pathfinder#388', pull('PrismarineJS/mineflayer-pathfinder#388', 'mineflayer-pathfinder', 'c'.repeat(40))]
  ]);
  const manager = new EngineManager({ directory: path.join(os.tmpdir(), 'unused-engines'), github: { pull: async (reference) => values.get(reference) } });
  const first = await manager.planPackages({ name: 'Preview', pulls: [...values.keys()] });
  const second = await manager.planPackages({ name: 'Preview', pulls: [...values.keys()].reverse() });
  assert.equal(first.id, second.id);
  assert.equal(first.packages.find((entry) => entry.package === 'mineflayer').sources.length, 2);
  assert.match(first.warnings.join(' '), /blocked/u);
});

test('installs atomically, replaces an older logical profile, and removes it', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mineprompt-engines-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const github = { pull: async (reference) => pull(reference, 'mineflayer', reference.endsWith('1') ? 'a'.repeat(40) : 'b'.repeat(40)) };
  const manager = await new FixtureManager({ directory, github, logger: { warn() {} } }).init();
  const firstPlan = await manager.planPackages({ name: 'Preview', pulls: ['PrismarineJS/mineflayer#1'] });
  await assert.rejects(manager.install(firstPlan), /acknowledgeUnsafe/u);
  const first = await manager.install(firstPlan, { acknowledgeUnsafe: true });
  assert.equal(manager.resolve('preview').id, first.id);
  const secondPlan = await manager.planPackages({ name: 'Preview', pulls: ['PrismarineJS/mineflayer#2'] });
  const second = await manager.install(secondPlan, { acknowledgeUnsafe: true });
  assert.equal(manager.resolve('preview').id, second.id);
  await assert.rejects(fs.access(path.join(directory, first.id)));
  await manager.remove(second.id);
  assert.equal(manager.resolve('preview', false), null);
});

test('plans the pinned Bedrock umbrella with its companion pull', async () => {
  const github = {
    repository: async () => ({ repository: 'Pix3lPirat3/mineflayer-bedrock-integration', cloneUrl: 'https://github.com/Pix3lPirat3/mineflayer-bedrock-integration.git', branch: 'main', sha: 'd'.repeat(40), url: 'https://github.com/Pix3lPirat3/mineflayer-bedrock-integration', description: 'Bedrock' }),
    pull: async (reference) => pull(reference, 'mineflayer-pathfinder', 'e'.repeat(40))
  };
  const manager = new EngineManager({ directory: path.join(os.tmpdir(), 'unused-bedrock-engines'), github });
  const plan = await manager.planPreset('bedrock');
  assert.equal(plan.edition, 'bedrock');
  assert.equal(plan.repository.sha, 'd'.repeat(40));
  assert.deepEqual(plan.sources.map((source) => source.reference), ['PrismarineJS/mineflayer-pathfinder#388']);
});

test('rejects engine manifests that escape their profile directory', () => {
  assert.throws(() => cleanManifest({
    schemaVersion: 1,
    id: 'preview',
    profile: 'preview',
    name: 'Preview',
    kind: 'packages',
    edition: 'java',
    revision: 'a'.repeat(64),
    verified: true,
    runtimeRoot: '../outside'
  }), /runtime directory/u);
  assert.throws(() => cleanManifest({
    schemaVersion: 1,
    id: 'preview',
    profile: 'preview',
    name: 'Preview',
    kind: 'packages',
    edition: 'java',
    revision: 'a'.repeat(64),
    runtimeRoot: 'runtime'
  }), /not been verified/u);
});

test('runs npm through its JavaScript entry point on Windows', () => {
  const invocation = npmInvocation({
    platform: 'win32',
    environment: { PATH: 'C:\\Node;C:\\Other', npm_node_execpath: 'C:\\Node\\node.exe' },
    executable: 'C:\\App\\MinePrompt.exe',
    exists: (value) => value === 'C:\\Node\\node_modules\\npm\\bin\\npm-cli.js'
  });
  assert.deepEqual(invocation, {
    command: 'C:\\Node\\node.exe',
    prefix: ['C:\\Node\\node_modules\\npm\\bin\\npm-cli.js']
  });
});
