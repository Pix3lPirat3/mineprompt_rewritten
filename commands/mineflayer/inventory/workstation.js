'use strict';

module.exports = {
  command: 'workstation',
  aliases: ['station'],
  description: 'Operate the focused furnace, enchanting table, or anvil.',
  usage: 'workstation <operation> [arguments]',
  requires: { entity: true, console: true },
  async execute(sender, command, args, { inventory }) {
    const [operation, target, value, ...rest] = args;
    if (!operation) throw new Error('Choose a workstation operation.');
    const request = { scope: 'container', action: 'workstation', operation };
    if (['put-input', 'put-fuel'].includes(operation)) Object.assign(request, { target, count: value === undefined ? undefined : Number(value) });
    else if (['put-target', 'put-lapis'].includes(operation)) request.target = target;
    else if (operation === 'enchant') request.choice = Number(target) - 1;
    else if (operation === 'combine') Object.assign(request, { first: target, second: value, name: rest.join(' ') });
    else if (operation === 'rename') Object.assign(request, { target, name: [value, ...rest].filter(Boolean).join(' ') });
    const result = await inventory.execute(request);
    sender.reply(result.message);
  },
  async autocomplete(command, args, { inventory }) {
    const operations = ['put-input', 'put-fuel', 'take-input', 'take-fuel', 'take-output', 'put-target', 'put-lapis', 'take-target', 'enchant', 'combine', 'rename'];
    if (args.length <= 1) return operations;
    if (['put-input', 'put-fuel', 'put-target', 'put-lapis', 'combine', 'rename'].includes(args[0])) return inventory.selectors('inventory');
    if (args[0] === 'enchant') return ['1', '2', '3'];
    return [];
  }
};
