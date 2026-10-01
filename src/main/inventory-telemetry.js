'use strict';

class InventoryPipelineTelemetry {
  constructor(clock = Date.now) {
    this.clock = clock;
    this.reset();
  }

  reset() {
    this.received = 0;
    this.published = 0;
    this.firstEventAt = null;
    this.lastEventAt = null;
    this.lastRevision = 0;
    this.timestamps = [];
    this.publicationTimestamps = [];
    this.peakEventsPerSecond = 0;
    this.byType = {};
    this.byScope = {};
    this.snapshotSerialization = { total: 0, lastMs: 0, maximumMs: 0, totalMs: 0 };
    this.itemSerialization = { total: 0, lastMs: 0, maximumMs: 0, totalMs: 0 };
  }

  observe(event) {
    if (event.revision <= this.lastRevision) this.reset();
    const now = this.clock();
    this.received += 1;
    this.firstEventAt ??= now;
    this.lastEventAt = now;
    this.lastRevision = event.revision;
    this.byType[event.type] = (this.byType[event.type] || 0) + 1;
    this.byScope[event.scope] = (this.byScope[event.scope] || 0) + 1;
    this.timestamps.push(now);
    while (this.timestamps[0] < now - 1000) this.timestamps.shift();
    this.peakEventsPerSecond = Math.max(this.peakEventsPerSecond, this.timestamps.length);
    this.measure(this.itemSerialization, event.processing?.itemSerializationMs);
    return this.snapshot();
  }

  publish(snapshotSerializationMs) {
    const now = this.clock();
    this.published += 1;
    this.publicationTimestamps.push(now);
    while (this.publicationTimestamps[0] < now - 1000) this.publicationTimestamps.shift();
    this.measure(this.snapshotSerialization, snapshotSerializationMs);
    return this.snapshot();
  }

  measure(target, value) {
    const duration = Number(value);
    if (!Number.isFinite(duration) || duration < 0) return;
    target.total += 1;
    target.lastMs = duration;
    target.maximumMs = Math.max(target.maximumMs, duration);
    target.totalMs += duration;
  }

  measurement(target) {
    return {
      samples: target.total,
      lastMs: Math.round(target.lastMs * 1000) / 1000,
      averageMs: target.total ? Math.round(target.totalMs / target.total * 1000) / 1000 : 0,
      maximumMs: Math.round(target.maximumMs * 1000) / 1000
    };
  }

  snapshot() {
    const now = this.clock();
    while (this.timestamps[0] < now - 1000) this.timestamps.shift();
    while (this.publicationTimestamps[0] < now - 1000) this.publicationTimestamps.shift();
    return {
      received: this.received,
      published: this.published,
      coalesced: Math.max(0, this.received - this.published),
      lastRevision: this.lastRevision,
      firstEventAt: this.firstEventAt,
      lastEventAt: this.lastEventAt,
      lastEventAgeMs: this.lastEventAt === null ? null : Math.max(0, now - this.lastEventAt),
      eventsPerSecond: this.timestamps.length,
      publicationsPerSecond: this.publicationTimestamps.length,
      peakEventsPerSecond: this.peakEventsPerSecond,
      byType: { ...this.byType },
      byScope: { ...this.byScope },
      itemSerialization: this.measurement(this.itemSerialization),
      inventorySnapshotSerialization: this.measurement(this.snapshotSerialization)
    };
  }
}

module.exports = { InventoryPipelineTelemetry };
