const path = require('path');
const minecraftFolderPath = require('minecraft-folder-path');
const minepromptFolderPath = path.join(minecraftFolderPath, 'mineprompt-cache')
const fs = require('fs');

const getDirectories = source => fs.readdirSync(source, { withFileTypes: true }).filter(dirent => dirent.isDirectory()).map(folder => folder.name);

module.exports = {
  command: 'cache',
  usage: 'cache <list | delete> <username>',
  description: 'Clear the account cache',
  author: 'Pix3lPirat3',
  requires: {
    console: true
  },
  autocomplete: () => getDirectories(minepromptFolderPath),
  execute: async function(sender, command, args) {
    if(!args.length) sender.reply(`[${this.command}] ${this.usage}`);

    let folders = getDirectories(minepromptFolderPath)

    // List the cache folders
    if(!args.length || args[0] === 'list') return sender.reply(`\n[[b;;]Cache Folders:]\n - ${folders.join('\n - ')}\n`);
    
    if(args.length === 2) {
      if(args[0] === 'delete') {
        let folders = getDirectories(minepromptFolderPath);
        let target = args[1].toUpperCase();
        if(!folders.includes(target)) return sender.reply(`[Cache] There is no cache folder called "${target}"`);

        let target_folder = path.join(minepromptFolderPath, target);
        sender.reply(`[Cache] Deleting the cache folder for ${target} (${target_folder})`);

        return await fs.rmdirSync(target_folder, { recursive: true, force: true });
      }
    }


  }
}