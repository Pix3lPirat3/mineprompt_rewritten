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
  autocomplete: () => ['start', 'stop'],
  author: 'Pix3lPirat3',
  execute: function(sender, command, args) {

    // TODO: Flag to not break tool
    // TODO: flag to switch tools before/after breaking

    let reloader = this.reload;
    if (!args.length) return sender.reply(`[${this.command}] ${this.usage}`);
    if(reloader.isDigging) return sender.reply(`[${this.command}] You must first stop the miner.`);

    if(args[0] === 'start') {
      sender.reply(`[${this.command}] Now running a consistentminer`)
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