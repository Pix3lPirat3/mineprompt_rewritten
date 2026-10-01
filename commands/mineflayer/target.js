'use strict';

const { parseMiningFlags, policyText } = require('../../src/main/mining-policy');
const { BLOCK_ACTION_COMPLETIONS, BLOCK_COMMAND_ACTIONS, ENTITY_ACTION_COMPLETIONS, ENTITY_COMMAND_ACTIONS } = require('../../src/main/target-actions');

module.exports = {
  command: 'target',
  aliases: ['cursor'],
  usage: 'target [block <inspect|goto|look|activate|dig|mine [depth]> [mining flags] | entity <inspect|goto|look|pickup|stash|trade|activate|useitem|attack>]',
  description: 'Inspect or interact with the block and entity under the cursor.',
  capability: 'world',
  risk: 'dangerous',
  approval: 'recommended',
  requires: { entity: true },

  autocomplete(command, args) {
    if (args.length <= 1) return ['block', 'entity'];
    if (args.length === 2 && args[0]?.toLowerCase() === 'block') return [...BLOCK_ACTION_COMPLETIONS];
    if (args.length === 2 && args[0]?.toLowerCase() === 'entity') return [...ENTITY_ACTION_COMPLETIONS];
    if (args.length >= 3 && args[0]?.toLowerCase() === 'block' && ['dig', 'mine'].includes(args[1]?.toLowerCase())) return ['--tool', '--low', '--min-durability', '--allow-fluid-adjacent', '--allow-falling', '--include', '--exclude'];
    if (args.length === 3 && args[0]?.toLowerCase() === 'entity' && args[1]?.toLowerCase() === 'attack') return ['--override-friend-protection'];
    return [];
  },

  async execute(sender, command, args, { dispatchTargetAction, targets }) {
    const targetType = args[0]?.toLowerCase();
    const action = args[1]?.toLowerCase();
    if (!targetType) {
      const snapshot = targets.snapshot();
      const block = snapshot.cursorBlock ? `${snapshot.cursorBlock.displayName} at ${Object.values(snapshot.cursorBlock.position).join(', ')}` : 'None';
      const entity = snapshot.cursorEntity ? `${snapshot.cursorEntity.displayName} at ${snapshot.cursorEntity.distance} blocks` : 'None';
      return sender.reply(`[Target]\nBlock: ${block}\nEntity: ${entity}`);
    }
    if (targetType === 'entity' && ENTITY_COMMAND_ACTIONS[action]) {
      const result = await dispatchTargetAction({ actionId: ENTITY_COMMAND_ACTIONS[action], target: 'cursor', overrideFriendProtection: args.includes('--override-friend-protection') }, sender);
      return sender.reply(result.message);
    }
    if (targetType === 'block' && BLOCK_COMMAND_ACTIONS[action]) {
      let parsed;
      try { parsed = parseMiningFlags(args.slice(2)); } catch (error) { return sender.reply(`[Target] ${error.message}`); }
      const depth = action === 'mine' ? Number(parsed.positional[0] ?? 1) : undefined;
      if (action === 'mine' && (!Number.isInteger(depth) || depth < 1 || depth > 16)) return sender.reply('[Target] Mining depth must be an integer from 1 to 16.');
      if (parsed.positional.length > (action === 'mine' ? 1 : 0)) return sender.reply(`[Target] Usage: ${this.usage}`);
      const actionId = action === 'mine' ? depth === 1 ? 'block.mine-exact' : 'block.mine-depth' : BLOCK_COMMAND_ACTIONS[action];
      const result = await dispatchTargetAction({ actionId, target: 'cursor', depth, policy: parsed.policy }, sender);
      return sender.reply(`${result.message} ${policyText(parsed.policy)}.`);
    }
    return sender.reply(`[Target] Usage: ${this.usage}`);
  }
};
