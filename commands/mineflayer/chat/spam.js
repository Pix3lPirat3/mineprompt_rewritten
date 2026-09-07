'use strict';

const timers = new Map();
let nextId = 1;

function clearAll() {
  for (const timer of timers.values()) clearInterval(timer.handle);
  timers.clear();
}

module.exports = {
  command: 'spam',
  aliases: ['repeat'],
  usage: 'spam list | spam start <interval-ms> <message> | spam stop [id|all]',
  description: 'Repeat a chat message at a controlled interval.',
  requires: { entity: true, console: true },
  autocomplete: () => ['list', 'start', 'stop', 'all'],
  reload: { pre: clearAll },

  execute(sender, command, args) {
    const action = args[0]?.toLowerCase();
    if (!action) return sender.reply(`[Spam] Usage: ${this.usage}`);
    if (action === 'list') {
      if (!timers.size) return sender.reply('[Spam] No repeaters are running.');
      return sender.reply([...timers.entries()].map(([id, timer]) => `${id}. every ${timer.delay} ms — ${timer.message}`).join('\n'));
    }
    if (action === 'start') {
      const delay = Number(args[1]);
      const message = args.slice(2).join(' ').trim();
      if (!Number.isInteger(delay) || delay < 1000 || delay > 3600000) return sender.reply('[Spam] Interval must be an integer from 1000 to 3600000 ms.');
      if (!message || message.length > 256) return sender.reply('[Spam] Message must contain 1 to 256 characters.');
      const id = nextId++;
      const handle = setInterval(() => {
        if (!bot?.entity) return clearAll();
        bot.chat(message);
      }, delay);
      timers.set(id, { handle, delay, message });
      return sender.reply(`[Spam] Started repeater ${id}.`);
    }
    if (action === 'stop') {
      const target = args[1]?.toLowerCase() || 'all';
      if (target === 'all') {
        clearAll();
        return sender.reply('[Spam] Stopped all repeaters.');
      }
      const id = Number(target);
      const timer = timers.get(id);
      if (!timer) return sender.reply(`[Spam] Repeater ${target} was not found.`);
      clearInterval(timer.handle);
      timers.delete(id);
      return sender.reply(`[Spam] Stopped repeater ${id}.`);
    }
    return sender.reply(`[Spam] Usage: ${this.usage}`);
  }
};
