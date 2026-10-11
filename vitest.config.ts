import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
  test: {
    // reminderBuilder is pure logic (only depends on utils/dates), so a fast
    // node environment is enough — no DOM/Capacitor required.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});