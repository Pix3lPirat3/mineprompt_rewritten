module.exports = {
  command: 'simpleClick',
  usage: 'simpleClick <slot>',
  //aliases: ['clickmenu', 'inventoryclick'],
  description: 'Click a slot of a menu',
  requires: {
    entity: true,
    console: true
  },
  author: 'Pix3lPirat3',
  execute: function(sender, command, args) {
    if(!bot.currentWindow) return sender.reply(`[Window] You do not have a window open.`);

    let inventory_items = bot.currentWindow.containerItems();
    if(!inventory_items.length) return sender.reply(`[window] There are no items in your open window.`);

    let target = args[0];
    if(isNumber(args[0])) {
      let slot = args[0];
      let clickType = args[1] || 'left';

      let item = bot.currentWindow.slots[slot]?.name || 'AIR';

      console.log(`[simpleClick] Clicking on ${item} with a ${clickType} click`);

      if(clickType === 'left') bot.simpleClick.leftMouse(slot);
      if(clickType === 'right') bot.simpleClick.rightMouse(slot);
    }



    function isNumber(n) { return !isNaN(parseFloat(n)) && !isNaN(n - 0) }


  }
}