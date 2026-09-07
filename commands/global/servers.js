'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const minecraftFolderPath = require('minecraft-folder-path');
const nbt = require('prismarine-nbt');

module.exports = {
  command: 'servers',
  usage: 'servers',
  description: 'List servers saved by the Minecraft launcher.',
  requires: { console: true },

  async execute(sender) {
    try {
      const buffer = await fs.readFile(path.join(minecraftFolderPath, 'servers.dat'));
      const { parsed } = await nbt.parse(buffer);
      const servers = nbt.simplify(parsed).servers || [];
      if (!servers.length) return sender.reply('[Servers] No saved servers were found.');
      return sender.reply(servers.map((server, index) => `${index + 1}. ${server.name} - ${server.ip}`).join('\n'));
    } catch (error) {
      console.debug(error);
      return sender.reply("[Servers] Minecraft's servers.dat file could not be read.");
    }
  }
};
