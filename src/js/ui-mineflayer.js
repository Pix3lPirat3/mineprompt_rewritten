let { createBot } = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const { GoalNear } = require('mineflayer-pathfinder').goals
var v = require('vec3');

let mineflayer = {
  startClient: async function(options) {
    if (bot) await bot.end();
    interface.reset();

    options.skipPreview = true;

    bot = await createBot(options);

    bot.lastOptions = options;

    // Pathfinder Defaults
    bot.loadPlugin(pathfinder)
    bot.once('spawn', function() {
      interface.resetRuntime();
      const defaultMove = new Movements(bot)
      defaultMove.allow1by1towers = false;
      defaultMove.canDig = false;
      bot.pathfinder.setMovements(defaultMove)
    })

    bot.on('login', function() {
      interface.startSession(bot._client.username); // CHECK: Is username avaliable yet?
      console.log('[Console] Logged into the server..');
    })

    bot.once('spawn', function() {
      console.log('[Console] Spawned on the server..');
      interface.startRuntime();

      // These events are moved inside the 'spawn' event so UI events are registered at the same time
      // UI Event : Position
      let pos_str = Object.values(bot.entity.position.floored()).join(', ')
      interface.setPosition(pos_str);
      bot.on('move', function() {
        if (!bot.entity) return;
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
      console.log(`[Console] ${bot.username || options.username} has disconnected from the server.`);
      interface.reset();
      interface.stopRuntime();
      bot = null;
    })

    // UI Event : Entity Effects
    let potionEffectsTimer = setInterval(function() {
        interface.resetPotionEffects();
        if (!bot) clearInterval(potionEffectsTimer);
        if(!bot.entity) return;
        // [{"effect": "Speed", "displayName": "Speed"}, {"effect": "JumpBoost", "displayName": "Jump Boost"}]
        interface.setPotionEffects(Object.values(bot.entity.effects).map(e => bot.registry.effects[e.id]).map(effect => ({ effect: effect.name, displayName: effect.displayName })))
      }, 1000) // Every 1s

    bot.once('end', function() {
      clearInterval(potionEffectsTimer)
    })

    // TODO : Add a setting for colors on/off
    bot.on('message', function(jsonMsg, position) {
      console.log(toTerminal(jsonMsg.toMotd()))
    })

    // Thank you for solving my toAnsi issue nea
    const defaultAnsiCodes = {
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
    }

    let toTerminal = function(message, codes = defaultAnsiCodes) {
      for (const k in codes) {
        message = message.replace(new RegExp(k, 'g'), codes[k])
      }
      const hexRegex = /§#?([a-fA-F\d]{2})([a-fA-F\d]{2})([a-fA-F\d]{2})/
      while (message.search(hexRegex) !== -1) {
        // Stolen from https://stackoverflow.com/questions/5623838/rgb-to-hex-and-hex-to-rgb
        const hexCodes = hexRegex.exec(message)
        // Iterate over each hexColorCode match (§#69420, §#ABCDEF, §#A1B2C3)
        const red = parseInt(hexCodes[1], 16)
        const green = parseInt(hexCodes[2], 16)
        const blue = parseInt(hexCodes[3], 16)
        // ANSI from https://gist.github.com/fnky/458719343aabd01cfb17a3a4f7296797#rgb-colors
        message = message.replace(hexRegex, `\u001b[38;2;${red};${green};${blue}m`)
      }
      return codes['§r'] + message + codes['§r']
    }

    bot.on('error', console.log);
    bot.on('kicked', console.log);

    // Chat Listener for Commands
    bot.on('chat', function(sender, message) {
      if(sender === bot.username) return;
      if (!message.startsWith('!')) return;

      const args = message.trim().split(/ +/g);
      const command = args.shift().substring(1).toLowerCase();

      let command_module = commander.getCommand(command);
      if (!command_module) return bot.chat(`/msg ${sender} Unknown command. Type "help" in console for help.`);

      if (!bot && command_module.requiresEntity) return console.log(`[${command_module.command}] This command requires the bot to be spawned.`)
      // Passed Checks : Execute Command

      command_module.execute({type: 'player', player: sender, reply: commander.reply.toPlayer}, command, args)

    })

  }
}