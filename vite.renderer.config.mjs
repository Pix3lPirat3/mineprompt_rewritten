import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const require = createRequire(import.meta.url);
const textureMap = require('./src/js/item-texture-map.js');
const faithfulRoot = path.resolve('src', 'img', 'faithful');
const mappedBlocks = Object.values(textureMap).filter((source) => source.startsWith('faithful/blocks/')).map((source) => `${source}.png`);
const directBlocks = Object.keys(textureMap).flatMap((name) => ['', '_front', '_side', '_top'].map((suffix) => `faithful/blocks/${name}${suffix}.png`));
const blockSources = [...new Set([...mappedBlocks, ...directBlocks]
  .map((source) => path.resolve('src', 'img', source))
  .filter((source) => fs.existsSync(source)))]
  .map((source) => source.replaceAll('\\', '/'));
const imageSources = [
  { src: path.join(faithfulRoot, 'items').replaceAll('\\', '/'), dest: '.' },
  { src: path.join(faithfulRoot, 'effects').replaceAll('\\', '/'), dest: '.' },
  { src: path.join(faithfulRoot, 'gui').replaceAll('\\', '/'), dest: '.' },
  { src: blockSources, dest: 'img/faithful/blocks', rename: { stripBase: true } },
  { src: path.resolve('src', 'img', 'heads').replaceAll('\\', '/'), dest: '.' }
];

export default defineConfig({
  root: path.resolve('src/renderer'),
  base: './',
  plugins: [
    react(),
    viteStaticCopy({ targets: imageSources })
  ],
  build: {
    target: 'chrome142',
    sourcemap: false,
    outDir: path.resolve('.vite', 'renderer', 'main_window'),
    emptyOutDir: true
  }
});
