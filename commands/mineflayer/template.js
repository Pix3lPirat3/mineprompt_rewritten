module.exports = {
  command: 'template',
  usage: 'template',
  description: '',
  requires: {
    entity: true
  },
  author: 'Pix3lPirat3',
  execute: function(sender, command, args) {
    sender.reply('[Template] This is a template command.')
  }
}