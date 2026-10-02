'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { GitHubSource } = require('../src/main/github-source');

function response(value, raw = false) {
  return { ok: true, status: 200, json: async () => value, text: async () => raw ? value : JSON.stringify(value) };
}

test('resolves pull metadata and the package at its exact head', async () => {
  const requests = [];
  const github = new GitHubSource({ fetchImpl: async (url, options) => {
    requests.push({ url, options });
    if (url.includes('/pulls/4140')) return response({
      title: 'Player loaded', state: 'open', draft: false, mergeable: true, mergeable_state: 'blocked', updated_at: '2026-09-23', html_url: 'https://github.com/PrismarineJS/mineflayer/pull/4140',
      head: { sha: 'a'.repeat(40), repo: { full_name: 'Pix3lPirat3/mineflayer', clone_url: 'https://github.com/Pix3lPirat3/mineflayer.git' } },
      base: { sha: 'b'.repeat(40), repo: { full_name: 'PrismarineJS/mineflayer', clone_url: 'https://github.com/PrismarineJS/mineflayer.git' } }
    });
    return response('{"name":"mineflayer","version":"4.39.0"}', true);
  } });
  const pull = await github.pull('PrismarineJS/mineflayer#4140');
  assert.equal(pull.package, 'mineflayer');
  assert.equal(pull.head.sha, 'a'.repeat(40));
  assert.equal(pull.mergeState, 'blocked');
  assert.equal(requests.length, 2);
  assert.equal(requests[1].url, `https://raw.githubusercontent.com/Pix3lPirat3/mineflayer/${'a'.repeat(40)}/package.json`);
  assert.equal(requests.every((request) => request.options.headers['User-Agent'].startsWith('MinePrompt/')), true);
});

test('authenticates only GitHub API requests', async () => {
  const requests = [];
  const github = new GitHubSource({ token: 'secret-token', fetchImpl: async (url, options) => {
    requests.push({ url, options });
    if (url.includes('/pulls/1')) return response({
      head: { sha: 'a'.repeat(40), repo: { full_name: 'Example/project', clone_url: 'https://github.com/Example/project.git' } },
      base: { sha: 'b'.repeat(40), repo: { full_name: 'PrismarineJS/project', clone_url: 'https://github.com/PrismarineJS/project.git' } }
    });
    return response('{"name":"project"}', true);
  } });
  await github.pull('PrismarineJS/project#1');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer secret-token');
  assert.equal(Object.hasOwn(requests[1].options.headers, 'Authorization'), false);
});

test('searches open PrismarineJS pull requests by author', async () => {
  const github = new GitHubSource({ fetchImpl: async () => response({ items: [{ repository_url: 'https://api.github.com/repos/PrismarineJS/mineflayer', number: 4140, title: 'Player loaded', html_url: 'https://example.test', updated_at: 'now' }] }) });
  const pulls = await github.openPulls('Pix3lPirat3');
  assert.deepEqual(pulls.map((pull) => pull.reference), ['PrismarineJS/mineflayer#4140']);
});
