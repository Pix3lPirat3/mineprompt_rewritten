module.exports = {
  command: 'animation',
  usage: 'animation <type (left|right)>',
  description: 'Swing your main or off hand.',
  requires: {
    entity: true
  },
  author: 'Pix3lPirat3',
  execute: function(sender, command, args) {
    let type = args[0]?.toLowerCase();
    let types = ['left', 'right']
    if (!types.includes(type)) return sender.reply(`[${this.command}] ${this.usage}`);
    bot.swingArm(type, true)
  }
}