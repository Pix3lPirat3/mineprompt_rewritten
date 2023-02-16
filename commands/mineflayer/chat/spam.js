module.exports = {
  command: 'spam',
  usage: 'spam <delay> <message>',
  aliases: ['repeat'],
  description: 'Send a message or a command to the server.',
  requires: {
    entity: true
  },
  reload: {
    pre: function() {
      if(this.timer) console.log(`[Reload] [Spam] Unloading the spam timer (${this.timer})`)
      clearInterval(this.timer);
    },
    post: function() {

    }
  },
  author: 'Pix3lPirat3',
  execute: function(sender, command, args) {
    if (!args.length) return sender.reply(`[Send] You must specify a message to send.`);
    let msg = args.join(' ');
    if (msg.length > 256) return sender.reply(`[Send] Your message was bigger than 256 characters.`)

    bot.chat(msg)
    this.reload.timer = setInterval(function() {
      bot.chat(msg)
    }, 2000)
    console.log('Created Timer:', this.reload.timer)

  }
}