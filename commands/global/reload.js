'use strict';

module.exports = {
  command: 'reload',
  usage: 'reload <commands|renderer|all>',
  description: 'Reload command modules or the graphical interface without closing the application.',
  capability: 'status',
  risk: 'standard',
  requires: { console: true },
  autocomplete: () => ['commands', 'renderer', 'all'],

  execute(sender, command, args, { commands, requestRendererReload }) {
    const scope = String(args[0] || '').toLowerCase();
    if (!['commands', 'renderer', 'all'].includes(scope) || args.length !== 1) return sender.reply(`[Reload] Usage: ${this.usage}`);
    if (scope === 'commands' || scope === 'all') commands.reload();
    if (scope === 'renderer' || scope === 'all') requestRendererReload();
    return sender.reply(`[Reload] ${scope === 'all' ? 'Commands and renderer' : scope[0].toUpperCase() + scope.slice(1)} reload requested.`);
  }
};
