import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    headless: true,
    channel: process.env.E2E_BROWSER_CHANNEL,
  },
  workers: 1,
  timeout: 60000,
  reporter: 'list',
});
