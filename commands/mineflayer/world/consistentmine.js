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

    function getRemainingDurability(item) {
      let durabilityMax = bot.registry.itemsByName[item.name].maxDurability

      // 1.12 and below does not have nbt.Damage, use bot.heldItem.metadata
      let durabilityUsed = bot.registry.version['<']('1.13') ? bot.heldItem.metadata : item.nbt.value.Damage.value;
      return durabilityMax - durabilityUsed;
    }

    // TODO: Flag to not break tool - to switch tools before/after breaking - for whitelist/blacklist

    let reloader = this.reload;
    if (!args.length) return sender.reply(`[${this.command}] ${this.usage}`);

    if(args[0] === 'start') {
      if(reloader.isDigging) return sender.reply(`[${this.command}] You must first stop the miner.`);
      sender.reply(`[${this.command}] Now running a consistentminer`)
      reloader.isDigging = true;
      dig();
    }

    if(args[0] === 'stop') return reloader.isDigging = false;

    async function dig() {
        if (!reloader.isDigging) return
        const block = bot.blockAtCursor(4);
        if (!block) {
            await sleep(100);
        } else {

          var safePickaxes = bot.inventory.items().filter(i => i.name.includes('pickaxe') && getRemainingDurability(i) > 10);
          if(!safePickaxes.length) return; // Stop the process, there are no more SAFE pickaxes

          if(!safePickaxes.includes(bot.heldItem)) {
            await bot.equip(safePickaxes[0])
          }

          await bot.dig(block, "ignore", "raycast");
        }
        
        dig()
    }



  }
}