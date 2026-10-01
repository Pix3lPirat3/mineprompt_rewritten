'use strict';

function findWorkflow(store, selector) {
  const target = String(selector || '').toLowerCase();
  return store.snapshot().workflows.find((workflow) => workflow.id.toLowerCase() === target || workflow.name.toLowerCase() === target);
}

module.exports = {
  command: 'workflow',
  aliases: ['workflows'],
  description: 'List, inspect, run, stop, or remove saved workflows.',
  usage: 'workflow <list|show|run|stop|remove> [name]',
  requires: { console: true },
  async execute(sender, command, args, { store, workflowRunner }) {
    const action = String(args[0] || 'list').toLowerCase();
    const workflows = store.snapshot().workflows;
    if (action === 'list') {
      sender.reply(workflows.length ? workflows.map((workflow) => `${workflow.name} (${workflow.id})`).join('\n') : '[Workflow] No workflows are saved.');
      return;
    }
    const workflow = findWorkflow(store, args.slice(1).join(' '));
    if (!workflow) throw new Error('Choose a saved workflow by name or id.');
    if (action === 'show') {
      sender.reply(`[Workflow] ${workflow.name}\nRepeats: ${workflow.repeat}\nResources: ${workflow.resources.join(', ') || 'none'}\nSteps:\n${workflow.steps.map((step, index) => `${index + 1}. ${step.type === 'wait' ? `wait ${step.durationMs}ms` : step.command}`).join('\n')}`);
      return;
    }
    if (action === 'run') {
      workflowRunner.run(workflow, sender.sessionId);
      sender.reply(`[Workflow] Started ${workflow.name}.`);
      return;
    }
    if (action === 'stop') {
      if (!workflowRunner.stop(workflow.id)) throw new Error(`${workflow.name} is not running.`);
      sender.reply(`[Workflow] Stopped ${workflow.name}.`);
      return;
    }
    if (action === 'remove') {
      await store.removeWorkflow(workflow.id);
      sender.reply(`[Workflow] Removed ${workflow.name}.`);
      return;
    }
    throw new Error('Workflow action must be list, show, run, stop, or remove.');
  },
  autocomplete(command, args, { store }) {
    if (args.length <= 1) return ['list', 'show', 'run', 'stop', 'remove'];
    return store.snapshot().workflows.flatMap((workflow) => [workflow.id, workflow.name]);
  }
};
