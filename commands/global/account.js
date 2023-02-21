let stringTable = require('string-table')

module.exports = {
  command: 'account',
  usage: 'account <add/delete> [username] [authentication (microsoft/offline)]',
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

    if(args[0] === 'add' && args.length >= 2) return database.addAccount(username, authentication)

    if(args[0] === 'remove' && args.length === 2) {

      let stmt = database.db.prepare(`SELECT username FROM accounts WHERE username = ?;`);
      stmt.each(username, function(err, row) {
        if(err) console.log(err);
      }, function(err, count) {
        stmt.finalize();
        if(!count) return console.log(`[Account] There was no account with the username "${username}"`);
        return database.removeAccount(username)
        database.setAccounts();
      });


    }
  }
}