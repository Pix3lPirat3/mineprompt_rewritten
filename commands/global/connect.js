'use strict';

const { parseArgs } = require('node:util');
const { authenticationMode } = require('../../src/main/connection-service');

module.exports = {
  command: 'connect',
  aliases: ['conn'],
  description: 'Connect to a Minecraft Java server.',
  usage: 'connect --username <name> --host <server> [--port 25565] [--version <version>] [--auth microsoft|offline] [--fake-host <host>]',

  async execute(sender, command, args, { connections }) {
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
          'fake-host': { type: 'string' }
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
      auth = authenticationMode(values.auth);
    } catch (error) {
      return sender.reply(`[Connect] ${error.message}`);
    }

    const details = {
      username,
      host,
      port,
      auth,
      fakeHost: values['fake-host'] || ''
    };
    if (values.version) details.version = values.version;

    try {
      return await connections.connect(details, sender.reply);
    } catch (error) {
      return sender.reply(`[Connect] ${error.message}`);
    }
  }
};

module.exports.parseAuthentication = authenticationMode;
