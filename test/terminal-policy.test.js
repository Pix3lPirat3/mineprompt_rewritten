'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldStoreCommand } = require('../src/js/terminal-policy');

test('keeps ordinary commands out of sensitive history filters', () => {
  assert.equal(shouldStoreCommand('follow PlayerOne'), true);
  assert.equal(shouldStoreCommand('cmd /login secret-value'), false);
  assert.equal(shouldStoreCommand('COMMAND register password email@example.test'), false);
});
