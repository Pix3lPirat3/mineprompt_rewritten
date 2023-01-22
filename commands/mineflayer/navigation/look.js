module.exports = {
  command: 'look',
  description: '',
  requiresEntity: true,
  author: 'Pix3lPirat3',
  execute: function(sender, command, args) {
    
    const degrees_to_radians = deg => (deg * Math.PI) / 180.0;

    bot.look(degrees_to_radians(args[0]), 0, true)


  }
}