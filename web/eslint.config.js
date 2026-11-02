import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import { importX } from 'eslint-plugin-import-x';

const typescriptSettings = importX.flatConfigs.typescript.settings;

const pure = [
  'src/cards',
  'src/equity',
  'src/engine',
  'src/brains',
  'src/cfr',
  'src/emotion',
  'src/face',
  'src/persona',
  'src/conversation',
  'src/coach',
];

const LAYERS = [
  'cards',
  'equity',
  'engine',
  'brains',
  'cfr',
  'emotion',
  'face',
  'persona',
  'conversation',
  'coach',
  'game',
  'ui',
];

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

const ARENA_MESSAGE =
  'tools/arena may import from src only cards, engine, brains, cfr, persona, conversation and game/records';
const VIEWER_MESSAGE = 'tools/arena/ui may import from src only game/records and types from engine';
const GAME_OUTSIDE_RECORDS = '(^|/)src/game(/(?!records/)|$)';

const arenaLayer = {
  files: ['tools/arena/**/*.ts', 'tools/arena/**/*.tsx'],
  rules: {
    '@typescript-eslint/no-restricted-imports': [
      'error',
      {
        patterns: [
          { regex: '(^|/)src/(ui|equity|main\\.tsx)(/|$)', message: ARENA_MESSAGE },
          { regex: GAME_OUTSIDE_RECORDS, message: ARENA_MESSAGE },
        ],
      },
    ],
  },
};

const viewerLayer = {
  files: ['tools/arena/ui/**/*.ts', 'tools/arena/ui/**/*.tsx'],
  ignores: ['**/*.test.ts', '**/*.test.tsx'],
  rules: {
    '@typescript-eslint/no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            regex: '(^|/)src/(ui|equity|cards|brains|cfr|main\\.tsx)(/|$)',
            message: VIEWER_MESSAGE,
          },
          { regex: GAME_OUTSIDE_RECORDS, message: VIEWER_MESSAGE },
          { regex: '(^|/)src/engine(/|$)', message: VIEWER_MESSAGE, allowTypeImports: true },
        ],
      },
    ],
  },
};

const EVALUATOR_GOLDEN_MESSAGE = 'tools/evaluator-golden may import from src only cards and equity';

const evaluatorGoldenLayer = {
  files: ['tools/evaluator-golden/**/*.ts'],
  rules: {
    '@typescript-eslint/no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            regex: '(^|/)src/(engine|brains|cfr|persona|conversation|game|ui|main\\.tsx)(/|$)',
            message: EVALUATOR_GOLDEN_MESSAGE,
          },
        ],
      },
    ],
  },
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
  layer('emotion', []),
  layer('face', ['emotion']),
  layer('persona', ['cards', 'equity', 'emotion'], ['engine']),
  layer('persona', ['cards', 'equity', 'emotion', 'engine'], [], ['src/persona/**/*.test.ts']),
  layer('conversation', ['cards', 'emotion'], ['engine', 'persona']),
  layer(
    'conversation',
    ['cards', 'equity', 'emotion', 'persona', 'engine'],
    [],
    ['src/conversation/**/*.test.ts', 'src/conversation/testSpeaker.ts'],
  ),
  layer('coach', ['cards', 'equity', 'brains'], ['engine', 'cfr']),
  layer('coach', ['cards', 'equity', 'brains', 'engine', 'cfr'], [], ['src/coach/**/*.test.ts']),
  layer('game', [
    'cards',
    'equity',
    'engine',
    'brains',
    'cfr',
    'persona',
    'conversation',
    'coach',
    'face',
  ]),
  layer('ui', ['game']),
  layer('main', ['game', 'ui'], [], ['src/main.tsx']),
  arenaLayer,
  viewerLayer,
  evaluatorGoldenLayer,
  ...pure.map((dir) => ({
    files: [`${dir}/**/*.ts`],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'Pass time in as an argument' },
        { name: 'performance', message: 'Pass time in as an argument' },
        { name: 'document', message: 'No DOM in this layer' },
        { name: 'window', message: 'No DOM in this layer' },
        { name: 'self', message: 'No DOM in this layer' },
        { name: 'navigator', message: 'No DOM in this layer' },
        { name: 'setTimeout', message: 'No timers in this layer' },
        { name: 'setInterval', message: 'No timers in this layer' },
        { name: 'fetch', message: 'Bytes enter through a reader passed in' },
        { name: 'localStorage', message: 'No storage in this layer' },
        { name: 'indexedDB', message: 'No storage in this layer' },
        { name: 'crypto', message: 'Randomness enters as an Rng' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Randomness enters as an Rng' },
      ],
    },
  })),
);
