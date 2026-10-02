'use strict';

function coordinates(values) {
  const numbers = values.map(Number);
  if (numbers.length !== 6 || numbers.some((value) => !Number.isFinite(value))) throw new Error('Storage bounds require exactly six numeric coordinates.');
  return numbers.map(Math.floor);
}

function zoneSuggestions(storage) {
  return storage.zones({ all: true }).flatMap((zone) => [zone.id, zone.name]);
}

function scanDescription(scan) {
  if (!scan) return 'not scanned';
  const freshness = scan.stale ? 'stale' : 'current';
  return `${scan.phase}, ${scan.containersScanned}/${scan.containersFound} containers, ${scan.items.reduce((sum, item) => sum + item.count, 0)} items, ${freshness}`;
}

function operationDescription(operation) {
  return `${operation.phase}, ${operation.transferred}/${operation.requested} ${operation.displayName}, ${operation.containersVisited}/${operation.containersPlanned} containers${operation.failed ? `, failed: ${operation.failed}` : ''}`;
}

module.exports = {
  command: 'storage',
  aliases: ['warehouse'],
  usage: 'storage <zones|add <name> x1 y1 z1 x2 y2 z2|remove <zone>|scan <zone>|inspect <zone>|find <item> [zone] [minimum]|plan <item> <count> <zone>|fetch <item> <count> <zone>|status|stop>',
  description: 'Register, scan, query, and fetch from server-scoped storage zones.',
  capability: 'world',
  risk: 'dangerous',
  approval: 'recommended',

  autocomplete(command, args, { storage }, completion = {}) {
    if (!args.length || args.length === 1 && !completion.trailingSpace) return ['zones', 'add', 'remove', 'scan', 'inspect', 'find', 'plan', 'fetch', 'status', 'stop'];
    if (['remove', 'scan', 'inspect'].includes(args[0]?.toLowerCase()) && (args.length === 1 || args.length === 2 && !completion.trailingSpace)) return zoneSuggestions(storage);
    if (args[0]?.toLowerCase() === 'find' && args.length >= 2) return zoneSuggestions(storage);
    if (['plan', 'fetch'].includes(args[0]?.toLowerCase()) && args.length >= 3) return zoneSuggestions(storage);
    return [];
  },

  async execute(sender, command, args, { bot, storage }) {
    const action = String(args[0] || '').toLowerCase();
    try {
      if (action === 'zones') {
        const zones = storage.zones({ all: !bot?.entity });
        return sender.reply(zones.length ? `[Storage] ${zones.map((zone) => `${zone.name} (${zone.id}): ${scanDescription(zone.scan)}`).join('; ')}` : '[Storage] No zones are registered here.');
      }
      if (action === 'add') {
        if (!bot?.entity) throw new Error('An active connection is required.');
        if (!args[1]) throw new Error(`Usage: ${this.usage}`);
        const [x1, y1, z1, x2, y2, z2] = coordinates(args.slice(2));
        const zone = await storage.saveZone({ name: args[1], from: { x: x1, y: y1, z: z1 }, to: { x: x2, y: y2, z: z2 } });
        return sender.reply(`[Storage] Saved ${zone.name} as ${zone.id}.`);
      }
      if (action === 'remove') {
        if (!args[1] || args.length > 2) throw new Error(`Usage: ${this.usage}`);
        await storage.removeZone(args[1]);
        return sender.reply(`[Storage] Removed ${args[1]}.`);
      }
      if (action === 'scan') {
        if (!bot?.entity) throw new Error('An active connection is required.');
        if (!args[1] || args.length > 2) throw new Error(`Usage: ${this.usage}`);
        const status = storage.start(args[1]);
        return sender.reply(`[Storage] Scanning ${status.zoneName}.`);
      }
      if (action === 'inspect') {
        if (!args[1] || args.length > 2) throw new Error(`Usage: ${this.usage}`);
        const result = storage.inspect(args[1]);
        if (!result.scan) return sender.reply(`[Storage] ${result.zone.name} has not been scanned.`);
        const items = result.scan.items.map((item) => `${item.count} x ${item.displayName} [${item.variantId}]`).join(', ');
        return sender.reply(`[Storage] ${result.zone.name}: ${scanDescription(result.scan)}${items ? `; ${items}` : ''}.`);
      }
      if (action === 'find') {
        if (!args[1] || args.length > 4) throw new Error(`Usage: ${this.usage}`);
        const items = storage.find(args[1], { zone: args[2], minimum: args[3] });
        return sender.reply(items.length ? `[Storage] ${items.map((item) => `${item.zoneName}: ${item.count} x ${item.displayName} [${item.variantId}]${item.stale ? ' (stale)' : ''}`).join('; ')}` : `[Storage] No indexed item matches ${args[1]}.`);
      }
      if (action === 'plan' || action === 'fetch') {
        if (!bot?.entity) throw new Error('An active connection is required.');
        if (!args[1] || !args[2] || !args[3] || args.length > 4) throw new Error(`Usage: ${this.usage}`);
        const request = { item: args[1], count: Number(args[2]), zone: args[3] };
        if (action === 'plan') {
          const plan = await storage.fetchPlan(request);
          return sender.reply(`[Storage] Plan: ${plan.requested} x ${plan.variant.displayName} from ${plan.allocations.length} container${plan.allocations.length === 1 ? '' : 's'}, estimated route cost ${plan.estimatedCost.toFixed(1)}.`);
        }
        const status = await storage.startFetch(request);
        return sender.reply(`[Storage] Fetching ${status.requested} x ${status.displayName} from ${status.containersPlanned} container${status.containersPlanned === 1 ? '' : 's'}.`);
      }
      if (action === 'status') {
        const status = storage.operationStatus?.() || storage.status();
        if (!status) return sender.reply('[Storage] No operation is active.');
        return sender.reply(status.kind ? `[Storage] ${operationDescription(status)}.` : `[Storage] ${status.zoneName}: ${scanDescription(status)}.`);
      }
      if (action === 'stop') return sender.reply(storage.stop() ? '[Storage] Stopping the current operation.' : '[Storage] No operation is active.');
      throw new Error(`Usage: ${this.usage}`);
    } catch (error) {
      return sender.reply(`[Storage] ${error.message}`);
    }
  }
};

module.exports.coordinates = coordinates;
module.exports.scanDescription = scanDescription;
module.exports.operationDescription = operationDescription;
