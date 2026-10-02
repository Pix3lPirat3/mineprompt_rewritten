'use strict';

const path = require('node:path');

function parseFlags(values) {
  const positional = [];
  const options = { policy: {} };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) {
      positional.push(value);
      continue;
    }
    if (value === '--confirm') {
      options.confirmed = true;
      continue;
    }
    if (value === '--at') {
      const coordinates = values.slice(index + 1, index + 4).map(Number);
      if (coordinates.length !== 3 || coordinates.some((entry) => !Number.isFinite(entry))) throw new Error('--at requires three numeric coordinates.');
      options.anchor = { x: Math.floor(coordinates[0]), y: Math.floor(coordinates[1]), z: Math.floor(coordinates[2]) };
      index += 3;
      continue;
    }
    const next = values[index + 1];
    if (next === undefined || next.startsWith('--')) throw new Error(`${value} requires a value.`);
    if (value === '--version') options.version = next;
    else if (value === '--edition') options.edition = next;
    else if (value === '--name') options.name = next;
    else if (value === '--rotate') options.rotation = Number(next);
    else if (value === '--mirror') options.mirror = next;
    else if (value === '--terrain') options.policy.terrain = next;
    else if (value === '--conflicts') options.policy.conflicts = next;
    else if (value === '--air') options.policy.air = next;
    else if (value === '--max-replacements') options.policy.maximumReplacements = Number(next);
    else if (value === '--max-range') options.policy.maximumRange = Number(next);
    else throw new Error(`Unknown build option ${value}.`);
    index += 1;
  }
  return { positional, options };
}

function dimensions(value) {
  return `${value.x} x ${value.y} x ${value.z}`;
}

function blueprintReferences(blueprints) {
  return blueprints.list().flatMap((blueprint) => [blueprint.id, blueprint.name]);
}

