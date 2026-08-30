import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'http',
          include: ['tests/http/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'architecture',
          include: ['tests/architecture/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
});
