module.exports = {
  command: 'coinflip',
  usage: 'coinflip',
  description: 'Flip a coin and get the results.',
  requiresEntity: false,
  author: 'Pix3lPirat3',
  execute: function(sender, command, args) {

    let face = getFace();

    // Sender is console, respond in console
    if(sender !== true) return sender.reply(`[CoinFlip] I've flipped a coin and got ${face}`);    
    
    function getFace() {
      var r = Math.round(Math.random() * 1)
      return r ? 'heads' : 'tails';
    }
  }
}