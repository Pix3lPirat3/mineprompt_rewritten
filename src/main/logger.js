'use strict';

const util = require('node:util');

function formatPart(value) {
  if (value instanceof Error) return value.stack || value.message;
  if (typeof value === 'string') return value;
  return util.inspect(value, { colors: false, depth: 3, maxArrayLength: 50, breakLength: 120 });
}

class RuntimeLogger {
  constructor(emit, originalConsole = console) {
    this.emit = emit;
    this.originalConsole = originalConsole;
    this.redactor = (message) => message;
  }

  setRedactor(redactor) {
    this.redactor = typeof redactor === 'function' ? redactor : (message) => message;
  }

  write(level, ...parts) {
    const message = this.redactor(parts.map(formatPart).join(' '));
    const output = level === 'debug' ? this.originalConsole.debug : this.originalConsole[level] || this.originalConsole.log;
    output.call(this.originalConsole, message);
    this.emit('log', { level, message, timestamp: Date.now() });
  }

  log(...parts) { this.write('log', ...parts); }
  info(...parts) { this.write('info', ...parts); }
  warn(...parts) { this.write('warn', ...parts); }
  error(...parts) { this.write('error', ...parts); }
  debug(...parts) { this.write('debug', ...parts); }
  terminal(...parts) { this.write('log', ...parts); }

  facade() {
    return {
      log: this.log.bind(this),
      info: this.info.bind(this),
      warn: this.warn.bind(this),
      error: this.error.bind(this),
      debug: this.debug.bind(this),
      terminal: this.terminal.bind(this)
    };
  }
}

module.exports = { RuntimeLogger, formatPart };
