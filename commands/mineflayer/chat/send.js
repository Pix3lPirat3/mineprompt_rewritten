module.exports = {
  command: 'send',
  usage: 'send <message>',
  aliases: ['chat', 'say'],
  description: 'Send a message or a command to the server.',
  requires: {
    entity: true
  },
  author: 'Pix3lPirat3',
  autocomplete: function() {
    return Object.keys(bot.players);
  },
  execute: function(sender, command, args) {
    if (!args.length) return sender.reply(`[${this.command}] ${this.usage}`);
    let msg = args.join(' ');
    if (msg.length > 256) return sender.reply(`[Send] Your message was bigger than 256 characters.`)
    bot.chat(msg)

  }
}