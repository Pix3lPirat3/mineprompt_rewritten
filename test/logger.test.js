'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { RuntimeLogger } = require('../src/main/logger');

function createLogger() {
  const events = [];
  const output = [];
  const originalConsole = {
    log: (message) => output.push(message),
    info: (message) => output.push(message),
    warn: (message) => output.push(message),
    error: (message) => output.push(message),
    debug: (message) => output.push(message)
  };
  return {
    events,
    output,
    logger: new RuntimeLogger((type, payload) => events.push({ type, payload }), originalConsole)
  };
}

test('records session-aware log entries', () => {
  const { events, output, logger } = createLogger();
  logger.child('bot-one').info('Connected', { host: 'localhost' });

  assert.equal(output.length, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'log');
  assert.equal(events[0].payload.sessionId, 'bot-one');
  assert.match(events[0].payload.message, /Connected/);
  assert.deepEqual(logger.recent(), [events[0].payload]);
});

test('applies global and session redactors in order', () => {
  const { events, logger } = createLogger();
  logger.setRedactor((message) => message.replaceAll('secret', '[global]'));
  logger.child('bot-one').setRedactor((message) => message.replaceAll('address', '[session]'));

  logger.child('bot-one').warn('secret address');
  logger.child('bot-two').warn('secret address');

  assert.equal(events[0].payload.message, '[global] [session]');
  assert.equal(events[1].payload.message, '[global] address');
});
