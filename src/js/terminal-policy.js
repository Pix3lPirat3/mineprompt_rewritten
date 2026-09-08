'use strict';

function shouldStoreCommand(input) {
  const command = String(input ?? '').trim();
  return !/^(?:cmd|command)\s+\/?(?:login|register)\b/iu.test(command);
}

const terminalPolicy = Object.freeze({ shouldStoreCommand });

if (typeof module === 'object' && module.exports) {
  module.exports = terminalPolicy;
} else {
  Object.defineProperty(globalThis, 'minepromptTerminalPolicy', { value: terminalPolicy });
}
