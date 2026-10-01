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
    this.redactors = new Map();
    this.entries = [];
  }

  setRedactor(redactor, sessionId = 'global') {
    if (typeof redactor === 'function') this.redactors.set(sessionId, redactor);
    else this.redactors.delete(sessionId);
  }

  write(level, parts, sessionId = null) {
    const text = parts.map(formatPart).join(' ');
    const globalRedactor = this.redactors.get('global');
    const sessionRedactor = sessionId ? this.redactors.get(sessionId) : null;
    const globallyRedacted = globalRedactor ? globalRedactor(text) : text;
    const message = sessionRedactor ? sessionRedactor(globallyRedacted) : globallyRedacted;
    const output = level === 'debug' ? this.originalConsole.debug : this.originalConsole[level] || this.originalConsole.log;
    const entry = { level, message, timestamp: Date.now(), ...(sessionId ? { sessionId } : {}) };
    this.entries.push(entry);
    this.entries = this.entries.slice(-500);
    output.call(this.originalConsole, message);
    this.emit('log', entry);
  }

  log(...parts) { this.write('log', parts); }
  info(...parts) { this.write('info', parts); }
  warn(...parts) { this.write('warn', parts); }
  error(...parts) { this.write('error', parts); }
  debug(...parts) { this.write('debug', parts); }
  terminal(...parts) { this.write('log', parts); }

  recent() { return structuredClone(this.entries); }

  ingest(entry) {
    const normalized = {
      level: ['log', 'info', 'warn', 'error', 'debug'].includes(entry?.level) ? entry.level : 'log',
      message: String(entry?.message || ''),
      timestamp: Number(entry?.timestamp) || Date.now(),
      ...(entry?.sessionId ? { sessionId: String(entry.sessionId) } : {})
    };
    this.entries.push(normalized);
    this.entries = this.entries.slice(-500);
    this.emit('log', normalized);
    return normalized;
  }

  facade(sessionId = null) {
    const write = (level) => (...parts) => this.write(level, parts, sessionId);
    return {
      log: write('log'),
      info: write('info'),
      warn: write('warn'),
      error: write('error'),
      debug: write('debug'),
      terminal: write('log'),
      setRedactor: (redactor) => this.setRedactor(redactor, sessionId || 'global')
    };
  }

  child(sessionId) {
    return this.facade(String(sessionId));
  }
}

module.exports = { RuntimeLogger, formatPart };
