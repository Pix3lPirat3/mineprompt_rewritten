'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const minecraftFolderPath = require('minecraft-folder-path');

const cacheRoot = path.resolve(minecraftFolderPath, 'mineprompt-cache');

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
  usage: 'cache <list|delete> [username]',
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

    const targetName = args[1].toUpperCase();
    if (!folders.includes(targetName)) return sender.reply(`[Cache] No cache exists for ${targetName}.`);
    const targetPath = path.resolve(cacheRoot, targetName);
    if (path.dirname(targetPath) !== cacheRoot) throw new Error('Refusing to remove a path outside the account cache.');
    await fs.rm(targetPath, { recursive: true, force: true });
    return sender.reply(`[Cache] Removed cached authentication for ${targetName}.`);
  }
};
