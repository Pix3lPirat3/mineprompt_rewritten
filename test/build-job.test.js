'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanBuildJobs, createBuildJob, updateBuildJob } = require('../src/main/build-job');

function jobInput() {
  return {
    blueprintHash: 'a'.repeat(64),
    blueprintName: 'Starter house',
    server: { host: 'Example.Test', port: 25565 },
    dimension: 'overworld',
    anchor: { x: 10.9, y: 64, z: -5.2 },
    rotation: 90,
    mirror: 'x',
    policy: {},
    operationCount: 12
  };
}

test('creates and updates durable build jobs', () => {
  const job = createBuildJob(jobInput(), 1000);
  assert.match(job.id, /^[a-f0-9-]{36}$/u);
  assert.deepEqual(job.server, { host: 'example.test', port: 25565 });
  assert.equal(job.dimension, 'minecraft:overworld');
  assert.deepEqual(job.anchor, { x: 10, y: 64, z: -6 });
  assert.equal(job.status, 'planned');
  const updated = updateBuildJob(job, {
    status: 'running',
    completedCount: 2,
    completedSamples: [{ x: 10, y: 64, z: -5 }],
    metrics: { attempts: 2, verified: 2, travel: 4.5, startedAt: 1050 }
  }, 1100);
  assert.equal(updated.id, job.id);
  assert.equal(updated.createdAt, 1000);
  assert.equal(updated.updatedAt, 1100);
  assert.equal(updated.completedCount, 2);
  assert.equal(updated.metrics.travel, 4.5);
});

test('drops invalid persisted jobs without migration', () => {
  const first = createBuildJob(jobInput(), 1000);
  const second = createBuildJob({ ...jobInput(), blueprintHash: 'b'.repeat(64) }, 2000);
  const jobs = cleanBuildJobs([first, { id: 'broken' }, second, first]);
  assert.deepEqual(jobs.map((job) => job.id), [second.id, first.id]);
});

test('rejects invalid identities and progress', () => {
  assert.throws(() => createBuildJob({ ...jobInput(), id: 'f'.repeat(36) }), /valid build job id/u);
  const job = createBuildJob(jobInput());
  assert.throws(() => updateBuildJob(job, { completedCount: 13 }), /exceeds/u);
  assert.throws(() => updateBuildJob(job, { status: 'unknown' }), /status/u);
});
