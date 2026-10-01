'use strict';

function radius(value, fallback, label) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 64) throw new Error(`${label} must be an integer from 1 to 64.`);
  return parsed;
}

module.exports = {
  command: 'stash',
  aliases: ['depositnearby'],
  usage: 'stash <nearby [collection-radius] [container-radius]|inventory <item|slot|all> [container-radius] [confirm]|status|stop>',
  description: 'Collect nearby item drops, deposit them in the nearest storage container, and restore position and view.',
  capability: 'inventory',
  risk: 'dangerous',
  approval: 'recommended',
  requires: { entity: true },

  autocomplete(command, args, { inventory }, completion = {}) {
    if (!args.length || args.length === 1 && !completion.trailingSpace) return ['nearby', 'inventory', 'status', 'stop'];
    if (args[0]?.toLowerCase() === 'inventory' && (args.length === 1 || args.length === 2 && !completion.trailingSpace)) return ['all', ...inventory.selectors('inventory')];
    if (args[0]?.toLowerCase() === 'inventory' && args[1]?.toLowerCase() === 'all') return ['confirm'];
    return [];
  },

  execute(sender, command, args, { stash }) {
    const action = args[0]?.toLowerCase();
    if (action === 'status') {
      const status = stash.status();
      return sender.reply(status ? `[Stash] ${status.phase}; ${status.deposited} deposited${status.failed ? `; ${status.failed}` : ''}.` : '[Stash] No stash run has started.');
    }
    if (action === 'stop') return sender.reply(stash.stop() ? '[Stash] Stopping and returning to the saved position.' : '[Stash] Already stopped.');
    try {
      if (action === 'nearby') {
        if (args.length > 3) throw new Error(`Usage: ${this.usage}`);
        const collectionRadius = radius(args[1], 16, 'Collection radius');
        const containerRadius = radius(args[2], 16, 'Container radius');
        const status = stash.start({ mode: 'nearby', collectionRadius, containerRadius });
        return sender.reply(`[Stash] Collecting nearby items, then depositing at ${status.containerPosition.x}, ${status.containerPosition.y}, ${status.containerPosition.z}.`);
      }
      if (action === 'inventory') {
        const confirmed = args.at(-1)?.toLowerCase() === 'confirm';
        const values = confirmed ? args.slice(0, -1) : args;
        if (!values[1] || values.length > 3) throw new Error(`Usage: ${this.usage}`);
        if (values[1].toLowerCase() === 'all' && !confirmed) throw new Error('Depositing the full inventory requires confirm.');
        const containerRadius = radius(values[2], 16, 'Container radius');
        const status = stash.start({ mode: 'inventory', selector: values[1], containerRadius, confirmed });
        return sender.reply(`[Stash] Depositing ${values[1]} at ${status.containerPosition.x}, ${status.containerPosition.y}, ${status.containerPosition.z}, then returning.`);
      }
      throw new Error(`Usage: ${this.usage}`);
    } catch (error) {
      return sender.reply(`[Stash] ${error.message}`);
    }
  }
};
