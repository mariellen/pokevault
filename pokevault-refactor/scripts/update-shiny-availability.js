#!/usr/bin/env node
// Updates is_shiny_available in pokemon_species from Bulbapedia's shiny GO list.
// Run: SUPABASE_SERVICE_KEY=your-key node scripts/update-shiny-availability.js
//
// Flags:
//   --dry-run              Show what would be updated without writing to DB
//   --debug                Print first 3000 chars of fetched HTML
//   --reset                Set ALL species to is_shiny_available=false first (then re-apply)
//   --local-file path.html Read HTML from disk instead of fetching (use if site blocks scraping)

'use strict';

const fs = require('fs');

const SUPABASE_URL  = 'https://jsozfpsfvvnnmipsksoh.supabase.co';
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY;

const BULBAPEDIA_URL = 'https://bulbapedia.bulbagarden.net/wiki/List_of_Shiny_Pok%C3%A9mon_in_Pok%C3%A9mon_GO';

// ── Parse strategies ──────────────────────────────
//
// Strategy A (primary): extract Pokémon names from /wiki/NAME_(Pokémon) links,
//   then resolve to pokedex_number via the pokemon_species table.
//   Handles all name-encoding edge cases via URL decode + normalisation.
//
// Strategy B (supplement): extract 3-4 digit Ndex numbers directly from
//   table cells — catches anything Strategy A misses if page structure varies.
//   False positives are filtered by cross-checking against known DB numbers.

// Matches href="/wiki/Bulbasaur_(Pok%C3%A9mon)" or href="/wiki/Bulbasaur_(Pokémon)"
const WIKI_LINK_RE = /href="\/wiki\/([^"#]+?)_\(Pok(?:%C3%A9|é)mon\)"/g;

// Matches standalone 3–4 digit numbers in table cells (with optional # prefix / leading zeros)
// e.g. <td>001</td>  <td>#025</td>  <td><b>0007</b></td>
const NDEX_CELL_RE = /<td[^>]*>(?:<[^>]+>)*\s*#?0*([1-9]\d{0,3})\s*(?:<\/[^>]+>)*<\/td>/g;

// ── Flags ─────────────────────────────────────────
const DRY_RUN    = process.argv.includes('--dry-run');
const DEBUG      = process.argv.includes('--debug');
const RESET      = process.argv.includes('--reset');
const LOCAL_IDX  = process.argv.indexOf('--local-file');
const LOCAL_FILE = LOCAL_IDX !== -1 ? process.argv[LOCAL_IDX + 1] : null;

// ── JWT debug ─────────────────────────────────────
function decodeJwtRole(token) {
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    return decoded.role || '(no role field)';
  } catch {
    return '(could not decode)';
  }
}

// ── Name normalisation ────────────────────────────
// Strips punctuation / casing differences so "Mr. Mime", "mr. mime", "Mr._Mime" all match.
// Keeps ♀ ♂ é to distinguish Nidoran♀/♂ and Flabébé from other species.
function normaliseName(raw) {
  return raw.toLowerCase().replace(/[^a-z0-9♀♂é]/g, '');
}

// ── Supabase helpers ──────────────────────────────
async function supabaseReq(method, path, body) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method,
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type':  'application/json',
      'Prefer':        'return=minimal',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Supabase ' + method + ' ' + path.split('?')[0] + ': ' + txt.slice(0, 300));
  }
  return res;
}

async function fetchAllSpecies() {
  console.log('Fetching species list from pokemon_species...');
  const res = await fetch(
    SUPABASE_URL + '/rest/v1/pokemon_species?select=pokedex_number,name&order=pokedex_number&limit=2000',
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
  );
  if (!res.ok) throw new Error('Could not read pokemon_species: HTTP ' + res.status);
  const rows = await res.json();
  console.log(`  ${rows.length} species loaded from DB.`);
  return rows;
}

