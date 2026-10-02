'use strict';

const { performance } = require('node:perf_hooks');

class SnapshotPublisher {
  constructor({ capture, publish, onError = () => {}, delay = 16, schedule = setTimeout, cancel = clearTimeout }) {
    if (typeof capture !== 'function' || typeof publish !== 'function') throw new TypeError('Snapshot capture and publish functions are required.');
    this.capture = capture;
    this.publishValue = publish;
    this.onError = onError;
    this.delay = Math.max(0, Number(delay) || 0);
    this.schedule = schedule;
    this.cancel = cancel;
    this.timer = null;
    this.pending = false;
    this.closed = false;
    this.metrics = { requested: 0, published: 0, failed: 0, coalesced: 0, lastDurationMs: 0, peakDurationMs: 0 };
  }

  request() {
    if (this.closed) return false;
    this.metrics.requested += 1;
    this.pending = true;
    if (this.timer !== null) {
      this.metrics.coalesced += 1;
      return false;
    }
    this.timer = this.schedule(() => {
      this.timer = null;
      this.flush();
    }, this.delay);
    return true;
  }

  flush() {
    if (this.closed || !this.pending) return false;
    if (this.timer !== null) {
      this.cancel(this.timer);
      this.timer = null;
    }
    this.pending = false;
    const startedAt = performance.now();
    try {
      const value = this.capture();
      this.publishValue(value);
      this.metrics.published += 1;
      return true;
    } catch (error) {
      this.metrics.failed += 1;
      try { this.onError(error); } catch {}
      return false;
    } finally {
      const duration = performance.now() - startedAt;
      this.metrics.lastDurationMs = Math.round(duration * 1000) / 1000;
      this.metrics.peakDurationMs = Math.max(this.metrics.peakDurationMs, this.metrics.lastDurationMs);
    }
  }

  snapshot() {
    return { ...this.metrics, pending: this.pending };
  }

  close() {
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
    this.pending = false;
    this.closed = true;
  }
}

module.exports = { SnapshotPublisher };
