const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://localhost:8080',
    headless: true,
  },
  webServer: {
    command: 'npx serve . -p 8080',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
  },
});
