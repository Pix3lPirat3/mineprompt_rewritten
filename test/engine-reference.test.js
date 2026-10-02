'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePullReference, profileId, pullReference } = require('../src/main/engine-reference');

test('parses GitHub pull request URLs and shorthand', () => {
  assert.deepEqual(parsePullReference('PrismarineJS/mineflayer#4140'), { owner: 'PrismarineJS', repository: 'mineflayer', number: 4140 });
  assert.deepEqual(parsePullReference('https://github.com/PrismarineJS/mineflayer/pull/4140/files'), { owner: 'PrismarineJS', repository: 'mineflayer', number: 4140 });
  assert.equal(pullReference(parsePullReference('Pix3lPirat3/prismarine-item#186')), 'Pix3lPirat3/prismarine-item#186');
  assert.throws(() => parsePullReference('mineflayer#4140'), /Invalid GitHub/u);
});

test('normalizes bounded engine profile identifiers', () => {
  assert.equal(profileId(' Bedrock Experimental '), 'bedrock-experimental');
  assert.throws(() => profileId('***'), /must contain/u);
});
