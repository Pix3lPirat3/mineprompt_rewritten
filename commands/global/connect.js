'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const { parseArgs } = require('node:util');
const minecraftFolderPath = require('minecraft-folder-path');

function parseAuthentication(value) {
  if (value === undefined || value === 'true' || value === 'microsoft') return 'microsoft';
  if (value === 'false' || value === 'offline') return 'offline';
  throw new Error('Authentication must be "microsoft" or "offline".');
}

module.exports = {
  command: 'connect',
  aliases: ['conn'],
  description: 'Connect to a Minecraft Java server.',
  usage: 'connect --username <name> --host <server> [--port 25565] [--version <version>] [--auth microsoft|offline]',

  async execute(sender, command, args) {
    if (bot) {
      return sender.reply(`[Connect] Already connected as ${bot.username || 'a client'}. Disconnect first.`);
    }

    let values;
    try {
      ({ values } = parseArgs({
        args,
        strict: true,
        allowPositionals: false,
        options: {
          username: { type: 'string', short: 'u' },
          auth: { type: 'string', short: 'a' },
          host: { type: 'string', short: 'h' },
          port: { type: 'string', short: 'p' },
          version: { type: 'string', short: 'v' },
          fakeHost: { type: 'string' }
        }
      }));
    } catch (error) {
      return sender.reply(`[Connect] ${error.message}\nUsage: ${this.usage}`);
    }

    const username = values.username?.trim();
    const host = values.host?.trim();
    const port = Number(values.port ?? 25565);
    if (!username) return sender.reply('[Connect] A username is required (-u or --username).');
    if (!host || /\s|\//u.test(host) || /^[^:]+:\d+$/u.test(host)) return sender.reply('[Connect] Enter a hostname or IP address without a protocol or port.');
    if (!Number.isInteger(port) || port < 1 || port > 65535) return sender.reply('[Connect] Port must be an integer from 1 to 65535.');

    let auth;
    try {
      auth = parseAuthentication(values.auth);
    } catch (error) {
      return sender.reply(`[Connect] ${error.message}`);
    }

    const cachePrefix = username.toUpperCase().replace(/[^A-Z0-9@._-]/gu, '_').slice(0, 64) || 'ACCOUNT';
    const cacheHash = crypto.createHash('sha256').update(username.toLowerCase()).digest('hex').slice(0, 8);
    const connectionOptions = {
      username,
      accountUsername: username,
      host,
      port,
      auth,
      profilesFolder: path.join(minecraftFolderPath, 'mineprompt-cache', `${cachePrefix}-${cacheHash}`),
      fakeHost: values.fakeHost || host,
      logErrors: false,
      onMsaCode(data) {
        sender.reply(`[Microsoft] Open ${data.verification_uri} and enter code ${data.user_code}.`);
      }
    };
    if (values.version && values.version.toLowerCase() !== 'auto') connectionOptions.version = values.version;

    const storedCommand = args.join(' ');
    await database.addConnection(storedCommand);
    sender.reply(`[Connect] Opening ${host}:${port} as ${username} (${auth}).`);
    return mineflayer.startClient(connectionOptions);
  }
};

module.exports.parseAuthentication = parseAuthentication;
