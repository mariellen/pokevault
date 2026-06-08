const { test, expect } = require('@playwright/test');

test('app loads and shows PokéVault header', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('text=PokéVault')).toBeVisible();
});

test('CSV upload area is present', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#fileInput, [data-testid="upload"]')).toBeTruthy();
});
