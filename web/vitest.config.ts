import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      projects: [
        {
          test: {
            name: 'node',
            include: [
              'src/**/*.test.ts',
              'tools/**/*.test.ts',
              'prototypes/**/*.test.ts',
              'scripts/**/*.test.ts',
            ],
            exclude: [
              ...configDefaults.exclude,
              '**/*.golden.test.ts',
              '**/*.bench.test.ts',
              'src/ui/**',
            ],
          },
        },
        {
          extends: true,
          test: {
            name: 'ui',
            include: ['src/ui/**/*.test.tsx', 'src/ui/**/*.test.ts', 'tools/**/*.test.tsx'],
            environment: 'happy-dom',
          },
        },
        {
          test: {
            name: 'golden',
            include: ['src/**/*.golden.test.ts'],
          },
        },
        {
          test: {
            name: 'bench',
            include: ['src/**/*.bench.test.ts'],
          },
        },
      ],
    },
  }),
);
