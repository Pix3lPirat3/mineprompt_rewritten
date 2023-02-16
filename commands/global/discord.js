
module.exports = {
  command: 'discord',
  usage: 'discord <token | settoken> [token]',
  description: 'Get or set the discord bot\'s token',
  author: 'Pix3lPirat3',
  requires: {
    console: true
  },
  execute: async function(sender, command, args) {
    if(args.length === 1) {
      if(args[0] === 'token') {
        
      }
    }
    if(args.length === 2) {
      if(args[0] === 'settoken') {
        let token = args[1];
      }
    }
  }
}