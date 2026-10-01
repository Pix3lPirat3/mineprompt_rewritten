'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { RendererDiagnostics, boundedValue, normalizeRendererIssue } = require('../src/main/renderer-diagnostics');

test('bounds renderer issues and aggregates consecutive duplicates', () => {
  const diagnostics = new RendererDiagnostics(10);
  diagnostics.record({ area: 'React', message: 'Maximum update depth exceeded', context: { componentStack: 'InventoryWorkspace' }, timestamp: 1 });
  const duplicate = diagnostics.record({ area: 'React', message: 'Maximum update depth exceeded', context: { componentStack: 'InventoryWorkspace' }, timestamp: 2 });
  assert.equal(duplicate.occurrences, 2);
  for (let index = 0; index < 15; index += 1) diagnostics.record({ area: 'Renderer', message: `Issue ${index}`, context: {}, timestamp: index + 3 });
  assert.equal(diagnostics.recent(100).length, 10);
  assert.equal(diagnostics.recent(1)[0].message, 'Issue 14');
});

test('sanitizes renderer data into bounded serializable values', () => {
  const issue = normalizeRendererIssue({ area: 'A'.repeat(100), message: 'B'.repeat(9000), context: { nested: { value: 'ok' } } });
  assert.equal(issue.area.length, 80);
  assert.equal(issue.message.length, 8192);
  assert.deepEqual(boundedValue({ value: 2n }), { value: '2' });
});

test('stores the latest renderer view separately from incidents', () => {
  const diagnostics = new RendererDiagnostics();
  diagnostics.updateView({ viewport: { width: 1280 }, rendered: { contextMenus: 1 } });
  assert.equal(diagnostics.view().viewport.width, 1280);
  assert.equal(diagnostics.recent().length, 0);
});
