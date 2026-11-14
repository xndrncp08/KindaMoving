import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'ui-*.spec.ts',
  outputDir: '../../output/playwright/ui-test-results',
  fullyParallel: true,
  workers: 4,
  timeout: 60000,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    serviceWorkers: 'block',
    locale: 'en-CA',
    timezoneId: 'America/Edmonton',
    launchOptions: { args: ['--enable-unsafe-swiftshader'] },
  },
  webServer: [
    {
      command: 'node --experimental-strip-types e2e/fixtures/ui-backend.mjs',
      url: 'http://127.0.0.1:54329',
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        process.env.PW_PRODUCTION === '1'
          ? 'npm run start -- --port 3100'
          : 'npm run dev -- --port 3100',
      url: 'http://127.0.0.1:3100',
      reuseExistingServer: !process.env.CI,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54329',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-local-ui-only',
      },
    },
  ],
});
