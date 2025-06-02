import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
  },
  esbuild: {
    target: 'node18'
  }
});