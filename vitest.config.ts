
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'src/webview/**',
        'src/types/**',
        'src/agent/orchestrator.ts',
        'src/providers/**',
        'src/services/browser-service.ts',
      ],
    },
    testTimeout: 10000,
  },
});
