'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { checkForUpdate, compareVersions } = require('../src/main/update-check');

test('compares stable and prerelease versions', () => {
  assert.equal(compareVersions('2.0.0', '2.0.0-beta.1'), 1);
  assert.equal(compareVersions('v2.1.0', '2.0.9'), 1);
  assert.equal(compareVersions('2.0.0', '2.0.0'), 0);
  assert.equal(compareVersions('2.0.0-beta.10', '2.0.0-beta.2'), 1);
  assert.equal(compareVersions('2.0.0-beta.2', '2.0.0-beta.2.1'), -1);
  assert.throws(() => compareVersions('latest', '2.0.0'), /Invalid release version/u);
});

test('checks GitHub release metadata without downloading assets', async () => {
  const requests = [];
  const result = await checkForUpdate(async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      json: async () => [
        { tag_name: 'latest', draft: false, prerelease: false },
        { tag_name: 'v9.0.0-beta.2', draft: false, prerelease: true, html_url: 'https://example.test/beta' },
        { tag_name: 'v8.0.0', draft: false, prerelease: false, html_url: 'https://example.test/stable' }
      ]
    };
  });
  assert.equal(result.latestVersion, '9.0.0-beta.2');
  assert.equal(result.url, 'https://example.test/beta');
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /releases\?per_page=20/u);
});

test('keeps stable installations on the stable release channel', async () => {
  const result = await checkForUpdate(async () => ({
    ok: true,
    json: async () => [
      { tag_name: 'v3.0.0-beta.1', draft: false, prerelease: true },
      { tag_name: 'v2.5.0', draft: false, prerelease: false }
    ]
  }), '2.4.0');
  assert.equal(result.latestVersion, '2.5.0');
  assert.equal(result.available, true);
});
