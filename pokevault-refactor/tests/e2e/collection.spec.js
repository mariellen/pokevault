// ═══════════════════════════════════════════════════════════════════════
// PokéVault — Collection E2E flow (brief: playwright-expansion, v3.5.47)
//
// Meaningful E2E coverage for the CSV → family → render pipeline:
//   Group 1 — CSV upload flow            Group 4 — Filter buttons
//   Group 2 — Search (name + dex number) Group 5 — Mobile viewport
//   Group 3 — Nick copy (clipboard)      + existing smoke assertions
//
// No Google OAuth — the importer parses the CSV entirely client-side, so we
// drive the real <input type="file"> with a small synthetic fixture.
// ═══════════════════════════════════════════════════════════════════════
const path = require('path');
const { test, expect } = require('@playwright/test');

// ── Centralised selectors (prefer existing stable IDs / classes) ──────────
const SEL = {
  logo:        '.logo',
  hdrStats:    '#hdr-stats',
  fileInput:   '#fileInput',
  searchBox:   '#searchBox',
  searchClear: '#searchClear',
  familyCard:  '.family-card',
  familyHeader:'.family-header',
  mainNick:    '.main-nick',
  nickCell:    '.nick-starred, .nick-suggested', // the clickable <td> wrapping .main-nick
  greatFilter: 'button.league-btn[data-l="G"]',
};

const FIXTURE = path.join(__dirname, 'fixtures', 'synthetic-collection.csv');

// Expected values DERIVED FROM the fixture above — keep in sync if it changes:
//   14 data rows → 14 Pokémon total.
const TOTAL_POKEMON = 14;
//   12 distinct Pokédex numbers → 12 families
//   (Bulbasaur×2 #1, Eevee×2 #133, then 10 singletons).
const TOTAL_FAMILIES = 12;
//   Families with a member at Rank %(G) ≥ 90 (RULES.keepThreshold):
//   Bulbasaur (99%), Pikachu (95%), Abra (92%) → 3 families.
const GREAT_FAMILIES = 3;

// ── Clipboard stub: CI headless Chromium rejects navigator.clipboard.* on
// permission grounds. Record every written value on window.__copied instead.
// addInitScript re-runs before every navigation, and each test gets a fresh
// page (default Playwright isolation) so __copied never bleeds across tests.
async function installClipboardStub(page) {
  await page.addInitScript(() => {
    window.__copied = [];
    const stub = (t) => { window.__copied.push(String(t)); return Promise.resolve(); };
    try {
      if (!navigator.clipboard) {
        Object.defineProperty(navigator, 'clipboard', { value: {}, configurable: true });
      }
      navigator.clipboard.writeText = stub;
    } catch (e) {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: stub }, configurable: true });
    }
  });
}

// ── Seed a known collection without auth: upload the fixture CSV and wait on
// a deterministic post-load signal (header populated + families rendered).
//
// On window.load the app calls autoLoadFromCloud() → Supabase anon read, which
// would render a non-deterministic demo collection. We abort every Supabase
// request so that path falls back silently to the import screen (the app's
// documented "cloud unavailable" behaviour), leaving our fixture as the sole
// deterministic data source. No OAuth, no app changes.
async function seedCollection(page) {
  await installClipboardStub(page);
  await page.route('**/*.supabase.co/**', route => route.abort());
  // networkidle lets the on-load cloud probe abort + settle (loadInProgress
  // cleared, file input re-enabled) before we drive the upload.
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator(SEL.logo)).toBeVisible();
  await expect(page.locator(SEL.fileInput)).toBeEnabled();
  await page.locator(SEL.fileInput).setInputFiles(FIXTURE);
  // Header switches from the import prompt to "Total N ..." once analyse() runs.
  await expect(page.locator(SEL.hdrStats)).toContainText('Total', { timeout: 15000 });
  // Fail loudly if the fixture headers drifted and produced zero families.
  await expect(page.locator(SEL.familyCard).first()).toBeAttached({ timeout: 15000 });
}

test.beforeEach(async ({ page }) => {
  await seedCollection(page);
});

// ─────────────────────────────────────────────────────────────────────────
// Group 1 — CSV upload flow
// ─────────────────────────────────────────────────────────────────────────
test('CSV upload → header shows the collection total and all families render', async ({ page }) => {
  await expect(page.locator(SEL.hdrStats)).toContainText(new RegExp(`Total\\s*${TOTAL_POKEMON}`));
  // Non-zero guard + exact family count from the fixture.
  await expect(page.locator(SEL.familyCard)).toHaveCount(TOTAL_FAMILIES);
});