module.exports = {
  command: 'build',
  aliases: ['blueprint'],
  usage: 'build <import <file> --version <version>|list|inspect <blueprint>|materials <blueprint>|remove <blueprint> --confirm|preview <blueprint> --at x y z [--rotate 90] [--mirror x]|conflicts|requirements|plan>',
  description: 'Import, inspect, compare, and compile dependency-aware plans for version-declared schematics.',
  capability: 'world',
  risk: 'dangerous',
  approval: 'recommended',
  requires: { console: true },
  agent: false,

  autocomplete(command, args, { blueprints }, completion = {}) {
    if (!args.length || args.length === 1 && !completion.trailingSpace) return ['import', 'list', 'inspect', 'materials', 'remove', 'preview', 'conflicts', 'requirements', 'plan'];
    if (['inspect', 'materials', 'remove', 'preview', 'conflicts', 'requirements', 'plan'].includes(args[0]?.toLowerCase()) && (args.length === 1 || args.length === 2 && !completion.trailingSpace)) return blueprintReferences(blueprints);
    const previous = args.at(-2);
    if (previous === '--rotate') return ['0', '90', '180', '270'];
    if (previous === '--mirror') return ['none', 'x', 'z'];
    if (previous === '--terrain') return ['preserve', 'replace', 'flatten'];
    if (previous === '--conflicts') return ['stop', 'skip', 'replace'];
    if (previous === '--air') return ['ignore', 'clear'];
    return ['--at', '--rotate', '--mirror', '--terrain', '--conflicts', '--air', '--max-replacements', '--max-range'];
  },

  async execute(sender, command, args, { bot, blueprints }) {
    const action = String(args[0] || '').toLowerCase();
    try {
      const parsed = parseFlags(args.slice(1));
      if (action === 'import') {
        if (!parsed.positional[0] || parsed.positional.length > 1) throw new Error(`Usage: ${this.usage}`);
        const blueprint = await blueprints.importFile(parsed.positional[0], parsed.options);
        return sender.reply(`[Build] Imported ${blueprint.name} (${blueprint.id}), Minecraft ${blueprint.version}, ${dimensions(blueprint.dimensions)}, ${blueprint.materialCount} placed blocks.`);
      }
      if (action === 'list') {
        if (parsed.positional.length) throw new Error(`Usage: ${this.usage}`);
        const entries = blueprints.list();
        return sender.reply(entries.length ? `[Build] ${entries.map((entry) => `${entry.name} (${entry.id}), ${entry.version}, ${dimensions(entry.dimensions)}`).join('; ')}` : '[Build] No blueprints are imported.');
      }
      if (action === 'inspect') {
        if (parsed.positional.length !== 1) throw new Error(`Usage: ${this.usage}`);
        const value = blueprints.inspect(parsed.positional[0]);
        return sender.reply(`[Build] ${value.name} (${value.id}); ${value.sourceFormat}; Java ${value.version}; ${dimensions(value.dimensions)}; palette ${value.palette.length}; ${value.blockEntities.length} block entities; ${value.unsupportedBlocks.length} unsupported states; hash ${value.hash}.`);
      }
      if (action === 'materials') {
        if (parsed.positional.length !== 1) throw new Error(`Usage: ${this.usage}`);
        const value = blueprints.materials(parsed.positional[0]);
        const shown = value.materials.slice(0, 100).map((entry) => `${entry.count} x ${entry.displayName}`).join(', ');
        return sender.reply(`[Build] ${value.blueprint.name}: ${shown || 'no placeable materials'}${value.materials.length > 100 ? `, plus ${value.materials.length - 100} more types` : ''}.`);
      }
      if (action === 'remove') {
        if (parsed.positional.length !== 1) throw new Error(`Usage: ${this.usage}`);
        if (!parsed.options.confirmed) throw new Error('Removing a blueprint requires --confirm.');
        await blueprints.remove(parsed.positional[0]);
        return sender.reply(`[Build] Removed ${parsed.positional[0]}.`);
      }
      if (['preview', 'conflicts', 'requirements', 'plan'].includes(action)) {
        if (!bot?.entity) throw new Error('An active connection is required for a world preview.');
        if (parsed.positional.length !== 1 || !parsed.options.anchor) throw new Error(`Usage: ${this.usage}`);
        if (action === 'plan') {
          const plan = await blueprints.plan(parsed.positional[0], parsed.options);
          return sender.reply(`[Build] ${plan.preview.blueprint.name}: ${plan.graph.counts.operations} operations, ${plan.graph.counts.groups} multi-block groups, ${plan.graph.counts.blocked} blocked, ${plan.stances.counts.stances} stances, estimated travel ${plan.stances.estimatedTravel.toFixed(1)} blocks.`);
        }
        const preview = await blueprints.preview(parsed.positional[0], parsed.options);
        const warning = preview.warnings.length ? ` Warning: ${preview.warnings.join(' ')}` : '';
        if (action === 'conflicts') return sender.reply(`[Build] ${preview.blueprint.name}: ${preview.counts.conflicting} conflicts, ${preview.counts.replaceable} replacements, ${preview.counts.unknown} unknown blocks. Removals: ${preview.removals.map((entry) => `${entry.count} x ${entry.name}`).join(', ') || 'none'}.${warning}`);
        if (action === 'requirements') return sender.reply(`[Build] ${preview.blueprint.name}: ${preview.requirements.map((entry) => `${entry.count} x ${entry.name}${entry.missing ? ` (${entry.missing} missing)` : ''}`).join(', ') || 'no materials required'}.${warning}`);
        return sender.reply(`[Build] ${preview.blueprint.name}: ${preview.counts.correct} correct, ${preview.counts.placeable} placeable, ${preview.counts.replaceable} replaceable, ${preview.counts.conflicting} conflicts, ${preview.counts.temporarilyObstructed} obstructed, ${preview.counts.unknown} unknown, ${preview.counts.unsupported} unsupported.${warning}`);
      }
      throw new Error(`Usage: ${this.usage}`);
    } catch (error) {
      const source = action === 'import' && args[1] ? ` ${path.basename(args[1])}` : '';
      return sender.reply(`[Build${source}] ${error.message}`);
    }
  }
};

module.exports.parseFlags = parseFlags;
