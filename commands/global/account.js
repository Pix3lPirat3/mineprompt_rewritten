let stringTable = require('string-table')

module.exports = {
  command: 'account',
  usage: 'account <add/delete> [username] [authentication]',
  description: 'Add an account',
  author: 'Pix3lPirat3',
  requires: {
    console: true
  },
  execute: async function(sender, command, args) {

    let authentication_types = ['microsoft', 'offline'];
    let regex_username = /^[a-zA-Z0-9_]{2,16}$/

    if(args[0] === 'add' && args.length === 3) {
      let username = args[1];
      let authentication = args[2];

      if(!regex_username.test(username)) {
        return sender.reply(`[Account] "${username}" is not a valid username. (${regex_username})`)
      }
      if(!authentication_types.includes(authentication)) {
        return sender.reply(`[Account] "${authentication}" is not a valid authenticaion type.\nTypes: ${authentication_types.join(', ')}`)
      }
      database.addAccount(username, authentication)
    }
    if(args[0] === 'remove' && args.length === 2) {
      let username = args[1];

      let existing_account = (await database.db.query('SELECT * FROM accounts WHERE username = ?', username)).rows[0];
      if(!existing_account) return sender.reply(`[Account] There is no account with the username "${username}"`);

      database.removeAccount(username)
    }
  }
}