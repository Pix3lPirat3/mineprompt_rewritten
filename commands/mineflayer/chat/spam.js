'use strict';

let nextId = 1;

module.exports = {
  command: 'spam',
  aliases: ['repeat'],
  usage: 'spam list | spam start <interval-ms> <message> | spam stop [id|all]',
  description: 'Repeat a chat message at a controlled interval.',
  requires: { entity: true, console: true },
  autocomplete: () => ['list', 'start', 'stop', 'all'],

  execute(sender, command, args, { activities, bot }) {
    const action = args[0]?.toLowerCase();
    const repeaters = () => activities.snapshot().filter((entry) => entry.id.startsWith('spam:'));
    if (!action) return sender.reply(`[Spam] Usage: ${this.usage}`);
    if (action === 'list') {
      const running = repeaters();
      if (!running.length) return sender.reply('[Spam] No repeaters are running.');
      return sender.reply(running.map((entry) => `${entry.id.slice(5)}. ${entry.detail}`).join('\n'));
    }
    if (action === 'start') {
      const delay = Number(args[1]);
      const message = args.slice(2).join(' ').trim();
      if (!Number.isInteger(delay) || delay < 1000 || delay > 3600000) return sender.reply('[Spam] Interval must be an integer from 1000 to 3600000 ms.');
      if (!message || message.length > 256) return sender.reply('[Spam] Message must contain 1 to 256 characters.');
      const id = nextId++;
      const activityId = `spam:${id}`;
      const handle = setInterval(() => {
        if (!bot.entity) return activities.stop(activityId);
        bot.chat(message);
      }, delay);
      activities.register(activityId, {
        label: `Chat repeater ${id}`,
        detail: `Every ${delay} ms - ${message}`,
        stop: () => clearInterval(handle)
      });
      return sender.reply(`[Spam] Started repeater ${id}.`);
    }
    if (action === 'stop') {
      const target = args[1]?.toLowerCase() || 'all';
      if (target === 'all') {
        for (const entry of repeaters()) activities.stop(entry.id);
        return sender.reply('[Spam] Stopped all repeaters.');
      }
      const id = Number(target);
      if (!Number.isInteger(id) || !activities.stop(`spam:${id}`)) return sender.reply(`[Spam] Repeater ${target} was not found.`);
      return sender.reply(`[Spam] Stopped repeater ${id}.`);
    }
    return sender.reply(`[Spam] Usage: ${this.usage}`);
  }
};
