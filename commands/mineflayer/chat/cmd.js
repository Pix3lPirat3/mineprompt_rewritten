module.exports = {
  command: 'cmd',
  usage: 'cmd <command>',
  aliases: ['command'],
  description: 'Send a command to the server. (automatically prefixed by /)',
  requires: {
    entity: true
  },
  author: 'Pix3lPirat3',
  autocomplete: function() {
    return Object.keys(bot.players);
  },
  execute: function(sender, command, args) {
    if (!args.length) return sender.reply(`[Cmd] You must specify a command to send.`);
    let msg = args.join(' ').trim();
    if (msg.length > 256) return sender.reply(`[Cmd] Your command was bigger than 256 characters.`);
    console.log(`SENDING: "/${msg}"`)
    bot.chat('/' + msg)

  }
}