'use strict';

class ActivityManager {
  constructor(onChange = () => {}) {
    this.onChange = onChange;
    this.activities = new Map();
  }

  register(id, { label, detail = '', stop }) {
    if (!id || typeof stop !== 'function') throw new TypeError('An activity id and stop function are required.');
    this.stop(id);
    this.activities.set(id, {
      id,
      label: String(label || id),
      detail: String(detail || ''),
      startedAt: Date.now(),
      stop
    });
    this.publish();
    return id;
  }

  finish(id) {
    const removed = this.activities.delete(id);
    if (removed) this.publish();
    return removed;
  }

  has(id) {
    return this.activities.has(id);
  }

  stop(id) {
    const activity = this.activities.get(id);
    if (!activity) return false;
    this.activities.delete(id);
    try {
      activity.stop();
    } finally {
      this.publish();
    }
    return true;
  }

  stopAll() {
    for (const id of [...this.activities.keys()]) this.stop(id);
  }

  snapshot() {
    return [...this.activities.values()].map(({ stop, ...activity }) => ({ ...activity }));
  }

  publish() {
    this.onChange(this.snapshot());
  }
}

module.exports = { ActivityManager };
