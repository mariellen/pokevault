// ═══════════════════════════════════════════════
// PokéVault — Static Game Data
// Pokémon type sets and moveset database
// ═══════════════════════════════════════════════
'use strict';

// RULES defined in config.js

// ═══════════════════════════════════════════════
// SHADOW-SPECIFIC MOVESETS (differ from normal)
// ═══════════════════════════════════════════════
const SHADOW_MOVES = {
  // Shadow versions often prefer faster charging moves
  Machamp:{G:['Counter','Rock Slide','Cross Chop'],U:['Counter','Rock Slide','Cross Chop'],M:['Counter','Rock Slide','Cross Chop']},
  Gengar:{G:['Lick','Shadow Ball','Shadow Punch'],U:['Shadow Claw','Shadow Ball'],M:['Shadow Claw','Shadow Ball']},
  Dragonite:{M:['Dragon Tail','Dragon Claw','Hurricane']}, // Dragon Claw charges faster for shadow
  Swampert:{G:['Mud Shot','Hydro Cannon','Sludge Wave'],U:['Mud Shot','Hydro Cannon','Sludge Wave']},
  Gardevoir:{G:['Charm','Shadow Ball','Synchronoise'],U:['Charm','Shadow Ball','Synchronoise']},
  Salamence:{M:['Dragon Tail','Outrage','Fire Blast']},
  Mewtwo:{M:['Confusion','Shadow Ball','Psystrike']}, // Shadow Ball better on shadow
  Charizard:{G:['Fire Spin','Blast Burn','Dragon Claw'],M:['Fire Spin','Blast Burn','Dragon Claw']},
  Tyranitar:{M:['Smack Down','Crunch','Stone Edge']},
  Gyarados:{G:['Waterfall','Aqua Tail','Crunch'],U:['Waterfall','Hydro Pump','Crunch']},
  Snorlax:{G:['Lick','Body Slam','Skull Bash']},
  Flygon:{G:['Mud Shot','Dragon Claw','Earth Power'],U:['Mud Shot','Dragon Claw','Earth Power']},
  Electivire:{U:['Thunder Shock','Wild Charge','Ice Punch']},
  Magmortar:{U:['Fire Spin','Thunderbolt','Fire Punch']},
  Nidoqueen:{G:['Poison Jab','Poison Fang','Earth Power']},
  Politoed:{G:['Mud Shot','Weather Ball','Blizzard']},
  Victreebel:{G:['Razor Leaf','Leaf Blade','Acid Spray']},
  Hypno:{G:['Confusion','Shadow Ball','Focus Blast']},
};

// ═══════════════════════════════════════════════
// POKEMON CLASSIFICATIONS
// ═══════════════════════════════════════════════
const LEGENDARY = new Set(['Articuno','Zapdos','Moltres','Mewtwo','Raikou','Entei','Suicune',
  'Lugia','Ho-Oh','Regirock','Regice','Registeel','Latias','Latios','Kyogre','Groudon',
  'Rayquaza','Uxie','Mesprit','Azelf','Dialga','Palkia','Heatran','Regigigas','Giratina',
  'Cresselia','Cobalion','Terrakion','Virizion','Tornadus','Thundurus','Reshiram','Zekrom',
  'Landorus','Kyurem','Xerneas','Yveltal','Zygarde','Tapu Koko','Tapu Lele','Tapu Bulu',
  'Tapu Fini','Solgaleo','Lunala','Necrozma','Zacian','Zamazenta','Eternatus','Urshifu',
  'Regieleki','Regidrago','Glastrier','Spectrier','Calyrex','Enamorus','Koraidon','Miraidon',
  'Gouging Fire','Raging Bolt','Iron Boulder','Iron Crown','Terapagos']);
const MYTHICAL = new Set(['Mew','Celebi','Jirachi','Deoxys','Phione','Manaphy','Darkrai',
  'Shaymin','Arceus','Victini','Keldeo','Meloetta','Genesect','Diancie','Hoopa','Volcanion',
  'Magearna','Marshadow','Zeraora','Meltan','Melmetal','Zarude','Pecharunt']);
