module.exports = {
  command: 'spam',
  usage: 'spam <stop || delay> <message>',
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
    //todo:Stop on disconnect
    if(args[0] === "stop") return clearInterval(this.reload.timer);
    if (!args.length) return sender.reply(`[Send] You must specify a message to send.`);
    let msg = args.join(' ');
    if (msg.length > 256) return sender.reply(`[Send] Your message was bigger than 256 characters.`);

    bot.chat(msg);
    let timer = setInterval(function() {
      if(!bot?.entity) return clearInterval(timer);
      bot.chat(msg);
    }, 2000)
    this.reload.timer = timer;
    console.log('Created Timer:', this.reload.timer);

  }
}