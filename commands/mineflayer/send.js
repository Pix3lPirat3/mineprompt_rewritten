module.exports = {
  command: 'send',
  aliases: ['chat', 'say'],
  usage: 'send <message>',
  description: 'Send a message or a command to the server.',
  requiresEntity: true,
  author: 'Pix3lPirat3',
  autocomplete: function() {
    return Object.keys(bot.players);
  },
  execute: function(sender, command, args) {
    if (!args.length) return sender.reply(`[Send] You must specify a message to send.`);
    let msg = args.join(' ');
    if (msg.length > 256) return sender.reply(`[Send] Your message was bigger than 256 characters.`)
    bot.chat(msg)

  }
}