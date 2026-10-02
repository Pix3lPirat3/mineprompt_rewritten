'use strict';

function startManagedLoop({ activities, id, label, detail = '', resources = [], run, delay, initialDelay = 0, onError = () => {}, schedule = setTimeout, cancel = clearTimeout }) {
  if (!activities || typeof activities.register !== 'function' || !id || typeof run !== 'function') throw new TypeError('An activity manager, loop id, and runner are required.');
  let running = true;
  let timer = null;
  const interval = () => {
    const value = typeof delay === 'function' ? delay() : delay;
    return Math.max(0, Number(value) || 0);
  };
  const stop = () => {
    running = false;
    if (timer !== null) cancel(timer);
    timer = null;
  };
  const tick = async () => {
    timer = null;
    if (!running) return;
    let nextDelay;
    try {
      const result = await run();
      if (result === false) {
        activities.stop(id);
        return;
      }
      if (Number.isFinite(result)) nextDelay = Math.max(0, Number(result));
    } catch (error) {
      try { onError(error); } catch {}
    }
    if (running) timer = schedule(tick, nextDelay ?? interval());
  };
  activities.register(id, { label: label || id, detail, resources, stop });
  timer = schedule(tick, Math.max(0, Number(initialDelay) || 0));
  return Object.freeze({ id, stop });
}

module.exports = { startManagedLoop };
