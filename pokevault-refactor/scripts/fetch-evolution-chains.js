#!/usr/bin/env node
// One-time script: populate evolution_chains table from PokéAPI.
// Run: node scripts/fetch-evolution-chains.js
// Takes ~7 minutes (rate-limited to ~90 req/min to respect PokéAPI).

'use strict';

const SUPABASE_URL = 'https://jsozfpsfvvnnmipsksoh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impzb3pmcHNmdnZubm1pcHNrc29oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4ODQ2OTksImV4cCI6MjA4OTQ2MDY5OX0.Qyqo4cF1C_2STXPcMoob9jMRt_VoESmhJqTQkux6i30';

// Species that are standalone in GO — not part of any chain
const GO_STANDALONE = new Set(['Kleavor']);

// PokéAPI slug → exact Pokégenie display name for edge cases
const NAME_MAP = {
  // Gender symbol
  'nidoran-f': 'Nidoran♀',
  'nidoran-m': 'Nidoran♂',
  // Dots / apostrophes
  'mr-mime': 'Mr. Mime',
  'mime-jr': 'Mime Jr.',
  'mr-rime': 'Mr. Rime',
  "farfetchd": "Farfetch'd",
  "sirfetchd": "Sirfetch'd",
  // Preserved hyphens (GO uses these)
  'ho-oh': 'Ho-Oh',
  'porygon-z': 'Porygon-Z',
  'jangmo-o': 'Jangmo-o',
  'hakamo-o': 'Hakamo-o',
  'kommo-o': 'Kommo-o',
  // Colon
  'type-null': 'Type: Null',
  // Accented
  'flabebe': 'Flabébé',
  // Tapus
  'tapu-koko': 'Tapu Koko',
  'tapu-lele': 'Tapu Lele',
  'tapu-bulu': 'Tapu Bulu',
  'tapu-fini': 'Tapu Fini',
  // Ultra Beasts (compound names — these happen to title-case fine, but list for clarity)
  'nihilego': 'Nihilego',
  'buzzwole': 'Buzzwole',
  'pheromosa': 'Pheromosa',
  'xurkitree': 'Xurkitree',
  'celesteela': 'Celesteela',
  'kartana': 'Kartana',
  'guzzlord': 'Guzzlord',
  'poipole': 'Poipole',
  'naganadel': 'Naganadel',
  'stakataka': 'Stakataka',
  'blacephalon': 'Blacephalon',
  // Gen 9 Paradox — compound names with spaces
  'great-tusk': 'Great Tusk',
  'scream-tail': 'Scream Tail',
  'brute-bonnet': 'Brute Bonnet',
  'flutter-mane': 'Flutter Mane',
  'slither-wing': 'Slither Wing',
  'sandy-shocks': 'Sandy Shocks',
  'iron-treads': 'Iron Treads',
  'iron-bundle': 'Iron Bundle',
  'iron-hands': 'Iron Hands',
  'iron-jugulis': 'Iron Jugulis',
  'iron-moth': 'Iron Moth',
  'iron-thorns': 'Iron Thorns',
  'roaring-moon': 'Roaring Moon',
  'iron-valiant': 'Iron Valiant',
  'walking-wake': 'Walking Wake',
  'iron-leaves': 'Iron Leaves',
  'gouging-fire': 'Gouging Fire',
  'raging-bolt': 'Raging Bolt',
  'iron-boulder': 'Iron Boulder',
  'iron-crown': 'Iron Crown',
  // Treasures of Ruin — hyphens preserved (Pokégenie convention)
  'ting-lu': 'Ting-Lu',
  'chien-pao': 'Chien-Pao',
  'wo-chien': 'Wo-Chien',
  'chi-yu': 'Chi-Yu',
};

// Convert PokéAPI slug to Pokégenie display name.
// Simple case: 'tyrunt' → 'Tyrunt'. Complex cases handled by NAME_MAP.
function slugToName(slug) {
  if (NAME_MAP[slug]) return NAME_MAP[slug];
  // Default: title-case each hyphenated word, join with space
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Walk the evolution chain tree depth-first. Mutates rows array.
function walkChain(node, chainId, stage, evolvedFrom, rows) {
  const pokeapiName = node.species.name;
  const speciesName = slugToName(pokeapiName);
  const isStandalone = GO_STANDALONE.has(speciesName);
  const evolvesTo = node.evolves_to.map(n => slugToName(n.species.name));

  rows.push({
    species_name: speciesName,
    pokeapi_name: pokeapiName,
    chain_id: chainId,
    stage,
    evolves_from: evolvedFrom,
    evolves_to: evolvesTo.length ? evolvesTo : null,
    is_standalone: isStandalone,
    form: null,
    go_available: true,
  });

  for (const child of node.evolves_to) {
    walkChain(child, chainId, stage + 1, speciesName, rows);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function pokeApiFetch(url) {
  const res = await fetch(url);
  if (res.status === 404) throw new Error('404');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function supabaseReq(method, path, body) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=minimal' : 'count=exact',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Supabase ' + method + ' ' + path + ': ' + txt.slice(0, 300));
  }
}

async function main() {
  console.log('PokéVault — Evolution Chain Fetcher');
  console.log('=====================================');

  // Clear existing data first
  console.log('Clearing existing evolution_chains data...');
  await supabaseReq('DELETE', 'evolution_chains?id=gte.0', null);
  console.log('Cleared.\n');

  const allRows = [];
  const MAX_CHAIN = 650; // PokéAPI has ~549 chains through Gen 9; 650 gives headroom
  let found = 0, skipped = 0;

  console.log(`Fetching chains 1–${MAX_CHAIN} from PokéAPI (rate-limited, ~7 min)...`);

  for (let id = 1; id <= MAX_CHAIN; id++) {
    try {
      const chain = await pokeApiFetch(`https://pokeapi.co/api/v2/evolution-chain/${id}`);
      walkChain(chain.chain, id, 1, null, allRows);
      found++;
    } catch (e) {
      if (e.message !== '404') {
        console.error(`\nChain ${id} error: ${e.message}`);
      }
      skipped++;
    }
    await sleep(670); // ~89 req/min — just under PokéAPI's 100 req/min limit

    if (id % 10 === 0) {
      process.stdout.write(`\r  ${id}/${MAX_CHAIN} chains checked — ${found} found, ${allRows.length} species collected`);
    }
  }

  console.log(`\n\nChain fetch complete: ${found} chains, ${allRows.length} species rows.`);

  // Insert to Supabase in batches of 100
  console.log('\nInserting to Supabase...');
  const BATCH = 100;
  for (let i = 0; i < allRows.length; i += BATCH) {
    const batch = allRows.slice(i, i + BATCH);
    await supabaseReq('POST', 'evolution_chains', batch);
    process.stdout.write(`\r  ${Math.min(i + BATCH, allRows.length)}/${allRows.length} rows inserted`);
  }

  console.log('\n\nVerification spot-checks:');
  const samples = ['Tyrunt', 'Eevee', 'Pikachu', 'Growlithe', 'Scyther', 'Kleavor'];
  for (const name of samples) {
    const row = allRows.find(r => r.species_name === name);
    if (row) {
      console.log(`  ${name}: chain=${row.chain_id}, stage=${row.stage}, standalone=${row.is_standalone}, evolves_to=${JSON.stringify(row.evolves_to)}`);
    } else {
      console.log(`  ${name}: NOT FOUND — check name mapping`);
    }
  }

  console.log('\nDone!');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
