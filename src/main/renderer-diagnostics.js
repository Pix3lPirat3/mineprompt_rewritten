'use strict';

function boundedText(value, maximum) {
  return String(value ?? '').slice(0, maximum);
}

function boundedValue(value, depth = 0) {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 16384);
  if (depth >= 4) return '[nested data]';
  if (Array.isArray(value)) return value.slice(0, 24).map((entry) => boundedValue(entry, depth + 1));
  if (!value || typeof value !== 'object') return boundedText(value, 1024);
  return Object.fromEntries(Object.entries(value).slice(0, 32).map(([key, entry]) => [boundedText(key, 80), boundedValue(entry, depth + 1)]));
}

function normalizeRendererIssue(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Renderer issue details are required.');
  const area = boundedText(input.area || 'Renderer', 80).trim() || 'Renderer';
  const message = boundedText(input.message || 'Unknown renderer issue.', 8192).trim() || 'Unknown renderer issue.';
  const timestamp = Number(input.timestamp);
  return {
    area,
    message,
    context: boundedValue(input.context || {}),
    timestamp: Number.isFinite(timestamp) && timestamp > 0 ? Math.trunc(timestamp) : Date.now()
  };
}

class RendererDiagnostics {
  constructor(maximum = 100) {
    this.maximum = Math.max(10, Math.min(500, Number(maximum) || 100));
    this.issues = [];
    this.currentView = null;
  }

  record(input) {
    const issue = normalizeRendererIssue(input);
    const previous = this.issues.at(-1);
    if (previous?.area === issue.area && previous.message === issue.message && JSON.stringify(previous.context) === JSON.stringify(issue.context)) {
      previous.timestamp = issue.timestamp;
      previous.occurrences += 1;
      return structuredClone(previous);
    }
    const stored = { ...issue, occurrences: 1 };
    this.issues.push(stored);
    if (this.issues.length > this.maximum) this.issues.splice(0, this.issues.length - this.maximum);
    return structuredClone(stored);
  }

  recent(maximum = 50) {
    const count = Math.max(1, Math.min(this.maximum, Number(maximum) || 50));
    return structuredClone(this.issues.slice(-count));
  }

  updateView(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Renderer state is required.');
    this.currentView = boundedValue(input);
    return structuredClone(this.currentView);
  }

  view() {
    return structuredClone(this.currentView);
  }
}

module.exports = { RendererDiagnostics, boundedValue, normalizeRendererIssue };
