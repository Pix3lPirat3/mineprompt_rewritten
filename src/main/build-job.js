'use strict';

const crypto = require('node:crypto');
const { blockStateString, normalizeMirror, normalizeRotation } = require('./blueprint-model');
const { normalizeBuildPolicy } = require('./build-policy');
const { normalizeDimension, normalizePosition, normalizeServer } = require('./storage-model');

const MAX_BUILD_JOBS = 100;
const MAX_BUILD_JOB_SAMPLES = 4096;
const BUILD_JOB_SCHEMA_VERSION = 2;
const BUILD_JOB_STATUSES = Object.freeze(['planned', 'running', 'paused', 'complete', 'failed', 'stopped']);

function boundedInteger(value, fallback = 0) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 2147483647) throw new Error('Build job counters must be non-negative integers.');
  return number;
}

function cleanPositionSamples(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_BUILD_JOB_SAMPLES).map((entry) => normalizePosition(entry, 'Build progress position'));
}

function cleanUnresolvedSamples(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_BUILD_JOB_SAMPLES).map((entry) => {
    const operation = String(entry?.operation || '').slice(0, 160);
    const message = String(entry?.message || '').slice(0, 512);
    if (!operation || !message) throw new Error('Build unresolved samples require an operation and message.');
    return { operation, position: normalizePosition(entry.position, 'Build unresolved position'), message };
  });
}

function cleanTemporaryBlocks(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_BUILD_JOB_SAMPLES).map((entry) => {
    if (typeof entry?.intermediate !== 'string' || typeof entry?.expected !== 'string') throw new Error('Temporary build blocks require exact intermediate and expected states.');
    const intermediate = blockStateString(entry.intermediate);
    const expected = blockStateString(entry.expected);
    return { position: normalizePosition(entry.position, 'Temporary build position'), intermediate, expected };
  });
}

function cleanBuildJob(input, options = {}) {
  if (!input || typeof input !== 'object') throw new Error('A build job is required.');
  if (input.schemaVersion !== BUILD_JOB_SCHEMA_VERSION) throw new Error('The build job schema is unsupported.');
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const id = String(input.id || '').trim().toLowerCase();
  const blueprintHash = String(input.blueprintHash || '').trim().toLowerCase();
  const status = String(input.status || 'planned').toLowerCase();
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(id)) throw new Error('A valid build job id is required.');
  if (!/^[a-f0-9]{64}$/u.test(blueprintHash)) throw new Error('A valid build blueprint hash is required.');
  if (!BUILD_JOB_STATUSES.includes(status)) throw new Error('The build job status is invalid.');
  const operationCount = boundedInteger(input.operationCount);
  const completedCount = boundedInteger(input.completedCount);
  const skippedCount = boundedInteger(input.skippedCount);
  const failedCount = boundedInteger(input.failedCount);
  if (completedCount + skippedCount > operationCount) throw new Error('Build job progress exceeds its operation count.');
  const metrics = input.metrics && typeof input.metrics === 'object' ? input.metrics : {};
  const travel = Number(metrics.travel);
  return {
    schemaVersion: BUILD_JOB_SCHEMA_VERSION,
    id,
    owner: String(input.owner || '').trim().slice(0, 128),
    blueprintHash,
    blueprintId: String(input.blueprintId || blueprintHash.slice(0, 16)).slice(0, 64),
    blueprintName: String(input.blueprintName || 'Blueprint').slice(0, 96),
    server: normalizeServer(input.server),
    dimension: normalizeDimension(input.dimension),
    anchor: normalizePosition(input.anchor, 'Build anchor'),
    rotation: normalizeRotation(input.rotation),
    mirror: normalizeMirror(input.mirror),
    policy: normalizeBuildPolicy(input.policy),
    status,
    phase: String(input.phase || status).slice(0, 64),
    operationCount,
    completedCount,
    skippedCount,
    failedCount,
    completedSamples: cleanPositionSamples(input.completedSamples),
    unresolvedSamples: cleanUnresolvedSamples(input.unresolvedSamples),
    temporaryScaffolds: cleanPositionSamples(input.temporaryScaffolds),
    temporaryBlocks: cleanTemporaryBlocks(input.temporaryBlocks),
    latestError: input.latestError ? String(input.latestError).slice(0, 1024) : null,
    metrics: {
      attempts: boundedInteger(metrics.attempts),
      retries: boundedInteger(metrics.retries),
      verified: boundedInteger(metrics.verified),
      travel: Number.isFinite(travel) ? Math.max(0, travel) : 0,
      startedAt: metrics.startedAt !== null && metrics.startedAt !== undefined && Number.isFinite(Number(metrics.startedAt)) ? Number(metrics.startedAt) : null,
      finishedAt: metrics.finishedAt !== null && metrics.finishedAt !== undefined && Number.isFinite(Number(metrics.finishedAt)) ? Number(metrics.finishedAt) : null
    },
    createdAt: input.createdAt !== null && input.createdAt !== undefined && Number.isFinite(Number(input.createdAt)) ? Number(input.createdAt) : now,
    updatedAt: now
  };
}

function createBuildJob(input, now = Date.now()) {
  return cleanBuildJob({ ...input, schemaVersion: BUILD_JOB_SCHEMA_VERSION, id: input?.id || crypto.randomUUID(), status: input?.status || 'planned', createdAt: now }, { now });
}

function cleanBuildJobs(value) {
  if (!Array.isArray(value)) return [];
  const jobs = [];
  const ids = new Set();
  for (const input of value.slice(-MAX_BUILD_JOBS)) {
    try {
      const job = cleanBuildJob(input, { now: Number(input?.updatedAt) || Date.now() });
      if (ids.has(job.id)) continue;
      ids.add(job.id);
      jobs.push(job);
    } catch {}
  }
  return jobs.sort((left, right) => right.updatedAt - left.updatedAt);
}

function updateBuildJob(job, patch, now = Date.now()) {
  return cleanBuildJob({ ...job, ...patch, metrics: { ...job.metrics, ...patch?.metrics }, id: job.id, blueprintHash: job.blueprintHash, createdAt: job.createdAt }, { now });
}

module.exports = { BUILD_JOB_SCHEMA_VERSION, BUILD_JOB_STATUSES, MAX_BUILD_JOBS, MAX_BUILD_JOB_SAMPLES, cleanBuildJob, cleanBuildJobs, createBuildJob, updateBuildJob };
