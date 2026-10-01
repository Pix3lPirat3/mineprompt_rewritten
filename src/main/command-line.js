'use strict';

const MAX_COMMAND_LENGTH = 4096;

function parseCommandLine(input) {
  if (typeof input !== 'string') {
    throw new TypeError('Command input must be a string.');
  }

  if (input.length > MAX_COMMAND_LENGTH) {
    throw new RangeError(`Commands cannot exceed ${MAX_COMMAND_LENGTH} characters.`);
  }

  const tokens = [];
  let token = '';
  let quote = null;
  let escaped = false;
  let tokenStarted = false;

  for (const character of input.trim()) {
    if (escaped) {
      token += character;
      tokenStarted = true;
      escaped = false;
      continue;
    }

    if (character === '\\' && quote !== "'") {
      escaped = true;
      tokenStarted = true;
      continue;
    }

    if (quote) {
      if (character === quote) {
        quote = null;
      } else {
        token += character;
      }
      tokenStarted = true;
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      tokenStarted = true;
      continue;
    }

    if (/\s/u.test(character)) {
      if (tokenStarted) {
        tokens.push(token);
        token = '';
        tokenStarted = false;
      }
      continue;
    }

    token += character;
    tokenStarted = true;
  }

  if (escaped) token += '\\';
  if (quote) throw new SyntaxError(`Missing closing ${quote} quote.`);
  if (tokenStarted) tokens.push(token);

  return {
    name: tokens.shift()?.toLowerCase() ?? '',
    args: tokens
  };
}

function quoteArgument(value) {
  const text = String(value);
  if (/^[\w.@:/-]+$/u.test(text)) return text;
  return `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

module.exports = { MAX_COMMAND_LENGTH, parseCommandLine, quoteArgument };
