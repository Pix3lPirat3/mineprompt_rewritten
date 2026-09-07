'use strict';

function enabled(value) {
  if (value === 'enable' || value === 'enabled' || value === 'true') return true;
  if (value === 'disable' || value === 'disabled' || value === 'false') return false;
  throw new TypeError('Use "enable" or "disable".');
}

module.exports = {
  command: 'settings',
  aliases: ['config'],
  usage: 'settings [resource-packs accept|deny | remote-commands enable|disable | remote-player list|add|remove <name>]',
  description: 'Review or change MinePrompt security preferences.',
  requires: { console: true },
  autocomplete: () => ['resource-packs', 'remote-commands', 'remote-player', 'accept', 'deny', 'enable', 'disable', 'list', 'add', 'remove'],

  async execute(sender, command, args) {
    const resourcePacks = await database.getSetting('resourcePackPolicy') || 'deny';
    const remoteCommands = await database.getSetting('remoteCommandsEnabled') === true;
    const remotePlayers = await database.getSetting('remoteCommandPlayers') || [];
    if (!args.length) {
      return sender.reply([
        '[Settings]',
        `Resource packs: ${resourcePacks}`,
        `Remote commands: ${remoteCommands ? 'enabled' : 'disabled'}`,
        `Allowed remote players: ${remotePlayers.length ? remotePlayers.join(', ') : 'none'}`
      ].join('\n'));
    }

    const section = args[0].toLowerCase();
    if (section === 'resource-packs') {
      const policy = args[1]?.toLowerCase();
      if (!['accept', 'deny'].includes(policy)) return sender.reply('[Settings] Resource packs must be "accept" or "deny".');
      await database.setSetting('resourcePackPolicy', policy);
      return sender.reply(`[Settings] Resource packs will be ${policy === 'accept' ? 'accepted' : 'declined'}.`);
    }

    if (section === 'remote-commands') {
      try {
        const value = enabled(args[1]?.toLowerCase());
        await database.setSetting('remoteCommandsEnabled', value);
        return sender.reply(`[Settings] Remote commands ${value ? 'enabled' : 'disabled'}.`);
      } catch (error) {
        return sender.reply(`[Settings] ${error.message}`);
      }
    }

    if (section === 'remote-player') {
      const action = args[1]?.toLowerCase() || 'list';
      if (action === 'list') return sender.reply(`[Settings] Allowed remote players: ${remotePlayers.length ? remotePlayers.join(', ') : 'none'}.`);
      const username = args[2]?.trim();
      if (!username) return sender.reply('[Settings] A player name is required.');
      if (action === 'add') {
        if (!remotePlayers.some((name) => name.toLowerCase() === username.toLowerCase())) remotePlayers.push(username);
      } else if (action === 'remove') {
        const index = remotePlayers.findIndex((name) => name.toLowerCase() === username.toLowerCase());
        if (index >= 0) remotePlayers.splice(index, 1);
      } else {
        return sender.reply('[Settings] Use "list", "add", or "remove".');
      }
      await database.setSetting('remoteCommandPlayers', remotePlayers);
      return sender.reply(`[Settings] Allowed remote players: ${remotePlayers.length ? remotePlayers.join(', ') : 'none'}.`);
    }

    return sender.reply(`[Settings] Usage: ${this.usage}`);
  }
};
