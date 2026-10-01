'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ApplicationRuntime } = require('../src/main/application-runtime');
const { BotSession } = require('../src/main/bot-session');
const { HostClient } = require('../src/main/host-client');
const { ProcessSession } = require('../src/main/process-session');
const { HOST_METHOD_NAMES, SESSION_METHOD_NAMES } = require('../src/main/transport-methods');

test('keeps runtime transport surfaces synchronized from one manifest', () => {
  for (const name of SESSION_METHOD_NAMES) {
    assert.equal(typeof BotSession.prototype[name], 'function', `BotSession.${name}`);
    assert.equal(typeof ProcessSession.prototype[name], 'function', `ProcessSession.${name}`);
  }
  for (const name of HOST_METHOD_NAMES) {
    assert.equal(typeof ApplicationRuntime.prototype[name], 'function', `ApplicationRuntime.${name}`);
    assert.equal(typeof HostClient.prototype[name], 'function', `HostClient.${name}`);
  }
});
