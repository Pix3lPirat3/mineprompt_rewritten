let stringTable = require('string-table')
const minecraftFolderPath = require('minecraft-folder-path');
const nbt = require('prismarine-nbt');
const path = require('path');

module.exports = {
  command: 'servers',
  usage: 'servers',
  description: 'Reads saved servers in Minecraft\'s servers.dat',
  author: 'Pix3lPirat3',
  requires: {
    console: true
  },
  execute: async function(sender, command, args) {
    let serversFile = path.join(minecraftFolderPath, 'servers.dat')

    try {
      const buffer = await fs.readFileSync(serversFile);
      const { parsed } = await nbt.parse(buffer);
      let servers = await nbt.simplify(parsed).servers.map((srv, key) => ({
        '#': key,
        name: srv.name,
        ip: srv.ip
      }));
      sender.reply(stringTable.create(servers))
    } catch(e) {
      sender.reply(`[Servers] The servers file could not be read. (.minecraft/servers.dat)`)
      console.debug(e)
    }

  }
}