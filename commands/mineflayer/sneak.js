'use strict';

function desiredState(value, current) {
  if (value === undefined || value === 'toggle') return !current;
  if (['on', 'true', 'enable'].includes(value)) return true;
  if (['off', 'false', 'disable'].includes(value)) return false;
  throw new TypeError('Use on, off, or toggle.');
}

module.exports = {
  command: 'sneak',
  usage: 'sneak [on|off|toggle]',
  description: 'Set or toggle sneaking.',
  requires: { entity: true },
  autocomplete: () => ['on', 'off', 'toggle'],

  execute(sender, command, args) {
    if (args.length > 1) return sender.reply(`[Sneak] Usage: ${this.usage}`);
    try {
      const enabled = desiredState(args[0]?.toLowerCase(), bot.getControlState('sneak'));
      bot.setControlState('sneak', enabled);
      return sender.reply(`[Sneak] ${enabled ? 'Enabled' : 'Disabled'}.`);
    } catch (error) {
      return sender.reply(`[Sneak] ${error.message}`);
    }
  }
};
