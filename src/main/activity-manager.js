'use strict';

class ActivityManager {
  constructor(onChange = () => {}, onError = () => {}) {
    this.onChange = onChange;
    this.onError = onError;
    this.subscribers = new Set();
    this.activities = new Map();
    this.resources = new Map();
    this.revision = 0;
  }

  register(id, { label, detail = '', resources = [], stop }) {
    if (!id || typeof stop !== 'function') throw new TypeError('An activity id and stop function are required.');
    const requested = [...new Set(resources.map(String).filter(Boolean))];
    const conflict = requested.map((resource) => ({ resource, owner: this.resources.get(resource) })).find((entry) => entry.owner && entry.owner !== id);
    if (conflict) throw new Error(`${conflict.resource} is already in use by ${conflict.owner}.`);
    this.stop(id);
    for (const resource of requested) this.resources.set(resource, id);
    this.activities.set(id, {
      id,
      label: String(label || id),
      detail: String(detail || ''),
      resources: requested,
      startedAt: Date.now(),
      stop
    });
    this.publish();
    return id;
  }

  finish(id) {
    const activity = this.activities.get(id);
    const removed = this.activities.delete(id);
    if (activity) this.release(activity);
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
    this.release(activity);
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

  subscribe(subscriber, emitInitial = true) {
    if (typeof subscriber !== 'function') throw new TypeError('An activity subscriber must be a function.');
    this.subscribers.add(subscriber);
    if (emitInitial) this.notify(subscriber, this.snapshot());
    return () => this.subscribers.delete(subscriber);
  }

  update(id, detail) {
    const activity = this.activities.get(id);
    if (!activity) return false;
    activity.detail = String(detail || '');
    this.publish();
    return true;
  }

  release(activity) {
    for (const resource of activity.resources) {
      if (this.resources.get(resource) === activity.id) this.resources.delete(resource);
    }
  }

  publish() {
    this.revision += 1;
    const snapshot = this.snapshot();
    this.notify(this.onChange, snapshot);
    for (const subscriber of this.subscribers) this.notify(subscriber, snapshot);
  }

  notify(subscriber, snapshot) {
    try {
      subscriber(snapshot, this.revision);
    } catch (error) {
      try { this.onError(error); } catch {}
    }
  }
}

module.exports = { ActivityManager };
