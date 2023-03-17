const parseArgs = require('minimist')

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
    let version = opts.v || opts.version;
    if (!version) version = undefined;
    let authentication = opts.a || opts.auth; // (Default: true)
    if (!authentication) console.log('You can specify authentication with -a or --auth (-a=true/false)')
      // Converting the "String" passed from the input to a Boolean (There must be a better way..)
    if (authentication === 'false' || authentication === '0') authentication = false; // Convert to Boolean
    if (authentication === 'true' || authentication === '1' || authentication == undefined) authentication = true; // Convert to Boolean

    // TODO: Allow all flags passable to mineflayer
    /* 
      opts.authentication = opts.authentication || opts.auth || opts.a
      let options = opts;

    */

    let options = {
      username: username,
      host: host,
      port: port,
      version: version,
      auth: authentication ? 'microsoft' : undefined,
      skipValidation: !authentication,
      profilesFolder: path.join(minecraftFolderPath, 'mineprompt-cache', username.toUpperCase()),
      fakeHost: opts.fakeHost || host, // Used on servers with TCPShield
      onMsaCode: function(data) {
        console.log(`
          [[b;;]Microsoft Authentication:]
          Use the code "[[b;;]${data.user_code}]" on ${data.verification_uri} to authenticate your account.

          If you don't want to authenticate then add '-a false' (or --auth false)
          `.split('\n').map(line => line.trim()).join('\n'))
      }
    }

    let bedrock_edition = opts.b || opts.bedrock;

    console.log(`Connecting ${username} to ${host}:${port}`)



    if(bedrock_edition) return bedrock.startClient(options)
    return mineflayer.startClient(options);

  }
}