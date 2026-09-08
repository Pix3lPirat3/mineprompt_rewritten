'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const espree = require('espree');

const root = path.resolve(__dirname, '..');
const checkedExtensions = new Set(['.css', '.html', '.js', '.json', '.md']);
const excludedDirectories = new Set(['.git', 'node_modules', 'out']);

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (excludedDirectories.has(entry.name)) return [];
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return checkedExtensions.has(path.extname(entry.name)) ? [target] : [];
  });
}

test('tracked source remains ASCII and free of comments', () => {
  const failures = [];
  for (const file of sourceFiles(root)) {
    const relative = path.relative(root, file);
    const source = fs.readFileSync(file, 'utf8');
    const extension = path.extname(file);
    const lines = source.split(/\r?\n/u);
    lines.forEach((line, index) => {
      if ([...line].some((character) => character.codePointAt(0) > 127)) failures.push(`${relative}:${index + 1} contains non-ASCII text`);
    });
    if (extension === '.js') {
      const parsed = espree.parse(source, { comment: true, ecmaVersion: 'latest', sourceType: 'script' });
      if (parsed.comments.length > 0) failures.push(`${relative} contains a comment`);
    }
    if (['.css', '.html'].includes(extension) && /\/\*|<!--/u.test(source)) failures.push(`${relative} contains a comment`);
  }
  assert.deepEqual(failures, []);
});
