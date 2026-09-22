import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    // Tests share one database and truncate it — never run files in parallel.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
