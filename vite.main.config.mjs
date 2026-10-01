import { builtinModules, createRequire } from 'node:module';
import { defineConfig } from 'vite';

const require = createRequire(import.meta.url);
const packageJson = require('./package.json');
const dependencies = Object.keys(packageJson.dependencies);
const dependencyPaths = dependencies.map((dependency) =>
  new RegExp(`^${dependency.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`)
);
const external = [
  'electron',
  ...builtinModules,
  ...builtinModules.map((module) => `node:${module}`),
  ...dependencies,
  ...dependencyPaths
];

export default defineConfig({
  build: {
    rollupOptions: {
      external
    }
  }
});
