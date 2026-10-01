'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const parser = require('@typescript-eslint/parser');

const root = path.resolve(__dirname, '..');
const checkedExtensions = new Set(['.cjs', '.css', '.html', '.js', '.json', '.md', '.mjs', '.ts', '.tsx']);

function hasCodeComment(source) {
  const parsed = parser.parseForESLint(source, { comment: true, ecmaVersion: 'latest', jsx: true, sourceType: 'unambiguous' });
  return parsed.ast.comments.length > 0;
}

function sourceFiles() {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .filter((file) => checkedExtensions.has(path.extname(file)))
    .filter((file) => fs.existsSync(path.join(root, file)))
    .map((file) => path.join(root, file));
}

test('tracked source remains ASCII and free of comments', () => {
  const failures = [];
  for (const file of sourceFiles()) {
    const relative = path.relative(root, file);
    const source = fs.readFileSync(file, 'utf8');
    const extension = path.extname(file);
    const lines = source.split(/\r?\n/u);
    lines.forEach((line, index) => {
      if ([...line].some((character) => character.codePointAt(0) > 127)) failures.push(`${relative}:${index + 1} contains non-ASCII text`);
    });
    if (['.cjs', '.js', '.mjs', '.ts', '.tsx'].includes(extension) && hasCodeComment(source)) failures.push(`${relative} contains a comment`);
    if (['.css', '.html'].includes(extension) && /\/\*|<!--/u.test(source)) failures.push(`${relative} contains a comment`);
  }
  assert.deepEqual(failures, []);
});
