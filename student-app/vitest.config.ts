import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',      // auth.ts mocks localStorage — no jsdom needed
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['lib/**'],
    },
  },
});
