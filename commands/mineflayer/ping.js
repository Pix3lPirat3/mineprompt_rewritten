module.exports = {
  command: 'ping',
  usage: 'ping [player]',
  description: 'Gets the player\'s ping according to the tablist.',
  requires: {
    entity: true
  },
  author: 'Pix3lPirat3',
  autocomplete: () => Object.keys(bot.players),
  execute: function(sender, command, args) {
    if(!args[0]) return sender.reply(`[Ping] Your ping is ${bot.players[bot.username].ping}`);
    let target = bot.players[args[0]];
    if(!target) return sender.reply(`[Ping] The player ${args[0]} is not online.`);
    return sender.reply(`[Ping] ${target.username}'s ping is ${target.ping}`)
  }
}