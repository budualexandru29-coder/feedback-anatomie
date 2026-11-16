import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  testMatch: /.*\.spec\.mjs/,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4173', locale: 'ro-RO', timezoneId: 'Europe/Bucharest' },
  webServer: {
    command: 'python3 -I -m http.server 4173 --bind 127.0.0.1 --directory site',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: true,
  },
});
