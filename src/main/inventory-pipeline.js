'use strict';

const { performance } = require('node:perf_hooks');
const { InventoryPipelineTelemetry } = require('./inventory-telemetry');

const COALESCED_EVENT_TYPES = new Set(['update', 'property']);

class InventoryPipeline {
  constructor({ snapshot, publish, delay = 16, schedule = setTimeout, cancel = clearTimeout, telemetry = new InventoryPipelineTelemetry() }) {
    this.snapshot = snapshot;
    this.publishPayload = publish;
    this.delay = delay;
    this.schedule = schedule;
    this.cancel = cancel;
    this.telemetry = telemetry;
    this.pending = null;
    this.timer = null;
  }

  receive(event) {
    this.telemetry.observe(event);
    if (!COALESCED_EVENT_TYPES.has(event.type)) {
      this.discardPending();
      this.publish(event);
      return;
    }
    this.pending = event;
    if (this.timer !== null) return;
    this.timer = this.schedule(() => {
      this.timer = null;
      this.flush();
    }, this.delay);
  }

  flush() {
    if (!this.pending) return;
    const event = this.pending;
    this.pending = null;
    const startedAt = performance.now();
    const session = this.snapshot();
    const pipeline = this.telemetry.publish(performance.now() - startedAt);
    this.publishPayload({ event, session, pipeline });
  }

  publish(event) {
    const startedAt = performance.now();
    const session = this.snapshot();
    const pipeline = this.telemetry.publish(performance.now() - startedAt);
    this.publishPayload({ event, session, pipeline });
  }

  discardPending() {
    this.pending = null;
    if (this.timer === null) return;
    this.cancel(this.timer);
    this.timer = null;
  }

  close() {
    this.discardPending();
  }
}

module.exports = { InventoryPipeline };
