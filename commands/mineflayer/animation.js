module.exports = {
  command: 'animation',
  description: 'Swing your main or off hand.',
  requiresEntity: true,
  author: 'Pix3lPirat3',
  execute: function(sender, command, args) {
    let type = args[0]?.toLowerCase();
    let types = ['left', 'right']
    if (!types.includes(type)) return sender.send(`[Animation] You must specify an animation type [${types.join(', ')}]`);
    bot.swingArm(type, true)
  }
}