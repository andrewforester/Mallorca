import { defineConfig } from '@playwright/test';
import { DEVICES } from './e2e/shared.ts';
import { CONVERSATION_URL } from './e2e/conversationServer.ts';

const PREVIEW_PORT = Number(process.env.E2E_PORT ?? 4173);
const BASE_URL = `http://localhost:${PREVIEW_PORT}/`;
const IS_CI = Boolean(process.env.CI);
const TEST_TIMEOUT_MS = 180_000;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  timeout: TEST_TIMEOUT_MS,
  fullyParallel: true,
  forbidOnly: IS_CI,
  retries: IS_CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'phone',
      use: DEVICES.phone,
      testIgnore: '**/layout.spec.ts',
    },
    {
      name: 'small-phone',
      use: DEVICES['small-phone'],
      testMatch: ['**/layout.spec.ts', '**/table.spec.ts'],
    },
    {
      name: 'desktop',
      use: DEVICES.desktop,
      testIgnore: '**/layout.spec.ts',
    },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PREVIEW_PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: CONVERSATION_URL,
      VITE_SUPABASE_ANON_KEY: 'e2e-anon-key',
    },
  },
});
