module.exports = {
  command: 'sneak',
  usage: 'sneak',
  description: 'Toggle the player sneaking',
  requiresEntity: true,
  author: 'Pix3lPirat3',
  execute: function(sender, command, args) {
    let isSneaking = bot.getControlState('sneak')
    bot.setControlState('sneak', !isSneaking)
    sender.reply(`[Sneak] Player is sneaking: ${!isSneaking}`)
  }
}