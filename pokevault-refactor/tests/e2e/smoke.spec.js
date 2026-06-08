const { test, expect } = require('@playwright/test');

test('app loads and shows PokéVault header', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.logo')).toBeVisible();
});

test('import prompt is visible on load', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#hdr-stats')).toBeVisible();
});