// ── HTML source ───────────────────────────────────
async function getHtml() {
  if (LOCAL_FILE) {
    if (!fs.existsSync(LOCAL_FILE)) throw new Error(`--local-file: not found: ${LOCAL_FILE}`);
    const html = fs.readFileSync(LOCAL_FILE, 'utf8');
    console.log(`Reading local file: ${LOCAL_FILE} (${Math.round(html.length / 1024)} KB)`);
    return html;
  }

  console.log('Fetching:', BULBAPEDIA_URL);
  const res = await fetch(BULBAPEDIA_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept':     'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Referer':    'https://bulbapedia.bulbagarden.net/',
    },
  });

  console.log('HTTP status:', res.status, res.statusText);

  if (!res.ok) {
    const body = await res.text();
    if (DEBUG) console.log('\n── Response body (first 2000 chars) ──\n' + body.slice(0, 2000));
    console.error(`
Bulbapedia returned HTTP ${res.status}. Save the page manually from a browser and run with:
  SUPABASE_SERVICE_KEY=your-key node scripts/update-shiny-availability.js --local-file path/to/file.html

Steps:
  1. Open in browser: ${BULBAPEDIA_URL}
  2. Save page (Ctrl+S / Cmd+S) as "Webpage, HTML Only" (.html)
  3. Re-run with: --local-file path/to/saved.html
`);
    process.exit(1);
  }

  const html = await res.text();
  console.log(`Response size: ${Math.round(html.length / 1024)} KB`);
  return html;
}

// ── Strategy A: wiki link names → DB lookup ───────
function extractWikiNames(html) {
  const names = new Set();
  let m;
  WIKI_LINK_RE.lastIndex = 0;
  while ((m = WIKI_LINK_RE.exec(html)) !== null) {
    try {
      // URL-decode then replace underscores with spaces
      const decoded = decodeURIComponent(m[1]).replace(/_/g, ' ').trim();
      if (decoded) names.add(decoded);
    } catch {
      // Malformed encoding — skip
    }
  }
  return [...names];
}

function resolveNamesToNums(wikiNames, speciesRows) {
  // Build normalised-name → pokedex_number map from DB
  const nameMap = new Map();
  for (const row of speciesRows) {
    nameMap.set(normaliseName(row.name), row.pokedex_number);
  }

  const matched   = [];
  const unmatched = [];

  for (const name of wikiNames) {
    const key = normaliseName(name);
    if (nameMap.has(key)) {
      matched.push(nameMap.get(key));
    } else {
      // Try stripping a form qualifier after the last space
      // e.g. "Giratina Origin Forme" → try "Giratina"
      const baseName = name.split(' ')[0];
      const baseKey  = normaliseName(baseName);
      if (baseName !== name && nameMap.has(baseKey)) {
        matched.push(nameMap.get(baseKey));
      } else {
        unmatched.push(name);
      }
    }
  }

  return { matched: [...new Set(matched)], unmatched };
}

// ── Strategy B: direct Ndex numbers from table cells ──
function extractDirectNums(html) {
  const nums = new Set();
  let m;
  NDEX_CELL_RE.lastIndex = 0;
  while ((m = NDEX_CELL_RE.exec(html)) !== null) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 1025) nums.add(n);
  }
  return [...nums].sort((a, b) => a - b);
}

// ── DB update in chunks ───────────────────────────
async function setShinyBatch(nums, value) {
  const CHUNK = 100;
  let done = 0;
  for (let i = 0; i < nums.length; i += CHUNK) {
    const chunk = nums.slice(i, i + CHUNK);
    await supabaseReq('PATCH', 'pokemon_species?pokedex_number=in.(' + chunk.join(',') + ')', { is_shiny_available: value });
    done += chunk.length;
    process.stdout.write(`\r  ${done}/${nums.length} updated`);
  }
  console.log('');
}

