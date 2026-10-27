import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000/',
    channel: 'msedge',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-edge',
      use: { channel: 'msedge', viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'mobile-edge',
      use: { ...devices['Pixel 7'], channel: 'msedge' },
    },
  ],
});
