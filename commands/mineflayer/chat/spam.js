module.exports = {
  command: 'spam',
  usage: 'spam list || start <message> || stop [id {all}]',
  aliases: ['repeat'],
  description: 'Send a message or a command to the server.',
  requires: {
    entity: true
  },
  reload: {
    pre: function() {
      if(this.timers) console.log(`[Reload] [Spam] Unloading the spam timers (${this.timers})`)
      for (const timer of this.timers) {
        console.log(timer)
        clearInterval(timer.timer)
      }
      this.timers = []
    },
    post: function() {

    }
  },
  author: 'Pix3lPirat3',
  execute: function(sender, command, args) {
    if (!args.length) return sender.reply(`[${this.command}] ${this.usage}`)

    if (!this.reload.timers) {
      this.reload.timers = []
    }

    if (args[0] === 'list') {
      for (const timer of this.reload.timers) {
        console.log(`[Timer] ID: ${timer.timer} Delay: ${timer.delay} Message: ${timer.message}`)
      }
    }

    if (args[0] === 'start') {
      const delay = parseInt(args[1])
      const message = args.slice(2).join(' ')
      if (message.length > 256) return sender.reply(`[Send] Your message was bigger than 256 characters.`)
      const timer = startTimer(delay, message)
      this.reload.timers.push(timer)
      console.log(`[Timer] Created new timer with ID ${timer.timer}`)
    }

    if (args[0] === 'stop') {
      if (!args[1]) {
        for (const timer of this.reload.timers) {
          clearInterval(timer.timer)
        }
        console.log('[Timer] Cleared all timers')
      } else {
        for (const i in this.reload.timers) {
          if ((this.reload.timers[i].timer.toString()) == args[1]) {
            clearInterval(this.reload.timers[i].timer)
            this.reload.timers.splice(i, 1)
            console.log(`[Timer] Cleared timer with ID ${args[1]}`)
            return
          }
        }
        console.log(`[Timer] No timer found with ID ${args[1]}`)
        return
      }
    }

    function startTimer (delay, message) {
      const timer = setInterval(function() {
        bot.chat(message)
      }, delay)

      const data = {
        timer: timer,
        delay: delay,
        message: message
      }
      return data
    }
  }
}