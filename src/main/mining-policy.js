'use strict';

const TOOL_POLICIES = Object.freeze(['auto', 'held', 'hand']);
const LOW_DURABILITY_POLICIES = Object.freeze(['switch', 'stop', 'skip']);

class MiningPolicyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MiningPolicyError';
    this.code = code;
  }
}

function boundedInteger(value, fallback, minimum, maximum, name) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw new MiningPolicyError('invalid-policy', `${name} must be an integer from ${minimum} to ${maximum}.`);
  return number;
}

function names(value) {
  if (!value) return [];
  const entries = Array.isArray(value) ? value : String(value).split(',');
  return [...new Set(entries.map((entry) => String(entry).trim().toLowerCase()).filter(Boolean))];
}

function normalizeMiningPolicy(input = {}) {
  const tool = String(input.tool || 'auto').toLowerCase();
  const lowDurability = String(input.lowDurability || (tool === 'auto' ? 'switch' : 'stop')).toLowerCase();
  if (!TOOL_POLICIES.includes(tool)) throw new MiningPolicyError('invalid-policy', `Tool policy must be one of: ${TOOL_POLICIES.join(', ')}.`);
  if (!LOW_DURABILITY_POLICIES.includes(lowDurability)) throw new MiningPolicyError('invalid-policy', `Low durability policy must be one of: ${LOW_DURABILITY_POLICIES.join(', ')}.`);
  return Object.freeze({
    tool,
    lowDurability,
    minimumDurability: boundedInteger(input.minimumDurability, 10, 0, 65535, 'Minimum durability'),
    allowFluidAdjacent: input.allowFluidAdjacent === true,
    allowFalling: input.allowFalling === true,
    include: names(input.include),
    exclude: names(input.exclude),
    reach: Math.max(3, Math.min(5.5, Number(input.reach) || 4.8)),
    maxBlocks: boundedInteger(input.maxBlocks, 4096, 1, 16384, 'Maximum blocks')
  });
}

function remainingDurability(item, bot) {
  if (!item) return 0;
  const maximum = Number(item.maxDurability) || Number(bot?.registry?.itemsByName?.[item.name]?.maxDurability) || 0;
  if (!maximum) return Number.POSITIVE_INFINITY;
  let used = Number(item.durabilityUsed);
  if (!Number.isFinite(used)) {
    const legacy = bot?.registry?.version?.['<']?.('1.13') === true;
    used = legacy ? Number(item.metadata) || 0 : Number(item.nbt?.value?.Damage?.value) || 0;
  }
  return Math.max(0, maximum - used);
}

function canHarvest(block, item) {
  if (!block || !item) return false;
  if (typeof block.canHarvest !== 'function') return true;
  try { return block.canHarvest(item.type); } catch { return false; }
}

function uniqueItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item?.slot}:${item?.name}`;
    if (!item || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function digTime(bot, block, item) {
  if (typeof block?.digTime !== 'function') return Number.POSITIVE_INFINITY;
  let enchantments = [];
  try { enchantments = item?.enchants || []; } catch {}
  try {
    return block.digTime(item?.type ?? null, false, bot?.entity?.isInWater === true, bot?.entity?.onGround === false, enchantments, bot?.entity?.effects || {});
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function toolCandidates(bot, block) {
  let preferred = null;
  try { preferred = bot?.pathfinder?.bestHarvestTool?.(block) || null; } catch {}
  const inventory = bot?.inventory?.items?.() || [];
  return uniqueItems([preferred, ...inventory.filter((item) => canHarvest(block, item))]).sort((left, right) =>
    digTime(bot, block, left) - digTime(bot, block, right) || remainingDurability(right, bot) - remainingDurability(left, bot));
}

function toolDecision(bot, block, policyInput = {}) {
  const policy = normalizeMiningPolicy(policyInput);
  const requiresTool = Object.keys(block?.harvestTools || {}).length > 0;
  const held = bot?.heldItem || null;
  const heldSafe = held && remainingDurability(held, bot) > policy.minimumDurability;
  if (policy.tool === 'hand') {
    if (requiresTool) throw new MiningPolicyError('tool-required', `${block.displayName || block.name} requires a harvesting tool.`);
    return { item: null, policy };
  }
  if (policy.tool === 'held') {
    if (!held) throw new MiningPolicyError('tool-missing', 'No tool is held.');
    if (!canHarvest(block, held) && requiresTool) throw new MiningPolicyError('wrong-tool', `The held ${held.displayName || held.name} cannot harvest ${block.displayName || block.name}.`);
    if (!heldSafe) {
      if (policy.lowDurability === 'switch') {
        const replacement = toolCandidates(bot, block).find((item) => item.slot !== held.slot && remainingDurability(item, bot) > policy.minimumDurability);
        if (replacement) return { item: replacement, policy };
      }
      if (policy.lowDurability === 'skip') return { skip: true, reason: 'held-tool-low', policy };
      throw new MiningPolicyError('low-durability', `The held ${held.displayName || held.name} has ${remainingDurability(held, bot)} durability remaining.`);
    }
    return { item: held, policy };
  }
  const candidates = toolCandidates(bot, block);
  const safe = candidates.find((item) => remainingDurability(item, bot) > policy.minimumDurability);
  if (safe) {
    const handTime = digTime(bot, block, null);
    if (!requiresTool && handTime <= digTime(bot, block, safe)) return { item: null, policy };
    return { item: safe, policy };
  }
  if (!requiresTool) return { item: null, policy };
  if (policy.lowDurability === 'skip') return { skip: true, reason: 'no-safe-tool', policy };
  const bestRemaining = candidates.reduce((maximum, item) => Math.max(maximum, remainingDurability(item, bot)), 0);
  throw new MiningPolicyError('low-durability', candidates.length
    ? `No suitable tool has more than ${policy.minimumDurability} durability remaining. Best available: ${bestRemaining}.`
    : `No suitable tool can harvest ${block.displayName || block.name}.`);
}

function parseMiningFlags(argumentsList = []) {
  const values = {};
  const positional = [];
  let preset = null;
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = String(argumentsList[index]);
    const next = () => {
      const value = argumentsList[index + 1];
      if (value === undefined || String(value).startsWith('--')) throw new MiningPolicyError('invalid-flag', `${argument} requires a value.`);
      index += 1;
      return value;
    };
    if (argument === '--tool') values.tool = next();
    else if (argument === '--low') values.lowDurability = next();
    else if (argument === '--min-durability') values.minimumDurability = next();
    else if (argument === '--reach') values.reach = next();
    else if (argument === '--max-blocks') values.maxBlocks = next();
    else if (argument === '--include') values.include = next();
    else if (argument === '--exclude') values.exclude = next();
    else if (argument === '--preset') preset = String(next());
    else if (argument === '--allow-fluid-adjacent') values.allowFluidAdjacent = true;
    else if (argument === '--allow-falling') values.allowFalling = true;
    else if (argument.startsWith('--')) throw new MiningPolicyError('invalid-flag', `Unknown mining flag: ${argument}.`);
    else positional.push(argument);
  }
  return { positional, policy: normalizeMiningPolicy(values), overrides: values, preset };
}

function policyText(policyInput = {}) {
  const policy = normalizeMiningPolicy(policyInput);
  const tool = policy.tool === 'auto' ? `auto-switch above ${policy.minimumDurability} durability` : policy.tool === 'held' ? `held tool until ${policy.minimumDurability} durability` : 'hand mining';
  const hazards = [policy.allowFluidAdjacent ? 'fluid edges allowed' : 'fluid edges avoided', policy.allowFalling ? 'falling blocks allowed' : 'falling blocks avoided'];
  return `${tool}; ${hazards.join('; ')}`;
}

module.exports = { LOW_DURABILITY_POLICIES, MiningPolicyError, TOOL_POLICIES, canHarvest, digTime, normalizeMiningPolicy, parseMiningFlags, policyText, remainingDurability, toolDecision };
