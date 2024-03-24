let { parseArgs } = require('node:util');

const path = require('path');
const minecraftFolderPath = require('minecraft-folder-path');

module.exports = {
  version: '2.0.1',
  description: 'Used to connect a bot to a server',
  author: 'Pix3lPirat3',
  repository: 'http://mineprompt.com',
  usage: `Basic Usage:
  connect -u <username> -h <hostname> -p [port {25565}] -v [version {auto}] 

  Flags:
  -u | --username | Sets player username
  -h | --host | Server Hostname
  -p | --port | Server Port (Default: 25565)
  -v | --version | Server Version (Default: auto)
  -a | --auth | Authentication (default: true - Set "false" for offline-mode)
  --fakeHost | Fake Host (Used to bypass TCPShield "You cannot use the IP to connect")
  `,
  command: 'connect',
  aliases: ['conn'],
  execute: function(sender, command, args) {

    if (bot?.entity) {
      return console.log(`\n[[;indianred;]Connection Interrupted:]\nYou are already connected to a server with "${bot.username}"\nYou can disconnect this session with the "[[;steelblue;]disconnect]" command.\n`)
    }

    let opts = parseArgs({ args,
      strict: false,
      options: {
        username: {
          type: 'string',
          short: 'u'
        },
        auth: {
          type: 'string',
          short: 'a'
        },
        host: {
          type: 'string',
          short: 'h'
        },
        port: {
          type: 'string',
          short: 'p'
        },
        version: {
          type: 'string',
          short: 'v'
        },
        fakeHost: {
          type: 'string'
        }
      }
    }).values;

    // NOTE : When using shorthand (-h) only one `-` is needed, when using longhand (--host) two are needed.
    if (!opts.username) return console.log('You must specify a username with -u or --username')
    if (!opts.host) return console.log('You must specify a host with -h or --host')
    if (!opts.port) opts.port = 25565;

    let options = {
      username: opts.username,
      host: opts.host,
      port: opts.port,
      version: opts.version,
      auth: (opts.auth == 'true') ? 'microsoft' : 'offline',
      skipValidation: !opts.auth,
      profilesFolder: path.join(minecraftFolderPath, 'mineprompt-cache', opts.username.toUpperCase()),
      fakeHost: opts.fakeHost || opts.host, // Used on servers with TCPShield
      onMsaCode: function(data) {
        console.log(`
          [[b;indianred;]Microsoft Authentication:]
          Use the code "[[b;indianred;]${data.user_code}]" on [[b;indianred;]${data.verification_uri}] to authenticate your account.

          If you want to join an [[b;indianred;]offline-mode] server add [[b;indianred;]-a false] to your prompt.
          `.split('\n').map(line => line.trim()).join('\n'))
      },
      logErrors: false
    }

    console.log(`[[b;#999999;]Mine][[b;steelblue;]Prompt] » Opening a connection to [[b;seagreen;]${opts.host}:${opts.port}]`)
    console.debug(`[Connect] Player: ${opts.username}, Version: ${opts.version}, Auth: ${opts.auth}`)

    database.addConnection(opts.username, args.join(' '))

    return mineflayer.startClient(options);

  }
}