// ── Main ──────────────────────────────────────────
async function main() {
  console.log('PokéVault — Shiny Availability Updater');
  console.log('=======================================');
  if (DRY_RUN)    console.log('MODE: --dry-run (no DB writes)');
  if (RESET)      console.log('MODE: --reset (zeroing all first)');
  if (LOCAL_FILE) console.log('MODE: --local-file');
  console.log('');

  if (!SUPABASE_KEY) {
    console.error('Error: SUPABASE_SERVICE_KEY environment variable is not set.');
    console.error('Usage: SUPABASE_SERVICE_KEY=your-key node scripts/update-shiny-availability.js');
    process.exit(1);
  }
  console.log('Key length   :', SUPABASE_KEY.length);
  console.log('Key prefix   :', SUPABASE_KEY.substring(0, 30) + '...');
  console.log('JWT role     :', decodeJwtRole(SUPABASE_KEY));
  console.log('');

  // 1. Get HTML
  const html = await getHtml();

  if (DEBUG) {
    console.log('\n── Raw HTML (first 3000 chars) ──');
    console.log(html.slice(0, 3000));
    console.log('── End raw HTML ──\n');
  }

  // 2. Load species from DB (needed for name→number resolution)
  const speciesRows = await fetchAllSpecies();
  const validNums   = new Set(speciesRows.map(r => r.pokedex_number));
  console.log('');

  // 3. Strategy A — wiki link names
  const wikiNames = extractWikiNames(html);
  console.log(`Strategy A: found ${wikiNames.length} unique wiki-linked species names.`);

  const { matched: numsA, unmatched } = resolveNamesToNums(wikiNames, speciesRows);
  console.log(`            resolved ${numsA.length} to Pokédex numbers, ${unmatched.length} unmatched.`);
  if (unmatched.length > 0 && unmatched.length <= 30) {
    console.log('            Unmatched:', unmatched.join(', '));
  } else if (unmatched.length > 30) {
    console.log('            Unmatched (first 30):', unmatched.slice(0, 30).join(', '));
    console.log('            Run with --debug to see full HTML and investigate.');
  }

  // 4. Strategy B — direct Ndex numbers
  const numsB = extractDirectNums(html).filter(n => validNums.has(n));
  console.log(`Strategy B: found ${numsB.length} Pokédex numbers directly in table cells.`);

  // 5. Union
  const combined = [...new Set([...numsA, ...numsB])].sort((a, b) => a - b);
  console.log(`\nCombined: ${combined.length} shiny-available species`);
  console.log(`  (A-only: ${numsA.filter(n => !numsB.includes(n)).length}, B-only: ${numsB.filter(n => !numsA.includes(n)).length}, both: ${numsA.filter(n => numsB.includes(n)).length})`);

  if (combined.length === 0) {
    console.error('\nParse yielded 0 results. The page structure may differ from expected.');
    console.error('First 1500 chars of HTML:');
    console.log(html.slice(0, 1500));
    console.error('\nRun with --debug for more. Try --local-file with a browser-saved copy.');
    process.exit(1);
  }

  if (combined.length < 100) {
    console.warn(`\n⚠  Only ${combined.length} found — expected 600+. Run with --debug to inspect HTML.`);
  }

  console.log(`\nSample (first 20):`, combined.slice(0, 20).join(', '));
  console.log(`Sample (last  20):`, combined.slice(-20).join(', '));

  if (DRY_RUN) {
    console.log('\n[dry-run] Would set is_shiny_available=true for', combined.length, 'species.');
    console.log('[dry-run] No DB writes performed.');
    return;
  }

  // 6. Optionally reset
  if (RESET) {
    console.log('\nResetting all species to is_shiny_available=false...');
    await supabaseReq('PATCH', 'pokemon_species?pokedex_number=gte.0', { is_shiny_available: false });
    console.log('Reset done.');
  }

  // 7. Update
  console.log('\nSetting is_shiny_available=true for', combined.length, 'species...');
  await setShinyBatch(combined, true);

  // 8. Spot-check readback
  console.log('\nSpot-check readback...');
  const spotNums = [1, 4, 7, 25, 133, 147, 246];
  const checkQ   = 'pokemon_species?select=pokedex_number,name,is_shiny_available&pokedex_number=in.(' + spotNums.join(',') + ')&order=pokedex_number';
  const verifyRes = await fetch(SUPABASE_URL + '/rest/v1/' + checkQ, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY },
  });
  if (verifyRes.ok) {
    const rows = await verifyRes.json();
    rows.forEach(r => {
      const mark     = r.is_shiny_available ? '✓' : '✗';
      const expected = combined.includes(r.pokedex_number) ? 'expected ✓' : 'expected ✗';
      console.log(`  ${mark} #${String(r.pokedex_number).padStart(3, '0')} ${r.name} (${expected})`);
    });
  } else {
    console.log('  (readback failed — verify manually in Supabase)');
  }

  console.log(`\nDone! ${combined.length} species set to is_shiny_available=true.`);
  if (unmatched.length > 0) {
    console.log(`${unmatched.length} Bulbapedia names had no DB match — check if pokemon_species is fully populated.`);
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