const ULTRA_BEAST = new Set(['Nihilego','Buzzwole','Pheromosa','Xurkitree','Celesteela',
  'Kartana','Guzzlord','Poipole','Naganadel','Stakataka','Blacephalon']);

function getPokeType(name) {
  if (LEGENDARY.has(name)) return 'Legendary';
  if (MYTHICAL.has(name)) return 'Mythical';
  if (ULTRA_BEAST.has(name)) return 'Ultra Beast';
  if (name.startsWith('Mega ') || name.endsWith(' Mega')) return 'Mega';
  return null;
}

// ═══════════════════════════════════════════════
// EVOLUTION FAMILY MAP (Pokémon Number based)
// Groups pokemon number -> canonical family root number
// This prevents bad Pokégenie scan data from merging unrelated families
// ═══════════════════════════════════════════════
function buildFamilyMap(rows) {
  // Fast O(n) approach: group by Pokemon Number using a single pass
  // Then merge families using majority-vote on evolution targets
  // Uses a simple name->number lookup built in one pass

  // Step 1: Build name+form->familyKey map
  // Regional variants (Alolan/Galarian/Hisuian/Paldean) get separate family keys
  const REGIONAL_FORMS = new Set(['Alola','Galar','Hisui','Paldea']);
  const nameFormToKey = {}; // "Name|Form" -> familyKey (pokeNum|form or pokeNum)
  const nameToNum = {};
  rows.forEach(r => {
    const form = r['Form']||'';
    const isRegional = REGIONAL_FORMS.has(form);
    // Family key includes form for regional variants
    const famKey = isRegional ? r['Pokemon Number']+'|'+form : r['Pokemon Number'];
    const nameKey = r['Name']+'|'+form;
    if (!nameFormToKey[nameKey]) nameFormToKey[nameKey] = famKey;
    if (!nameToNum[r['Name']]) nameToNum[r['Name']] = r['Pokemon Number'];
  });

  // Step 2: Count how many rows per pokeNum
  const numCount = {};
  rows.forEach(r => { numCount[r['Pokemon Number']] = (numCount[r['Pokemon Number']]||0)+1; });

  // Step 3: Count evo target votes per (baseFamKey -> targetFamKey) pair
  const voteCount = {};
  rows.forEach(r => {
    const form = r['Form']||'';
    const isRegional = REGIONAL_FORMS.has(form);
    const baseFamKey = isRegional ? r['Pokemon Number']+'|'+form : r['Pokemon Number'];
    ['Name (G)','Name (U)','Name (L)'].forEach(col => {
      const evoName = (r[col]||'').trim();
      if (!evoName || evoName === r['Name']) return;
      const evoNum = nameToNum[evoName];
      if (!evoNum) return;
      // Evo inherits same regional form
      const evoFamKey = isRegional ? evoNum+'|'+form : evoNum;
      if (evoFamKey === baseFamKey) return;
      const key = baseFamKey + '>' + evoFamKey;
      voteCount[key] = (voteCount[key]||0) + 1;
    });
  });

  // Step 4: Union-Find on family keys
  const parent = {};
  const getRoot = n => {
    if (parent[n] === undefined) parent[n] = n;
    if (parent[n] === n) return n;
    parent[n] = getRoot(parent[n]);
    return parent[n];
  };
  const unite = (a, b) => {
    const ra = getRoot(a), rb = getRoot(b);
    if (ra !== rb) parent[rb] = ra;
  };

  // Step 5: Merge if majority agree (>40% of base entries point to that evo)
  Object.entries(voteCount).forEach(([key, count]) => {
    const [baseFamKey, evoFamKey] = key.split('>');
    const baseNum = baseFamKey.split('|')[0];
    const total = numCount[baseNum] || 1;
    if (count / total > 0.4) unite(baseFamKey, evoFamKey);
  });

  // Step 6: Manually unite Eevee family
  const eeveeNames = ['Eevee','Vaporeon','Jolteon','Flareon','Espeon',
    'Umbreon','Leafeon','Glaceon','Sylveon'];
  const eeveeKeys = eeveeNames.map(n => nameToNum[n]).filter(Boolean);
  if (eeveeKeys.length > 1) eeveeKeys.slice(1).forEach(n => unite(eeveeKeys[0], n));

  // Step 7: Build result map for each row: index -> familyKey
  // Returns a function to get family key for a given row
  const famKeyCache = {};
  const getFamKey = (name, form) => {
    const isRegional = REGIONAL_FORMS.has(form||'');
    const num = nameToNum[name];
    if (!num) return name;
    const key = isRegional ? num+'|'+(form||'') : num;
    if (!famKeyCache[key]) famKeyCache[key] = getRoot(key);
    return famKeyCache[key];
  };
  return getFamKey;
}

