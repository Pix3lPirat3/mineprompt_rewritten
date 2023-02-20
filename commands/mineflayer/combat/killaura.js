const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

module.exports = {
  command: 'killaura',
  usage: 'killaura [stop || whitelist {Array[name]}] [delay]',
  description: 'Attack mobs around you',
  requires: {
    entity: true
  },
  reload: {
    pre: function() {
      if(this.killer) sender.reply(`[Reload] [Killaura] Stopping the recursive function.`);
      this.killer = true;
    },
    post: function() {

    }
  },
  author: 'Pix3lPirat3',
  execute: function(sender, command, args) {

    let reloader = this.reload;
    let swing_delay = args[1] || 500;

    if(args[0] === 'kill' || args[0] === 'stop') {
      reloader.killer = true;
    }

    async function killaura(whitelist) {
      if(reloader.killer || !bot?.entity) return sender.reply('[Killaura] Killing the recursive function');

      let nearest = bot.nearestEntity((e) => (whitelist.includes(e.name) || whitelist.includes('*')) && bot.entity.position.distanceTo(e.position) < 3.5);      
      if(!nearest) {
        await delay(50);
        return killaura(whitelist);
      }

      //let entityAtCursor = bot.entityAtCursor(3.5);
      //if(!entityAtCursor?.id !== nearest.id) await bot.lookAt(nearest.position, true);

      await bot.attack(nearest)
      await delay(swing_delay)

      return killaura(whitelist)

    }

    if(args.length === 0 || args[0] === '*' || args[0] === 'all') return killaura(['*'])

    let whitelist = args[0].split(',');
    sender.reply('killaura whitelist:', whitelist)
    return killaura(whitelist)
  }
}