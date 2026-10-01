'use strict';

const { createActor, createMachine } = require('xstate');

function automationMachine(id) {
  return createMachine({
    id,
    initial: 'running',
    states: {
      running: { on: { STOP: 'stopping', DONE: 'completed', FAIL: 'failed' } },
      stopping: { type: 'final' },
      completed: { type: 'final' },
      failed: { type: 'final' }
    }
  });
}

class AutomationRuntime {
  constructor(activities, logger) {
    this.activities = activities;
    this.logger = logger;
    this.jobs = new Map();
  }

  start({ id, label, detail = '', resources = [], run }) {
    if (!id || typeof run !== 'function') throw new TypeError('An automation id and runner are required.');
    if (this.jobs.has(id)) throw new Error(`${id} is already running.`);
    const controller = new AbortController();
    const actor = createActor(automationMachine(id));
    const job = { id, actor, controller, stopped: false };
    this.jobs.set(id, job);
    actor.start();
    try {
      this.activities.register(id, {
        label,
        detail,
        resources,
        stop: () => this.stopJob(job)
      });
    } catch (error) {
      this.jobs.delete(id);
      actor.stop();
      throw error;
    }
    const update = (nextDetail) => this.activities.update(id, nextDetail);
    let outcome;
    try {
      outcome = run(controller.signal, { update });
    } catch (error) {
      outcome = Promise.reject(error);
    }
    Promise.resolve(outcome).then(
      () => this.settle(job, 'DONE'),
      (error) => {
        if (!controller.signal.aborted) this.logger.error(`[Automation] ${label || id}: ${error.message}`);
        this.settle(job, controller.signal.aborted ? 'STOP' : 'FAIL');
      }
    );
    return this.snapshot(id);
  }

  stop(id) {
    return this.activities.stop(id);
  }

  stopJob(job) {
    if (job.stopped) return;
    job.stopped = true;
    job.actor.send({ type: 'STOP' });
    job.controller.abort();
    this.jobs.delete(job.id);
    job.actor.stop();
  }

  settle(job, event) {
    if (!this.jobs.has(job.id)) return;
    job.actor.send({ type: event });
    this.jobs.delete(job.id);
    this.activities.finish(job.id);
    job.actor.stop();
  }

  snapshot(id) {
    const job = this.jobs.get(id);
    if (!job) return null;
    return { id, state: String(job.actor.getSnapshot().value) };
  }

  close() {
    for (const id of [...this.jobs.keys()]) this.stop(id);
  }
}

module.exports = { AutomationRuntime, automationMachine };
