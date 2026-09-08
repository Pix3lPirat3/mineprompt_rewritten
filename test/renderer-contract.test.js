'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('renderer selectors match unique interface elements', () => {
  const html = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'src', 'js', 'renderer.js'), 'utf8');
  const ids = [...html.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]);
  const selectors = [...renderer.matchAll(/querySelector\('#([^']+)'\)/gu)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const selector of selectors) assert.equal(ids.includes(selector), true, `Missing interface element #${selector}`);
});

test('preload requests have matching trusted IPC handlers', () => {
  const preload = fs.readFileSync(path.join(root, 'src', 'js', 'preload.js'), 'utf8');
  const electron = fs.readFileSync(path.join(root, 'src', 'electron.js'), 'utf8');
  const requests = [...preload.matchAll(/ipcRenderer\.invoke\('([^']+)'/gu)].map((match) => match[1]);
  const handlers = [...electron.matchAll(/ipcMain\.handle\('([^']+)'/gu)].map((match) => match[1]);
  assert.deepEqual(requests.toSorted(), handlers.toSorted());
});
