'use strict';

function runtime(bot) {
  if (!bot?.mineprompt) throw new Error('MinePrompt capability plugins are not installed for this bot.');
  return bot.mineprompt;
}

function parseInput(values) {
  if (!values.length) return {};
  let value;
  try { value = JSON.parse(values.join(' ')); } catch { throw new Error('Action input must be a valid JSON object.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Action input must be a JSON object.');
  return value;
}

module.exports = {
  command: 'capability',
  aliases: ['capabilities', 'plugins'],
  usage: 'capability <list|show|run|tasks|stop> [id] [json]',
  description: 'Inspect and execute installed Mineflayer capability plugins.',
  requires: { entity: true },
  risk: 'dangerous',
  capability: 'plugins.execute',
  approval: 'recommended',

  autocomplete(command, args, { bot }, completion = {}) {
    if (!bot?.mineprompt) return [];
    if (!args.length || args.length === 1 && !completion.trailingSpace) return ['list', 'show', 'run', 'tasks', 'stop'];
    const snapshot = bot.mineprompt.snapshot();
    if (args[0] === 'show' && (args.length === 1 || args.length === 2 && !completion.trailingSpace)) {
      return [...snapshot.capabilities.map((entry) => entry.id), ...snapshot.actions.map((entry) => entry.id)];
    }
    if (args[0] === 'run' && (args.length === 1 || args.length === 2 && !completion.trailingSpace)) return snapshot.actions.map((entry) => entry.id);
    if (args[0] === 'stop' && (args.length === 1 || args.length === 2 && !completion.trailingSpace)) return snapshot.tasks.active.map((entry) => entry.id);
    return [];
  },

  async execute(sender, command, args, { bot }) {
    try {
      const installed = runtime(bot);
      const action = String(args[0] || 'list').toLowerCase();
      const snapshot = installed.snapshot();
      if (action === 'list') {
        const capabilities = snapshot.capabilities.map((entry) => `${entry.id}@${entry.version}`).join(', ') || 'none';
        return sender.reply(`[Capabilities] ${capabilities}. ${snapshot.actions.length} actions available.`);
      }
      if (action === 'show') {
        const id = String(args[1] || '');
        const capability = snapshot.capabilities.find((entry) => entry.id === id);
        const definition = snapshot.actions.find((entry) => entry.id === id);
        if (capability) return sender.reply(`[Capability] ${capability.id}@${capability.version}: ${capability.description || 'No description.'}`);
        if (definition) return sender.reply(`[Action] ${definition.id}: ${definition.title || definition.id}\nInput: ${JSON.stringify(definition.inputSchema)}`);
        throw new Error('That capability or action is not installed.');
      }
      if (action === 'run') {
        const actionId = String(args[1] || '');
        if (!actionId) throw new Error('Choose an action id.');
        const result = await installed.actions.execute(actionId, parseInput(args.slice(2)), { bot, runtime: installed, origin: sender });
        return sender.reply(`[Capability] ${actionId} completed.\n${JSON.stringify(result ?? null)}`);
      }
      if (action === 'tasks') {
        const tasks = snapshot.tasks.active;
        return sender.reply(tasks.length ? tasks.map((task) => `${task.id}: ${task.status}${task.detail ? `, ${task.detail}` : ''}`).join('\n') : '[Capabilities] No plugin tasks are running.');
      }
      if (action === 'stop') {
        const id = String(args[1] || '');
        if (!id) throw new Error('Choose a task id.');
        return sender.reply(installed.tasks.stop(id) ? `[Capabilities] Stopping ${id}.` : `[Capabilities] Task ${id} is not running.`);
      }
      throw new Error(`Usage: ${this.usage}`);
    } catch (error) {
      return sender.reply(`[Capabilities] ${error.message}`);
    }
  }
};
