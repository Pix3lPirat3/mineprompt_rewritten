let stringTable = require('string-table')

module.exports = {
  command: 'account',
  usage: 'account <add/remove> [username] [authentication (true/false)]',
  description: 'Add an account',
  author: 'Pix3lPirat3',
  requires: {
    console: true
  },
  execute: async function(sender, command, args) {

    if(!args.length) return console.log(`[Account] Invalid Usage: ${this.usage}`);

    let username = args[1];

    if(args[0] === 'add') {
      if(args.length < 3) return console.log(`[Account] You must specify a [[bu;indianred;]username] and [[bu;indianred;]authentication]`);
      let authentication = args[2];
      if(typeof authentication !== 'boolean') return console.log(`[Account] Type of authentication must be [[bu;indianred;]true] or [[bu;indianred;]false]`);

      // Check if the account already exists
      let accountExists = await database.getAccount(username);
      if(accountExists) return console.log(`[Account] Unable to create account, account "${username}" already exists.`)

      // Add Account
      console.log('authentication:', authentication)
      return database.addAccount(username, authentication)
    }

    if(args[0] === 'remove') {
      if(args.length === 1) return console.log(`[Account] You must specify an account to remove.`);
      let accountExists = await database.getAccount(username);
      if(!accountExists) return console.log(`[Account] Unable to delete account, account "${username}" does not exist.`);
      console.log(`[Account] Deleted the account "${username}"`)
      return database.removeAccount(username);
    }

    return console.log(`[${this.command}] ${this.usage}`)
  }
}