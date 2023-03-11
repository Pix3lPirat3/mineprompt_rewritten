let createBot;
let pathfinder, Movements;
let ChatMessage;

    // pos: Vec3
    // {x: 145, y: 102, z: 30}
    function getMapAt(pos, base64) {
      let map_entities = Object.values(bot.entities).filter(ent => ent.name === 'item_frame');
      let index = map_entities.findIndex(ent => ent.position.equals(pos));
      console.log('Index:', index)
      if(!index < 0) return console.log(`There is no map entity at that position.`);
      let map = Object.values(bot.mapDownloader.maps)[index];
      return new Buffer(map).toString('base64');
    }

let mineflayer = {
  startClient: async function(options) {
    commander.setCommands('mineflayer');
    if(!createBot) {
      createBot = require('mineflayer').createBot;
      let pathfinder_module = require('mineflayer-pathfinder');

      if(!pathfinder) pathfinder = pathfinder_module.pathfinder;
      if(!Movements) Movements = pathfinder_module.Movements;
    }

    if (bot) await bot.end();
    interface.reset();
    
    //const { mapDownloader } = require('mineflayer-item-map-downloader')

    bot = await createBot(options);

    ChatMessage = require('prismarine-chat')(bot.registry)

    //options["mapDownloader-saveToFile"] = false; // Disable map saving to file
    
    //bot.loadPlugin(mapDownloader) // load it before spawning to get all maps

    bot.lastOptions = options;

    /*(new_map, { name, png, id })
    Emitted by the mapSaver and the bot when a new map was detected.
    Parses an object when emitted:
    name - String. The name that would be given to this map.
    png - Buffer. The png Buffer of the created map.
    id - Number. The map id off the map.
    */
    /*
    bot.on('new_map', function(map) {
      let maps = Object.values(bot.entities).filter(ent => ent.name === 'item_frame');
      let map_entity = maps[map.id];
      if(!map_entity) return console.log(`The map_entity for ID ${map.id} was not found.`)
      console.log('map_entity:', map_entity)
      let pos = map_entity.position;
      let base64 = new Buffer(map.png).toString('base64')
      $('html').prepend(`<img src="data:image/png;base64, ${base64}" alt="Minecraft Map" />`)

      //console.log(base64);
    })
    */

    // Pathfinder Defaults
    bot.loadPlugin(pathfinder)
    bot.once('spawn', function() {
      interface.resetRuntime();
      const defaultMove = new Movements(bot)
      defaultMove.allow1by1towers = false;
      defaultMove.canDig = false;
      bot.pathfinder.setMovements(defaultMove)
    })

    bot.once('login', async function() {
      interface.startSession(bot.username);
      if(i18n.__('mineflayer.events.login')) console.log(i18n.__('mineflayer.events.login', { bot: bot }));

      // Update where an option other than the bot's username is set
      const stmt = await database.db.prepare('UPDATE accounts SET username = ? WHERE username = ?;')
      await stmt.bind({ 1: bot.username, 2: options.username })
      return await stmt.get();

    })

    bot.once('spawn', function() {
      interface.startRuntime();
      if(i18n.__('mineflayer.events.spawn')) console.log(i18n.__('mineflayer.events.spawn', { bot: bot }));

      // These events are moved inside the 'spawn' event so UI events are registered at the same time
      // UI Event : Position
      let pos_str = Object.values(bot.entity.position.floored()).join(', ')
      interface.setPosition(pos_str);
      bot.on('move', function() {
        if (!bot?.entity) return;
        pos_str = Object.values(bot.entity.position.floored()).join(', ');
        interface.setPosition(pos_str);
      })

      // UI Event : Health
      bot.on('health', function() {
        interface.setHealth(bot.health);
        interface.setHunger(bot.food);
      })

    })

    // UI Event : Session End : Empty Health, Skin, Username
    bot.once('end', function() {
      if(i18n.__('mineflayer.events.spawn')) console.log(i18n.__('mineflayer.events.end', { bot: bot, username: bot?.username || options.username }));
      interface.reset();
      interface.stopRuntime();
      bot = null;
    })

    // UI Event : Entity Effects
    let potionEffectsTimer = setInterval(function() {
        interface.resetPotionEffects();
        if (!bot) clearInterval(potionEffectsTimer);
        if(!bot?.entity) return;
        // [{"effect": "Speed", "displayName": "Speed"}, {"effect": "JumpBoost", "displayName": "Jump Boost"}]
        interface.setPotionEffects(Object.values(bot.entity.effects).map(e => bot.registry.effects[e.id]).map(effect => ({ effect: effect.name, displayName: effect.displayName })))
      }, 1000) // Every 1s

    bot.once('end', function() {
      clearInterval(potionEffectsTimer)
    })

    // TODO : Add a setting for colors on/off


    let chat_use_colors = i18n.__('mineflayer.events.message.colors');
    bot.on('message', function(jsonMsg, position) {
      if(position === 'game_info') return;
      if(!chat_use_colors && jsonMsg.getText()) return console.log(i18n.__('mineflayer.events.message.format', { message: toTerminal(jsonMsg.getText()) }));
      console.log(i18n.__('mineflayer.events.message.format', { message: jsonMsg.toAnsi(bot.registry.language, {
        '§0': '\u001b[38;5;240m',
        '§1': '\u001b[38;5;19m',
        '§2': '\u001b[38;5;34m',
        '§3': '\u001b[38;5;37m',
        '§4': '\u001b[38;5;124m',
        '§5': '\u001b[38;5;127m',
        '§6': '\u001b[38;5;214m',
        '§7': '\u001b[38;5;250m',
        '§8': '\u001b[38;5;245m',
        '§9': '\u001b[38;5;63m',
        '§a': '\u001b[38;5;83m',
        '§b': '\u001b[38;5;87m',
        '§c': '\u001b[38;5;203m',
        '§d': '\u001b[38;5;207m',
        '§e': '\u001b[38;5;227m',
        '§f': '\u001b[97m',
        '§l': '\u001b[1m',
        '§o': '\u001b[3m',
        '§n': '\u001b[4m',
        '§m': '\u001b[9m',
        '§k': '\u001b[6m',
        '§r': '\u001b[0m'
      })}));
    })

    bot.on('error', function(error) {
      switch(error.code) {
        case "EAI_AGAIN":
          console.log(`EAI_AGAIN - a network connectivity error or proxy related error`)
          break;
        case "ENOTFOUND":
          console.log;

          break;
        default:
          console.log(error)
          break;
      }
      console.log('ERR CODE:', error.code)
    });
    bot.on('kicked', console.log);

    // Chat Listener for Commands
    bot.on('chat', function(sender, message) {
      //TODO: config.commands.chat.enabled
      //TODO: config.commands.chat.masters
      if(sender === bot.username) return;
      if (!message.startsWith('!')) return;
      const args = message.trim().split(/ +/g);
      const command = args.shift().substring(1)//.toLowerCase();
      let command_module = commander.getCommand(command);
      if (!command_module) return bot.chat(`/msg ${sender} ${i18n.__('commander.unknown_command')}`);
      if (!bot && command_module.requires?.entity) return console.log(i18n.__('commander.requires_entity', { command: command }));
      if(command_module.requires?.console) return bot.chat(`/msg ${sender} ${i18n.__('commands.generic.console_only')}`);
      command_module.execute({type: 'player', player: sender, reply: commander.reply.toPlayer}, command, args);
    })

    bot._client.on('resource_pack_send', (data) => {
      bot._client.write('resource_pack_receive', { // This tells the server that the client accepted the resource pack.
        hash: "Resourcepack", //Specific to Rust v2, IGNORES the first texture-pack prompt the server sends in the lobby
        result: 3
      })
      bot._client.write('resource_pack_receive', { // This tells the server the client successfully loaded the resource pack.
        hash: "Resourcepack", //See above
        result: 0
      })
    })

  },
  reload: function() {
    if(bot) {
      bot.pathfinder?.stop();
      bot.stopDigging();
      bot.clearControlStates();
    }
  }
}