'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { authenticationCachePath } = require('../../src/main/data-paths');

const cacheRoot = authenticationCachePath();

async function getDirectories() {
  try {
    const entries = await fs.readdir(cacheRoot, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

module.exports = {
  command: 'cache',
  usage: 'cache <list|delete> [cache-folder]',
  description: 'List or remove cached Microsoft authentication data.',
  requires: { console: true },
  autocomplete: getDirectories,

  async execute(sender, command, args) {
    const action = args[0]?.toLowerCase() || 'list';
    const folders = await getDirectories();
    if (action === 'list') {
      return sender.reply(folders.length ? `[Cache]\n${folders.map((folder) => `• ${folder}`).join('\n')}` : '[Cache] No cached accounts.');
    }
    if (action !== 'delete' || !args[1]) return sender.reply(`[Cache] Usage: ${this.usage}`);

    const requested = args[1];
    const targetName = folders.find((folder) => folder.toLowerCase() === requested.toLowerCase());
    if (!targetName) return sender.reply(`[Cache] No cache exists for ${requested}.`);
    const targetPath = path.resolve(cacheRoot, targetName);
    if (path.dirname(targetPath) !== cacheRoot) throw new Error('Refusing to remove a path outside the account cache.');
    await fs.rm(targetPath, { recursive: true, force: true });
    return sender.reply(`[Cache] Removed cached authentication for ${targetName}.`);
  }
};
