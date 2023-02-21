module.exports = {
  command: 'closecontainer',
  usage: 'closecontainer',
  aliases: ['closewindow'],
  description: 'Close the currently opened container.',
  requires: {
    entity: true
  },
  author: 'Pix3lPirat3',
  execute: function(sender, command, args) {
    if(!bot.currentWindow) return sender.reply(`[closeContainer] There is no window currently open.`);
    bot.closeWindow(bot.currentWindow)
  }
}