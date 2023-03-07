let stringTable = require('string-table')

module.exports = {
  command: 'account',
  usage: 'account <add/remove> [username] [authentication (microsoft/offline)]',
  description: 'Add an account',
  author: 'Pix3lPirat3',
  requires: {
    console: true
  },
  execute: async function(sender, command, args) {

    if(!args.length) return console.log(`[Account] Invalid Usage: ${this.usage}`);

    let authentication_types = ['microsoft', 'offline'];
    let authentication = args[2] || 'microsoft';
    if(!authentication_types.includes(authentication)) {
      return sender.reply(`[Account] "${authentication}" is not a valid authenticaion type.\nTypes: ${authentication_types.join(', ')}`)
    }
    let username = args[1];

    if(args[0] === 'add' && args.length >= 2) {
      const stmt = await database.db.prepare('SELECT * FROM accounts WHERE username = ?;')
      await stmt.bind({ 1: username })
      
      let accounts = await stmt.get();
      if(accounts) return sender.reply(`[Account] An account with this name already exists..`);

      return database.addAccount(username, authentication)

    }

    if(args[0] === 'remove' && args.length === 2) {
        return database.removeAccount(username);
    }
  }
}