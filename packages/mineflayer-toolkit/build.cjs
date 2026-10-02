'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { buildSync } = require('esbuild');

const names = ['index', 'runtime', 'navigation', 'mining', 'trees', 'inventory', 'interactions'];
const entryPoints = Object.fromEntries(names.map((name) => [name, path.join(__dirname, 'source', `${name}.js`)]));
const shared = {
  entryPoints,
  outdir: path.join(__dirname, 'dist'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  minify: true,
  legalComments: 'none',
  sourcemap: false,
  external: ['ajv', 'mineflayer', 'mineflayer-pathfinder', 'prismarine-nbt', 'vec3']
};

buildSync({ ...shared, format: 'cjs', outExtension: { '.js': '.cjs' } });
for (const name of names) {
  const values = require(path.join(__dirname, 'dist', `${name}.cjs`));
  const exports = Object.keys(values).filter((key) => /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(key)).sort();
  const source = `import api from './${name}.cjs';\nconst { ${exports.join(', ')} } = api;\nexport { ${exports.join(', ')} };\nexport default api;\n`;
  fs.writeFileSync(path.join(__dirname, 'dist', `${name}.js`), source);
}
