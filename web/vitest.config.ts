import preact from '@preact/preset-vite';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
          exclude: [
            ...configDefaults.exclude,
            '**/*.golden.test.ts',
            '**/*.bench.test.ts',
            'src/ui/**',
          ],
        },
      },
      {
        plugins: [preact()],
        test: {
          name: 'ui',
          include: ['src/ui/**/*.test.tsx', 'src/ui/**/*.test.ts', 'tools/**/*.test.tsx'],
          environment: 'happy-dom',
        },
      },
    ],
  },
});
