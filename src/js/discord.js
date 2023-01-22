const { Client, Events, GatewayIntentBits } = require('discord.js');
const discord_config = require('./../storage/discord.json');


let discord;

function startDiscord() {  
  if(!discord_config.enabled && discord_config.token) return console.log(`[Discord] Discord token set, integration is disabled. (discord.json)`);

  discord = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

  discord.once(Events.ClientReady, c => {
    console.log(`Ready! Logged in as ${c.user.tag}`);
  });

  discord.on('messageCreate', async function(message) {
    let msg = message.content;
    if(!msg.startsWith('!')) return;

    const args = message.content.trim().split(/ +/g);
    const cmd = args.shift().substring(1).toLowerCase();

    let command_module = commander.getCommand(cmd);
    if (!command_module) {
      let close_matches = commander.getCloseMatches(cmd, 3);
      if (!close_matches.length) return await message.channel.send('[Console] Unknown command. Type "help" for help.');
      return await message.channel.send(`[Console] Did you mean: ${close_matches.join(', ')}`);
    }

    if (!bot && command_module.requiresEntity) return await message.channel.send(`[${command_module.command}] This command requires the bot to be spawned.`);
    
    /*command_module.execute({type: 'discord', author: message.author, reply: async function(arguments) {
      await message.channel.send(arguments);
    }}, cmd, args)
    */

    command_module.execute({type: 'discord', author: message.author, reply: commander.reply.toDiscord}, cmd, args)


  });

  discord.login(discord_config.token);
}

startDiscord();