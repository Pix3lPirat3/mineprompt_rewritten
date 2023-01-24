let createClient;

let bedrock = {
  startClient: async function(options) {
    if(!createClient) createClient = require('bedrock-protocol').createClient;
    console.log('Bedrock Options:', options)
    options.offline = true;
    try {
      console.log('TRYING..')
      // bot = 
      await createClient({
        host: '136.243.102.82',
        port: 19132,
        skipPing: true,
        offline: true,
        username: 'Orange'
      });
      //console.log(bot)
      //bot.on('error', console.log)
      console.log('DEAD.')
    } catch(e) {
      console.log(e)
    }

  }
}