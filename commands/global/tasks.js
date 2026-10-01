'use strict';

module.exports = {
  command: 'tasks',
  aliases: ['activities'],
  usage: 'tasks [stop <id>|stop-all]',
  description: 'List or stop active background work.',
  requires: { console: true },
  autocomplete: () => ['stop', 'stop-all'],

  execute(sender, command, args, { activities }) {
    const action = args[0]?.toLowerCase();
    if (!action) {
      const running = activities.snapshot();
      if (!running.length) return sender.reply('[Tasks] No background work is running.');
      return sender.reply(running.map((entry) => `${entry.id}: ${entry.label}${entry.detail ? ` - ${entry.detail}` : ''}`).join('\n'));
    }
    if (action === 'stop-all') {
      activities.stopAll();
      return sender.reply('[Tasks] Stopped all background work.');
    }
    if (action === 'stop' && args[1]) {
      return sender.reply(activities.stop(args[1]) ? `[Tasks] Stopped ${args[1]}.` : `[Tasks] ${args[1]} was not running.`);
    }
    return sender.reply(`[Tasks] Usage: ${this.usage}`);
  }
};
