'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MAX_COMMAND_LENGTH, parseCommandLine, quoteArgument } = require('../src/main/command-line');

test('parses whitespace, quotes, and escaped characters', () => {
  assert.deepEqual(parseCommandLine('  connect -u "Player One" --host example.org  '), {
    name: 'connect',
    args: ['-u', 'Player One', '--host', 'example.org']
  });
  assert.deepEqual(parseCommandLine("chat 'hello world'"), { name: 'chat', args: ['hello world'] });
  assert.deepEqual(parseCommandLine('chat hello\\ world'), { name: 'chat', args: ['hello world'] });
});

test('normalizes command names and preserves empty quoted arguments', () => {
  assert.deepEqual(parseCommandLine('HeLP ""'), { name: 'help', args: [''] });
});

test('rejects incomplete and oversized input', () => {
  assert.throws(() => parseCommandLine('chat "unfinished'), /Missing closing/);
  assert.throws(() => parseCommandLine('a'.repeat(MAX_COMMAND_LENGTH + 1)), RangeError);
});

test('quotes arguments for safe command reconstruction', () => {
  assert.equal(quoteArgument('Player'), 'Player');
  assert.equal(quoteArgument('Player One'), '"Player One"');
  assert.deepEqual(parseCommandLine(`account add ${quoteArgument('A "quoted" name')}`).args, ['add', 'A "quoted" name']);
});
