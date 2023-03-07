const autoClicker = {
  running: undefined,
  click_interval: 1000,
  blacklist: ['experience_orb'],
  start: () => {
    if (autoClicker.running) return
    autoClicker.running = setInterval(async function () {
      const entity = bot.entityAtCursor()
      if (!entity || autoClicker.blacklist.includes(entity.name)) return bot.swingArm()
      bot.attack(entity, true)
    }, autoClicker.click_interval)
  },
  stop: () => {
    autoClicker.running = clearInterval(autoClicker.running)
  }
}

module.exports = {
  command: 'autoclicker',
  aliases: ['clicker'],
  usage: 'autoclicker <start/stop/speed> [interval {1000ms}]',
  description: 'autoclicker quick-release (will be worked on more to add flags)',
  requires: {
    entity: true
  },
  autocomplete: () => ['start', 'stop', 'speed'],
  author: 'Pix3lPirat3',
  execute: function(sender, command, args) {
      if(!args.length) return sender.reply(`[${this.cmd}] ${this.usage}`);

      let interval = args[1] || 1000;

      if(args[0] === 'start') {
        if(autoClicker.running) return sender.reply('[Clicker] The autoclicker is already running.');
        sender.reply(`[Clicker] Now swinging at ${autoClicker.click_interval}ms speed.`);
        autoClicker.start();
      }

      if(args[0] === 'stop') {
        if(!autoClicker.running) return sender.reply('[Clicker] The autoclicker is already off.');
        autoClicker.stop();
      }
      if(args[0] === 'speed') {
        if(args.length === 1) return sender.reply(`[Clicker] The clicker is running at: ${autoClicker.click_interval}`);
        let new_speed = args[1];
        autoClicker.click_interval = args[1];
        if(autoClicker.running) {
          autoClicker.stop();
          sender.reply(`[Clicker] Now swinging at ${autoClicker.click_interval}ms speed.`);
          autoClicker.start();
        }
      }

  }
}