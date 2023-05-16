module.exports = {
  command: 'anonymous',
  usage: 'anonymous',
  description: 'toggles anonymous mode',
  author: 'Pix3lPirat3',
  requires: {
    console: true
  },
  execute: async function(sender, command, args) {
    if(!args.length) interface.anonymous.toggle();

    if(args.length === 1) {
      // The string is not a boolean value
      interface.anonymous.enable(args[0]);
    }

  }
}