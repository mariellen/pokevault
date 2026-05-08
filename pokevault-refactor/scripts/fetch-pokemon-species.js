#!/usr/bin/env node
// One-time script: populate pokemon_species table from PokéAPI.
// Run: SUPABASE_SERVICE_KEY=your-key node scripts/fetch-pokemon-species.js
// Takes ~12 minutes (1025 species × 670 ms rate limit).
// Prereq: run scripts/pokemon_species.sql in Supabase first.

'use strict';

const SUPABASE_URL = 'https://jsozfpsfvvnnmipsksoh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const ULTRA_BEASTS = new Set([
  'nihilego','buzzwole','pheromosa','xurkitree','celesteela',
  'kartana','guzzlord','poipole','naganadel','stakataka','blacephalon',
]);

// Same NAME_MAP as fetch-evolution-chains.js for consistent display names
const NAME_MAP = {
  'nidoran-f':'Nidoran♀','nidoran-m':'Nidoran♂',
  'mr-mime':'Mr. Mime','mime-jr':'Mime Jr.','mr-rime':'Mr. Rime',
  'farfetchd':"Farfetch'd",'sirfetchd':"Sirfetch'd",
  'ho-oh':'Ho-Oh','porygon-z':'Porygon-Z',
  'jangmo-o':'Jangmo-o','hakamo-o':'Hakamo-o','kommo-o':'Kommo-o',
  'type-null':'Type: Null','flabebe':'Flabébé',
  'tapu-koko':'Tapu Koko','tapu-lele':'Tapu Lele','tapu-bulu':'Tapu Bulu','tapu-fini':'Tapu Fini',
  'great-tusk':'Great Tusk','scream-tail':'Scream Tail','brute-bonnet':'Brute Bonnet',
  'flutter-mane':'Flutter Mane','slither-wing':'Slither Wing','sandy-shocks':'Sandy Shocks',
  'iron-treads':'Iron Treads','iron-bundle':'Iron Bundle','iron-hands':'Iron Hands',
  'iron-jugulis':'Iron Jugulis','iron-moth':'Iron Moth','iron-thorns':'Iron Thorns',
  'roaring-moon':'Roaring Moon','iron-valiant':'Iron Valiant',
  'walking-wake':'Walking Wake','iron-leaves':'Iron Leaves',
  'gouging-fire':'Gouging Fire','raging-bolt':'Raging Bolt',
  'iron-boulder':'Iron Boulder','iron-crown':'Iron Crown',
  'ting-lu':'Ting-Lu','chien-pao':'Chien-Pao','wo-chien':'Wo-Chien','chi-yu':'Chi-Yu',
};

function slugToName(slug) {
  if (NAME_MAP[slug]) return NAME_MAP[slug];
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function typeSlugToDisplay(t) {
  // PokéAPI type names are lowercase slugs — title-case them
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function genNumFromUrl(url) {
  // url like "https://pokeapi.co/api/v2/generation/1/"
  const m = url.match(/\/generation\/(\d+)\//);
  return m ? Number(m[1]) : null;
}

function evolvedFromId(s) {
  if (!s.evolves_from_species) return null;
  // URL like "https://pokeapi.co/api/v2/pokemon-species/123/"
  const m = s.evolves_from_species.url.match(/\/pokemon-species\/(\d+)\//);
  return m ? Number(m[1]) : null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function pokeApiFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
  return res.json();
}

async function supabaseReq(method, path, body) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=minimal,resolution=merge-duplicates' : 'count=exact',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Supabase ' + method + ' ' + path + ': ' + txt.slice(0, 300));
  }
}

function decodeJwtRole(token) {
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    return decoded.role || '(no role field)';
  } catch {
    return '(could not decode)';
  }
}