test('CSV upload → at least one family renders with a non-empty suggested nick', async ({ page }) => {
  // Rows live in the DOM even while a family card is collapsed; read text directly.
  const nonEmptyNicks = await page.locator(SEL.mainNick).evaluateAll(
    els => els.filter(e => (e.textContent || '').trim().length > 0).length
  );
  expect(nonEmptyNicks).toBeGreaterThan(0);
});

test('CSV upload → search box is present and editable', async ({ page }) => {
  const box = page.locator(SEL.searchBox);
  await expect(box).toBeVisible();
  await box.fill('test');
  await expect(box).toHaveValue('test');
});

// ─────────────────────────────────────────────────────────────────────────
// Group 2 — Search
// ─────────────────────────────────────────────────────────────────────────
test('Search by name → only the matching family surfaces', async ({ page }) => {
  await page.locator(SEL.searchBox).fill('Bulbasaur');
  await expect(page.locator(SEL.familyCard)).toHaveCount(1);
  await expect(page.locator(SEL.familyCard).first()).toContainText('Bulbasaur');
});

test('Search by Pokédex number → only the matching family surfaces', async ({ page }) => {
  // Eevee is #133; dex search is an exact match (does not match 13 / 1330 etc.).
  await page.locator(SEL.searchBox).fill('133');
  await expect(page.locator(SEL.familyCard)).toHaveCount(1);
  await expect(page.locator(SEL.familyCard).first()).toContainText('Eevee');
});

test('Clear search → full family count is restored', async ({ page }) => {
  await page.locator(SEL.searchBox).fill('Bulbasaur');
  await expect(page.locator(SEL.familyCard)).toHaveCount(1);
  await page.locator(SEL.searchClear).click();
  await expect(page.locator(SEL.searchBox)).toHaveValue('');
  await expect(page.locator(SEL.familyCard)).toHaveCount(TOTAL_FAMILIES);
});

// ─────────────────────────────────────────────────────────────────────────
// Group 3 — Nick copy
// ─────────────────────────────────────────────────────────────────────────
test('Nick copy → "Copied!" toast appears and the copied string equals the nick', async ({ page }) => {
  // Searching a single species auto-expands that family (≤3 families open),
  // making its nick cells visible and clickable.
  await page.locator(SEL.searchBox).fill('Bulbasaur');
  await expect(page.locator(SEL.familyCard)).toHaveCount(1);

  const nickCell = page.locator(SEL.nickCell).first();
  await expect(nickCell).toBeVisible();
  const expectedNick = await nickCell.getAttribute('data-nick');
  expect((expectedNick || '').length).toBeGreaterThan(0);

  await nickCell.click();

  await expect(page.locator('#pv-toast')).toHaveText('Copied!');
  const copied = await page.evaluate(() => window.__copied.at(-1));
  expect(copied).toBe(expectedNick);
});

// ─────────────────────────────────────────────────────────────────────────
// Group 4 — Filter buttons (toggle on → subset, toggle off → restored)
// NOTE: the app has no "stars-only" filter (★ Stars is a sort cycle), so this
// exercises the real Great-league toggle filter instead. See impl-summary.
// ─────────────────────────────────────────────────────────────────────────
test('Great filter ON → only Great-qualifying families show', async ({ page }) => {
  await expect(page.locator(SEL.familyCard)).toHaveCount(TOTAL_FAMILIES);
  await page.locator(SEL.greatFilter).click();
  await expect(page.locator(SEL.familyCard)).toHaveCount(GREAT_FAMILIES);
});

test('Great filter toggle OFF → all families return', async ({ page }) => {
  await page.locator(SEL.greatFilter).click();
  await expect(page.locator(SEL.familyCard)).toHaveCount(GREAT_FAMILIES);
  await page.locator(SEL.greatFilter).click();
  await expect(page.locator(SEL.familyCard)).toHaveCount(TOTAL_FAMILIES);
});

// ─────────────────────────────────────────────────────────────────────────
// Group 5 — Mobile viewport (390px)
// ─────────────────────────────────────────────────────────────────────────
test.describe('mobile 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('header stats visible and page does not overflow horizontally', async ({ page }) => {
    await expect(page.locator(SEL.hdrStats)).toBeVisible();
    await expect(page.locator(SEL.familyCard).first()).toBeAttached();
    // .family-body uses overflow-x:auto for its wide table (intentional inner
    // scroll), so the meaningful regression is page-level horizontal overflow.
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Existing smoke assertions — preserved (the old smoke.spec.js coverage).
// ─────────────────────────────────────────────────────────────────────────
test('smoke — logo and header stats remain visible after load', async ({ page }) => {
  await expect(page.locator(SEL.logo)).toBeVisible();
  await expect(page.locator(SEL.hdrStats)).toBeVisible();
});
