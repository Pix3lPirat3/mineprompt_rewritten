'use strict';

const path = require('node:path');
const { buildSync } = require('esbuild');

buildSync({
  entryPoints: [path.join(__dirname, 'index.js')],
  outfile: path.join(__dirname, 'index.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  minify: true,
  legalComments: 'none'
});