// ── Best moves database ──────────────────────────────
const BEST_MOVES = {
  Feraligatr:{G:['Waterfall','Hydro Cannon','Ice Beam'],U:['Waterfall','Hydro Cannon','Ice Beam'],M:['Waterfall','Hydro Cannon','Crunch']},
  Croconaw:{G:['Waterfall','Aqua Tail'],L:['Waterfall','Aqua Tail']},
  Totodile:{L:['Water Gun','Aqua Tail']},
  Charizard:{G:['Fire Spin','Blast Burn','Dragon Claw'],U:['Fire Spin','Blast Burn','Dragon Claw'],M:['Fire Spin','Blast Burn','Overheat']},
  Blastoise:{G:['Water Gun','Hydro Cannon','Ice Beam'],U:['Water Gun','Hydro Cannon','Ice Beam']},
  Venusaur:{G:['Vine Whip','Frenzy Plant','Sludge Bomb'],U:['Vine Whip','Frenzy Plant','Sludge Bomb']},
  Umbreon:{G:['Snarl','Foul Play','Last Resort'],U:['Snarl','Foul Play','Last Resort']},
  Sylveon:{G:['Charm','Moonblast','Psyshock'],U:['Charm','Moonblast','Psyshock']},
  Espeon:{G:['Confusion','Psychic','Shadow Ball'],U:['Confusion','Psychic','Shadow Ball']},
  Vaporeon:{G:['Water Gun','Aqua Tail','Last Resort'],U:['Water Gun','Hydro Pump']},
  Glaceon:{G:['Ice Shard','Avalanche'],U:['Ice Shard','Avalanche']},
  Leafeon:{G:['Razor Leaf','Leaf Blade']},
  Jolteon:{G:['Thunder Shock','Discharge','Thunderbolt']},
  Flareon:{M:['Fire Spin','Flamethrower','Superpower']},
  Azumarill:{G:['Bubble','Ice Beam','Play Rough'],L:['Bubble','Ice Beam','Play Rough']},
  Machamp:{G:['Counter','Cross Chop','Rock Slide'],U:['Counter','Cross Chop','Rock Slide'],M:['Counter','Cross Chop','Rock Slide']},
  Gengar:{G:['Lick','Shadow Ball','Shadow Punch'],U:['Shadow Claw','Shadow Ball'],M:['Shadow Claw','Shadow Ball']},
  Swampert:{G:['Mud Shot','Hydro Cannon','Earthquake'],U:['Mud Shot','Hydro Cannon','Earthquake']},
  Medicham:{G:['Counter','Ice Punch','Psychic']},
  Registeel:{G:['Lock On','Flash Cannon','Focus Blast'],U:['Lock On','Flash Cannon','Focus Blast']},
  Giratina:{U:['Shadow Claw','Dragon Claw','Shadow Sneak'],G:['Shadow Claw','Dragon Claw','Shadow Sneak']},
  Garchomp:{M:['Mud Shot','Earth Power','Outrage']},
  Mewtwo:{M:['Confusion','Psystrike','Ice Beam']},
  Dragonite:{M:['Dragon Breath','Draco Meteor','Hurricane']},
  Tyranitar:{G:['Smack Down','Stone Edge','Crunch'],U:['Smack Down','Stone Edge','Crunch'],M:['Smack Down','Stone Edge','Crunch']},
  Lucario:{G:['Counter','Power-Up Punch','Shadow Ball'],M:['Counter','Aura Sphere','Shadow Ball']},
  Togekiss:{G:['Charm','Ancient Power','Aerial Ace'],U:['Charm','Ancient Power','Flamethrower']},
  Lickitung:{G:['Lick','Body Slam','Power Whip']},
  Walrein:{G:['Powder Snow','Icicle Spear','Earthquake']},
  Trevenant:{G:['Shadow Claw','Shadow Ball','Seed Bomb']},
  Obstagoon:{G:['Counter','Night Slash','Cross Chop']},
  Skarmory:{G:['Air Slash','Brave Bird','Flash Cannon']},
  Altaria:{G:['Dragon Breath','Sky Attack','Moonblast']},
  Pelipper:{G:['Wing Attack','Weather Ball','Hurricane']},
  Cresselia:{G:['Psycho Cut','Grass Knot','Moonblast'],U:['Psycho Cut','Grass Knot','Moonblast']},
  Gallade:{G:['Confusion','Leaf Blade','Close Combat'],U:['Confusion','Leaf Blade','Close Combat']},
  Stunfisk:{G:['Mud Shot','Discharge','Rock Slide']},
  Sableye:{G:['Shadow Claw','Foul Play','Return']},
  Whiscash:{G:['Mud Shot','Mud Bomb','Blizzard']},
  Dewgong:{G:['Ice Shard','Icy Wind','Water Pulse']},
  Arcanine:{G:['Snarl','Flamethrower','Wild Charge'],U:['Snarl','Fire Blast','Crunch']},
  Nidoqueen:{G:['Poison Jab','Poison Fang','Earth Power']},
  Ferrothorn:{G:['Bullet Seed','Power Whip','Flash Cannon'],U:['Bullet Seed','Power Whip','Flash Cannon']},
  Tropius:{G:['Razor Leaf','Leaf Blade','Aerial Ace']},
  Politoed:{G:['Mud Shot','Weather Ball','Blizzard']},
  Clefable:{G:['Charm','Moonblast','Meteor Mash']},
  Bastiodon:{G:['Smack Down','Stone Edge','Flamethrower'],L:['Smack Down','Stone Edge','Flamethrower']},
  Drifblim:{G:['Hex','Icy Wind','Shadow Ball']},
  Lugia:{U:['Dragon Tail','Aeroblast','Sky Attack'],M:['Dragon Tail','Aeroblast','Sky Attack']},
  Dialga:{M:['Dragon Breath','Iron Head','Thunder']},
  Rayquaza:{M:['Dragon Tail','Breaking Swipe','Aerial Ace']},
  Kyogre:{M:['Waterfall','Surf','Blizzard']},
  Groudon:{M:['Mud Shot','Precipice Blades','Fire Punch']},
  Zacian:{M:['Quick Attack','Close Combat','Play Rough']},
  Chandelure:{U:['Hex','Shadow Ball','Overheat']},
  Excadrill:{U:['Mud Shot','Drill Run','Rock Slide']},
  Conkeldurr:{U:['Counter','Dynamic Punch','Stone Edge']},
  Suicune:{G:['Ice Fang','Ice Beam','Bubble Beam']},
  Raikou:{U:['Thunder Shock','Wild Charge','Shadow Ball']},
  Entei:{U:['Fire Fang','Overheat','Iron Head']},
  Zapdos:{M:['Thunder Shock','Thunderbolt','Drill Peck'],G:['Thunder Shock','Ancient Power','Drill Peck']},
  Moltres:{M:['Fire Spin','Sky Attack','Ancient Power'],U:['Fire Spin','Sky Attack','Ancient Power']},
  Articuno:{G:['Ice Shard','Icy Wind','Ancient Power'],U:['Ice Shard','Icy Wind','Hurricane']},
  Golduck:{G:['Confusion','Hydro Pump','Psychic'],U:['Confusion','Hydro Pump','Psychic']},
  Oranguru:{U:['Confusion','Foul Play','Psychic']},
  Lycanroc:{G:['Rock Throw','Stone Edge','Crunch']},
  Rockruff:{L:['Rock Throw','Crunch']},
  Poliwrath:{G:['Counter','Ice Punch','Dynamic Punch']},
  Muk:{G:['Poison Jab','Gunk Shot','Thunder Punch']},
  Pidgeot:{G:['Gust','Feather Dance','Brave Bird']},
  Glimmora:{G:['Rollout','Power Gem','Sludge Bomb'],U:['Rollout','Power Gem','Sludge Bomb']},
  Cinderace:{G:['Quick Attack','Pyro Ball'],U:['Quick Attack','Pyro Ball'],M:['Quick Attack','Pyro Ball']},
};