async function main() {
  console.log('PokéVault — Pokémon Species Fetcher');
  console.log('=====================================');

  // Key validation + JWT debug
  if (!SUPABASE_KEY) {
    console.error('Error: SUPABASE_SERVICE_KEY environment variable is not set.');
    console.error('Usage: SUPABASE_SERVICE_KEY=your-key node scripts/fetch-pokemon-species.js');
    process.exit(1);
  }
  console.log('Key length   :', SUPABASE_KEY.length);
  console.log('Key prefix   :', SUPABASE_KEY.substring(0, 30) + '...');
  console.log('JWT role     :', decodeJwtRole(SUPABASE_KEY));
  console.log('');

  // 1. Fetch all species list
  console.log('\nFetching species list from PokéAPI...');
  const listData = await pokeApiFetch('https://pokeapi.co/api/v2/pokemon-species?limit=1025&offset=0');
  const speciesList = listData.results; // [{name, url}]
  console.log(`Got ${speciesList.length} species.`);

  // 2. Clear existing data
  console.log('\nClearing existing pokemon_species data...');
  try {
    await supabaseReq('DELETE', 'pokemon_species?pokedex_number=gte.0', null);
    console.log('Cleared.');
  } catch (e) {
    console.error('Clear failed:', e.message);
    console.error('Ensure pokemon_species.sql has been run in Supabase first.');
    process.exit(1);
  }

  // 3. Fetch each species + its pokemon data (for types)
  console.log(`\nFetching ${speciesList.length} species (rate-limited ~670ms/req, ~12 min)...`);
  const allRows = [];
  let errors = 0;

  for (let i = 0; i < speciesList.length; i++) {
    const entry = speciesList[i];

    try {
      // Fetch species endpoint (id, legendary/mythical, evolves_from, generation)
      const s = await pokeApiFetch(entry.url);

      // Fetch pokemon endpoint for types (use numeric id = base form)
      const p = await pokeApiFetch(`https://pokeapi.co/api/v2/pokemon/${s.id}`);

      const types = p.types.sort((a, b) => a.slot - b.slot).map(t => typeSlugToDisplay(t.type.name));
      const type1 = types[0] || 'Normal';
      const type2 = types[1] || null;

      let category = 'Regular';
      if (ULTRA_BEASTS.has(s.name)) category = 'Ultra Beast';
      else if (s.is_mythical) category = 'Mythical';
      else if (s.is_legendary) category = 'Legendary';

      allRows.push({
        pokedex_number: s.id,
        name: slugToName(s.name),
        type1,
        type2,
        category,
        generation: genNumFromUrl(s.generation.url),
        is_in_go: true,           // default; Mariellen adjusts manually for unreleased
        is_shiny_available: false, // default; update via shiny data after insert
        evolves_from: evolvedFromId(s),
      });

      // evolves_from references — handle self-refs by clearing them (shouldn't happen, but safe)
      const last = allRows[allRows.length - 1];
      if (last.evolves_from === last.pokedex_number) last.evolves_from = null;

    } catch (e) {
      console.error(`\n  Error at ${entry.name}: ${e.message}`);
      errors++;
    }

    await sleep(670); // respect PokéAPI's ~100 req/min limit (we do 2 reqs per species)
    // Actually at 670ms with 2 reqs each we're at ~90 req/min — within limit

    if ((i + 1) % 10 === 0 || i === speciesList.length - 1) {
      process.stdout.write(`\r  ${i + 1}/${speciesList.length} — ${allRows.length} rows built`);
    }
  }

  console.log(`\n\nFetch complete: ${allRows.length} species, ${errors} errors.`);

  // 4. evolves_from: drop references to pokedex_numbers not in our set
  //    (avoids FK violations from regional evolutions that weren't fetched)
  const validNums = new Set(allRows.map(r => r.pokedex_number));
  allRows.forEach(r => {
    if (r.evolves_from && !validNums.has(r.evolves_from)) r.evolves_from = null;
  });

  // 5. Insert without evolves_from first (avoids FK cycle during insert)
  console.log('\nInserting species (pass 1 — no evolves_from)...');
  const pass1 = allRows.map(r => ({ ...r, evolves_from: null }));
  const BATCH = 100;
  for (let i = 0; i < pass1.length; i += BATCH) {
    await supabaseReq('POST', 'pokemon_species?on_conflict=pokedex_number', pass1.slice(i, i + BATCH));
    process.stdout.write(`\r  ${Math.min(i + BATCH, pass1.length)}/${pass1.length} inserted`);
  }

  // 6. Update evolves_from in a second pass
  const withEvo = allRows.filter(r => r.evolves_from !== null);
  if (withEvo.length) {
    console.log(`\n\nUpdating evolves_from for ${withEvo.length} species (pass 2)...`);
    for (let i = 0; i < withEvo.length; i++) {
      const r = withEvo[i];
      await supabaseReq(
        'PATCH',
        `pokemon_species?pokedex_number=eq.${r.pokedex_number}`,
        { evolves_from: r.evolves_from }
      );
      if ((i + 1) % 25 === 0 || i === withEvo.length - 1) {
        process.stdout.write(`\r  ${i + 1}/${withEvo.length}`);
      }
    }
  }

  console.log('\n\nSpot checks:');
  const spots = ['Bulbasaur','Charizard','Mewtwo','Espeon','Tropius','Nihilego','Dipplin'];
  for (const name of spots) {
    const r = allRows.find(x => x.name === name);
    if (r) console.log(`  ${name}: #${r.pokedex_number} ${r.type1}${r.type2?'/'+r.type2:''} ${r.category} gen${r.generation}`);
    else    console.log(`  ${name}: NOT FOUND — check name mapping`);
  }

  console.log(`
Done! ${allRows.length} species inserted.

Next steps:
  1. Review and set is_in_go=false for unreleased species (Dipplin etc.)
  2. Update is_shiny_available=true for species with shinies in GO
  3. Run the Collection Completion modal in PokéVault to verify
`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
