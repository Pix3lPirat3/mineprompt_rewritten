import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';

const external = ['electron', ...builtinModules, ...builtinModules.map((module) => `node:${module}`)];

export default defineConfig({
  build: {
    rollupOptions: {
      external
    }
  }
});