// ═══════════════════════════════════════════════
// FORM UTILITIES
// ═══════════════════════════════════════════════
const FORM_DROPDOWNS = {
  Vivillon:   ['Unknown','Archipelago','Continental','Elegant','Fancy','Garden','High Plains','Icy Snow','Jungle','Marine','Meadow','Modern','Monsoon','Ocean','Polar','River','Sandstorm','Savanna','Sun','Tundra','Poke Ball'],
  Scatterbug: ['Unknown','Archipelago','Continental','Elegant','Fancy','Garden','High Plains','Icy Snow','Jungle','Marine','Meadow','Modern','Monsoon','Ocean','Polar','River','Sandstorm','Savanna','Sun','Tundra','Poke Ball'],
  Spewpa:     ['Unknown','Archipelago','Continental','Elegant','Fancy','Garden','High Plains','Icy Snow','Jungle','Marine','Meadow','Modern','Monsoon','Ocean','Polar','River','Sandstorm','Savanna','Sun','Tundra','Poke Ball'],
  'Flabébé':  ['Unknown','Red','Yellow','Orange','Blue','White'],
  Floette:    ['Unknown','Red','Yellow','Orange','Blue','White'],
  Florges:    ['Unknown','Red','Yellow','Orange','Blue','White'],
  Furfrou:    ['Unknown','Natural','Heart','Star','Diamond','Debutante','Matron','Dandy','La Reine','Kabuki','Pharaoh'],
  Shellos:    ['Unknown','West Sea','East Sea'],
  Gastrodon:  ['Unknown','West Sea','East Sea'],
  Burmy:      ['Unknown','Plant Cloak','Sandy Cloak','Trash Cloak'],
};

const FORM_SEARCH = {
  'Polar':'polar','Marine':'marine','Savanna':'savanna','Jungle':'jungle',
  'Meadow':'meadow','Modern':'modern','Tundra':'tundra','Continental':'continental',
  'Garden':'garden','Elegant':'elegant','Icy Snow':'icysnow','Monsoon':'monsoon',
  'High Plains':'highplains','River':'river','Sandstorm':'sandstorm',
  'Sun':'sun','Archipelago':'archipelago','Ocean':'ocean','Fancy':'fancy',
  'Poke Ball':'pokeball','Red':'red flower','Yellow':'yellow flower',
  'Orange':'orange flower','Blue':'blue flower','White':'white flower',
  'West Sea':'west','East Sea':'east',
  'Plant Cloak':'plant','Sandy Cloak':'sandy','Trash Cloak':'trash',
};

const COSTUME_SPECIES = new Set([
  'Pikachu','Raichu','Pichu','Gengar','Haunter','Gastly',
  'Hoothoot','Noctowl','Squirtle','Wartortle','Blastoise',
  'Charmander','Charmeleon','Charizard','Bulbasaur','Ivysaur','Venusaur',
  'Eevee','Snorlax'
]);
