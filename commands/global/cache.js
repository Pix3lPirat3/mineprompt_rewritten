module.exports = {
  command: 'cache',
  usage: 'cache <list | delete> <username>',
  description: 'Clear the account cache',
  author: 'Pix3lPirat3',
  requires: {
    console: true
  },
  execute: async function(sender, command, args) {
    if(args.length === 1) {
      if(args[0] === 'list') {
        let folders = fs.readdirSync('./cache/');
        if(!folders.length) return console.log(`[Cache] There are no cache folders, you have not logged into any accounts.`);
        return console.log('Cache Folders:\n', folders.map(folder => `- ${folder}`).join('\n'));
      }
    }
    if(args.length === 2) {
      if(args[0] === 'delete') {
        let folders = fs.readdirSync('./cache/');
        let target = args[1];
        if(!folders.includes(target)) return console.log(`[Cache] There is no folder named ${target}`);
        return await fs.rmdirSync(`./cache/${target}`, { recursive: true, force: true });
      }
    }
    console.log(`[Cache] Invalid Usage: ${this.usage}`);
  }
}