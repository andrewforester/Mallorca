import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import { importX } from 'eslint-plugin-import-x';

const typescriptSettings = importX.flatConfigs.typescript.settings;

const pure = ['src/cards', 'src/equity', 'src/engine', 'src/brains', 'src/cfr'];

const LAYERS = ['cards', 'equity', 'engine', 'brains', 'cfr', 'game', 'ui'];

const layer = (
  dir,
  allowed,
  typeOnly = [],
  files = [`src/${dir}/**/*.ts`, `src/${dir}/**/*.tsx`],
) => {
  const forbidden = LAYERS.filter(
    (l) => l !== dir && !allowed.includes(l) && !typeOnly.includes(l),
  );
  const allowedText = allowed.length ? allowed.join(', ') : 'itself';
  const typesText = typeOnly.length ? ` and types from ${typeOnly.join(', ')}` : '';
  const message = `src/${dir} may import only from ${allowedText}${typesText}`;
  const patterns = [{ regex: `(^|/)(${forbidden.join('|')})(/|$)`, message }];
  if (typeOnly.length) {
    patterns.push({ regex: `(^|/)(${typeOnly.join('|')})(/|$)`, message, allowTypeImports: true });
  }
  return {
    files,
    rules: { '@typescript-eslint/no-restricted-imports': ['error', { patterns }] },
  };
};

export default tseslint.config(
  {
    ignores: ['**/dist', '.vercel', 'node_modules', 'test-results', 'playwright-report'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    plugins: { 'import-x': importX },
    settings: {
      'import-x/extensions': typescriptSettings['import-x/extensions'],
      'import-x/parsers': typescriptSettings['import-x/parsers'],
      'import-x/resolver-next': [createTypeScriptImportResolver({ project: './tsconfig.json' })],
    },
    rules: {
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', 60],
      'max-depth': ['error', 3],
      complexity: ['error', 12],
      'max-params': ['error', 4],
      'import-x/no-cycle': 'error',
    },
  },
  layer('cards', []),
  layer('equity', ['cards']),
  layer('engine', ['cards', 'equity']),
  layer('brains', ['cards', 'equity'], ['engine']),
  layer('brains', ['cards', 'equity', 'engine'], [], ['src/brains/**/*.test.ts']),
  layer('cfr', ['cards'], ['engine', 'brains']),
  layer('cfr', ['cards', 'engine', 'brains'], [], ['src/cfr/**/*.test.ts']),
  layer('game', ['cards', 'equity', 'engine', 'brains', 'cfr']),
  layer('ui', ['game']),
  ...pure.map((dir) => ({
    files: [`${dir}/**/*.ts`],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'Pass time in as an argument' },
        { name: 'performance', message: 'Pass time in as an argument' },
        { name: 'document', message: 'No DOM in this layer' },
        { name: 'window', message: 'No DOM in this layer' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Randomness enters as an Rng' },
      ],
    },
  })),
);
