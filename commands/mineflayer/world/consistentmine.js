const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = {
  command: 'consistentmine',
  usage: 'consistentmine <start/stop>',
  description: 'Consistently mine in one location.',
  requires: {
    entity: true
  },
  reload: {
    isDigging: false,
    pre: function() {
      this.isDigging = false;
    }
  },
  author: 'Pix3lPirat3',
  execute: function(sender, command, args) {
    let reloader = this.reload;
    if (!args.length) return sender.reply(`[${this.command}] ${this.usage}`);

    if(args[0] === 'start') {
      sender.reply(`[${this.command}] ${this.usage}`)
      reloader.isDigging = true;
      dig();
    }

    if(args[0] === 'stop') return reloader.isDigging = false;

    async function dig() {
        if (!reloader.isDigging) return
        const block = bot.blockAtCursor(3.5);
        if (!block) {
            await sleep(100);
        } else {
            await bot.dig(block, "ignore", "raycast");
        }
        
        dig()
    }

  }
}