const parseArgs = require('minimist');
let { supportedVersions, testedVersions } = require('mineflayer/lib/version')

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

    let opts = parseArgs(args);

    // NOTE : When using shorthand (-h) only one `-` is needed, when using longhand (--host) two are needed.
    let username = opts.u || opts.username;
    if (!username) return console.log('You must specify a username with -u or --username')
    let host = opts.h || opts.host;
    if (!host) return console.log('You must specify a host with -h or --host')
    let port = opts.p || opts.port;
    if (!port) port = 25565;
    let version = String(opts.v || opts.version);
    if (!version) version = undefined;

    if(version && !supportedVersions.includes(version) && !testedVersions.includes(version)) {
      return console.log(`[[b;#999999;]Mine][[b;steelblue;]Prompt] » The version [[b;indianred;]${version}] is [[b;indianred;]unsupported], try a supported version.\n[[;steelblue;]Supported Versions:] ${supportedVersions.join(', ')}\n[[;steelblue;]Tested Versions:] ${testedVersions.join(', ')}`)
    }

    let authentication = opts.a || opts.auth; // (Default: true)
    if(typeof authentication !== 'boolean') console.log(`[[b;#999999;]Mine][[b;steelblue;]Prompt] » [[b;indianred;]Auth] should be passed as [[b;indianred;]true] or [[b;indianred;]false]`)

    // TODO: Allow all flags passable to mineflayer

    let options = {
      username: username,
      host: host,
      port: port,
      version: version,
      auth: (authentication === true) ? 'microsoft' : 'offline',
      skipValidation: !authentication,
      profilesFolder: path.join(minecraftFolderPath, 'mineprompt-cache', username.toUpperCase()),
      fakeHost: opts.fakeHost || host, // Used on servers with TCPShield
      onMsaCode: function(data) {
        console.log(`
          [[b;indianred;]Microsoft Authentication:]
          Use the code "[[b;indianred;]${data.user_code}]" on [[b;indianred;]${data.verification_uri}] to authenticate your account.

          If you want to join an [[b;indianred;]offline-mode] server add [[b;indianred;]-a false] to your prompt.
          `.split('\n').map(line => line.trim()).join('\n'))
      },
      logErrors: false
    }

    // TODO: Switch to -e or -edition (Java, Bedrock)
    let bedrock_edition = opts.b || opts.bedrock;

    console.log(`[[b;#999999;]Mine][[b;steelblue;]Prompt] » Opening a connection to [[b;seagreen;]${host}:${port}]`)
    console.debug(`[Connect] Player: ${username}, Version: ${version}, Auth: ${authentication}`)

    database.addConnection(args.join(' '))

    if(bedrock_edition) return bedrock.startClient(options)
    return mineflayer.startClient(options);

  }
}