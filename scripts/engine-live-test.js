'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { EngineManager } = require('../src/main/engine-manager');

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mineprompt-engine-live-'));
  try {
    const manager = await new EngineManager({ directory }).init();
    const open = await manager.research('Pix3lPirat3');
    const packages = await manager.planPackages({
      name: 'pix3l-preview',
      pulls: [
        'PrismarineJS/mineflayer#4140',
        'PrismarineJS/mineflayer#4051',
        'PrismarineJS/mineflayer-pathfinder#388',
        'PrismarineJS/prismarine-item#186'
      ]
    });
    const bedrock = await manager.planPreset('bedrock');
    const installed = process.argv.includes('--install')
      ? await manager.install(packages, { acknowledgeUnsafe: true, timeout: 20 * 60 * 1000 })
      : null;
    const installedBedrock = process.argv.includes('--install-bedrock')
      ? await manager.install(bedrock, { acknowledgeUnsafe: true, timeout: 20 * 60 * 1000 })
      : null;
    process.stdout.write(`${JSON.stringify({
      openPulls: open.length,
      packages: packages.sources.map((source) => ({ reference: source.reference, revision: source.head.sha, mergeState: source.mergeState })),
      packageWarnings: packages.warnings,
      bedrock: { repository: bedrock.repository.repository, revision: bedrock.repository.sha, companions: bedrock.sources.map((source) => source.reference) },
      installed: installed ? { id: installed.id, verified: installed.verified } : null,
      installedBedrock: installedBedrock ? { id: installedBedrock.id, verified: installedBedrock.verified } : null
    }, null, 2)}\n`);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
