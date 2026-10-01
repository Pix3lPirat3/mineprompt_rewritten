'use strict';

const util = require('node:util');

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function debugValue(value, options = {}) {
  const maximumDepth = Math.max(1, Math.min(12, Number(options.depth) || 6));
  const maximumEntries = Math.max(1, Math.min(1000, Number(options.entries) || 200));
  const seen = new WeakMap();
  let truncated = false;
  let remainingNodes = 10000;
  let remainingCharacters = 512 * 1024;

  const stringValue = (current) => {
    const available = Math.max(0, Math.min(16384, remainingCharacters));
    const result = String(current).slice(0, available);
    remainingCharacters -= result.length;
    if (result.length < String(current).length) truncated = true;
    return result;
  };

  const visit = (current, depth, location) => {
    remainingNodes -= 1;
    if (remainingNodes < 0 || remainingCharacters <= 0) {
      truncated = true;
      return '[output limit]';
    }
    if (current === undefined) return '[undefined]';
    if (typeof current === 'string') return stringValue(current);
    if (current === null || typeof current === 'boolean' || typeof current === 'number') return current;
    if (typeof current === 'bigint') return `${current}n`;
    if (typeof current === 'symbol') return current.toString();
    if (typeof current === 'function') return `[Function: ${current.name || 'anonymous'}]`;
    if (Buffer.isBuffer(current)) return { type: 'Buffer', length: current.length, hex: current.subarray(0, maximumEntries).toString('hex') };
    if (current instanceof Error) return { type: current.name, message: current.message, stack: current.stack || null };
    if (seen.has(current)) return `[Circular: ${seen.get(current)}]`;
    if (depth >= maximumDepth) {
      truncated = true;
      return `[${current.constructor?.name || 'Object'}]`;
    }
    seen.set(current, location);
    if (current instanceof Map) {
      const entries = [...current.entries()];
      if (entries.length > maximumEntries) truncated = true;
      return {
        type: current.constructor?.name || 'Map',
        size: current.size,
        entries: entries.slice(0, maximumEntries).map(([key, entry], index) => [visit(key, depth + 1, `${location}.keys[${index}]`), visit(entry, depth + 1, `${location}.values[${index}]`)])
      };
    }
    if (current instanceof Set) {
      const values = [...current.values()];
      if (values.length > maximumEntries) truncated = true;
      return { type: current.constructor?.name || 'Set', size: current.size, values: values.slice(0, maximumEntries).map((entry, index) => visit(entry, depth + 1, `${location}[${index}]`)) };
    }
    if (Array.isArray(current)) {
      if (current.length > maximumEntries) truncated = true;
      return current.slice(0, maximumEntries).map((entry, index) => visit(entry, depth + 1, `${location}[${index}]`));
    }
    const keys = Reflect.ownKeys(current).filter((key) => typeof key === 'string');
    if (keys.length > maximumEntries) truncated = true;
    const output = {};
    if (current.constructor?.name && current.constructor.name !== 'Object') output.$type = current.constructor.name;
    for (const key of keys.slice(0, maximumEntries)) {
      remainingCharacters -= key.length;
      try {
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        output[key] = descriptor && Object.hasOwn(descriptor, 'value') ? visit(descriptor.value, depth + 1, `${location}.${key}`) : '[Accessor]';
      } catch (error) {
        output[key] = `[Thrown: ${error.message}]`;
      }
    }
    return output;
  };

  const serialized = visit(value, 0, '$');
  return {
    type: value === null ? 'null' : value?.constructor?.name || typeof value,
    value: serialized,
    text: util.inspect(serialized, { colors: false, depth: maximumDepth + 2, maxArrayLength: maximumEntries, breakLength: 120, compact: 2 }),
    truncated
  };
}

class DebugEvaluator {
  constructor({ context, logger }) {
    this.context = context;
    this.logger = logger;
  }

  async evaluate(request = {}) {
    const code = String(request.code ?? '').trim();
    if (!code) throw new Error('Enter JavaScript to evaluate.');
    if (code.length > 16384) throw new Error('Debug code cannot exceed 16384 characters.');
    const values = this.context();
    const names = [...Object.keys(values), 'require', 'process', 'Buffer', 'console'];
    const args = [...Object.values(values), require, process, Buffer, console];
    let evaluator;
    try {
      evaluator = new AsyncFunction(...names, `return (${code});`);
    } catch (expressionError) {
      try {
        evaluator = new AsyncFunction(...names, code);
      } catch {
        throw expressionError;
      }
    }
    this.logger.warn('[Debug] Running intentionally unsafe JavaScript in the selected bot process.');
    const timeout = Math.max(100, Math.min(30000, Number(request.timeout) || 10000));
    let timer;
    try {
      const result = await Promise.race([
        evaluator(...args),
        new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error(`Debug evaluation exceeded ${timeout} ms.`)), timeout); })
      ]);
      return { ok: true, ...debugValue(result, request) };
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = { DebugEvaluator, debugValue };
