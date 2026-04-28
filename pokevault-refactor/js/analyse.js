// ═══════════════════════════════════════════════
// PokéVault — Analysis Engine
// Family grouping, slot assignment, nickname generation
// Depends on: config.js, data.js
// ═══════════════════════════════════════════════
'use strict';

function buildFamilyMap(rows) {
  // Fast O(n) approach: group by Pokemon Number using a single pass
  // Then merge families using majority-vote on evolution targets
  // Uses a simple name->number lookup built in one pass

  // Step 1: Build name+form->familyKey map
  // Regional variants (Alolan/Galarian/Hisuian/Paldean) get separate family keys
  // FORM_SPLIT_FORMS also get separate keys (Deoxys formes, Castform, Oricorio etc.)
  const REGIONAL_FORMS = new Set(['Alola','Galar','Hisui','Paldea']);
  const FORM_SPLIT_FORMS = new Set(['Alola','Galar','Hisui','Paldea',
    'Male','Female',
    'Origin','Altered','Therian','Incarnate',
    'Attack','Defense','Speed',
    'Primal','Mega','Unbound',
    // 'Normal' excluded — normalised to '' so Growlithe/Arcanine etc. group correctly
    'Rainy','Sunny','Snowy',
    'Baile',"Pa'u",'Pom-Pom','Sensu',
    'Small','Average','Large','Super',
    'Combat','Blaze','Aqua',
    'Plant','Sandy','Trash',
    'Midnight','Dusk',
    'Burn','Chill','Douse','Shock',
    'Roaming','Hero',
    'Aria','Pirouette',
    'Land','Sky',
    '10%','50%','Complete',
  ]);
  // Species that are always standalone families regardless of Pokégenie evo data
  const STANDALONE_SPECIES = new Set(['Kleavor', 'Weezing|Galar']);
  // Species where gender determines appearance — split into separate families
  const GENDER_SPLIT_SPECIES = new Set([
    'Frillish', 'Jellicent',  // blue=male, pink=female
    'Pyroar',                  // male/female look very different
  ]);
  const nameFormToKey = {}; // "Name|Form|Gender" -> familyKey
  const nameToNum = {};
  rows.forEach(r => {
    const rawForm = r['Form']||'';
    const form = rawForm === 'Normal' ? '' : rawForm;
    const gender = r['Gender']||'';
    const isRegional = REGIONAL_FORMS.has(form);
    const needsSplit = FORM_SPLIT_FORMS.has(form);
    const needsGenderSplit = GENDER_SPLIT_SPECIES.has(r['Name']);
    let famKey = (isRegional || needsSplit) ? r['Pokemon Number']+'|'+form : r['Pokemon Number'];
    if (needsGenderSplit && gender) famKey = famKey + '|' + gender;
    const nameKey = r['Name']+'|'+form+'|'+(needsGenderSplit ? gender : '');
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
    const needsSplit = FORM_SPLIT_FORMS.has(form);
    const baseFamKey = (isRegional || needsSplit) ? r['Pokemon Number']+'|'+form : r['Pokemon Number'];
    ['Name (G)','Name (U)','Name (L)'].forEach(col => {
      const evoName = (r[col]||'').trim();
      if (!evoName || evoName === r['Name']) return;
      const evoNum = nameToNum[evoName];
      if (!evoNum) return;
      if (STANDALONE_SPECIES.has(evoName)) return; // e.g. Kleavor — standalone, not part of Scyther family
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
  const getFamKey = (name, form, gender='') => {
    const normForm = (form||'') === 'Normal' ? '' : (form||'');
    const isRegional = REGIONAL_FORMS.has(normForm);
    const needsSplit = FORM_SPLIT_FORMS.has(normForm);
    const needsGenderSplit = GENDER_SPLIT_SPECIES.has(name);
    const num = nameToNum[name];
    if (!num) return name;
    const speciesKey = name + (normForm ? '|'+normForm : '');
    if (STANDALONE_SPECIES.has(name) || STANDALONE_SPECIES.has(speciesKey)) return speciesKey;
    let key = (isRegional || needsSplit) ? num+'|'+normForm : num;
    if (needsGenderSplit && gender) key = key + '|' + gender;
    if (!famKeyCache[key]) famKeyCache[key] = getRoot(key);
    return famKeyCache[key];
  };
  return getFamKey;
}


// ═══════════════════════════════════════════════
// BEST MOVESETS
// ═══════════════════════════════════════════════
// (BEST_MOVES defined in data.js)

// ═══════════════════════════════════════════════
// NICKNAME BUILDER
// ═══════════════════════════════════════════════
// (defined in config.js)
// (defined in config.js)
// (defined in config.js)

function buildNickname(p, slot) {
  const iv = Math.round(p.ivAvg||0);
  const atkIV=p.atkIV||0, defIV=p.defIV||0, staIV=p.staIV||0;
  const isNundo = atkIV===0&&defIV===0&&staIV===0;

  // Target name for this slot
  let base = p.name;
  if (slot==='G' && p.evolvedNameG) base=p.evolvedNameG;
  else if (slot==='U' && p.evolvedNameU) base=p.evolvedNameU;
  else if (slot==='L' && p.evolvedNameL) base=p.evolvedNameL;
  else if (slot==='M') base=p.evolvedNameU||p.evolvedNameG||p.name;

  if (isNundo) return fitName(base, NUNDO, '', 12);

  // Build suffix first so we know how many chars it needs
  let suf='';

  // Dust dollars — only shown above affordable threshold, using per-league tiers
  const lgThresh = DUST_THRESHOLDS[slot] || null;
  if (lgThresh && lgThresh.tiers.length) {
    const dustForSlot = slot==='L'?p.dustL:slot==='G'?p.dustG:slot==='U'?p.dustU:0;
    if (dustForSlot && dustForSlot > lgThresh.affordable) {
      const [t1,t2,t3] = lgThresh.tiers;
      if (t3 && dustForSlot >= t3) suf += '$$$';
      else if (t2 && dustForSlot >= t2) suf += '$$';
      else if (t1 && dustForSlot >= t1) suf += '$';
    }
  }
  // Shiny on non-shiny slots
  if (p.isShiny&&slot!=='shiny'&&slot!=='shiny_lower') suf+='S';
  // Shadow purification suffix — only if shadow doesn't already hold a league slot
  if (p.isShadow && p.purifyLeague) {
    const alreadyHasSlot = p.slots.some(s => ['L','G','U','M'].includes(s));
    if (!alreadyHasSlot) suf += p.purifyHundo ? 'p✪' : 'p';
  }

  // Move flags
  if (p.hasAllBestMoves) suf+='☆';
  else if (p.hasTwoMoves&&p.hasBestMoves) suf+='b';

  let mid='', nickSuf=suf;

  if (slot==='trade') {
    // name + iv + 't' + suf — use lowercase, fit name
    mid=iv+'t';
    return fitName(p.name, mid, nickSuf, 12);
  } else if (slot==='review') {
    // Holding name: Name + best league IV% + lowercase league letter + next league IV% etc
    // e.g. Pin95l93g for 95% Little, 93% Great
    // Exclude leagues where dust is prohibitive (>300k) for non-final non-legendary pokemon
    const DET = RULES.dustExcludeThreshold || 300000;
    const isFinalEvoForNick = !!(p.evolvedNameG===p.name||p.evolvedNameU===p.name||
      (!p.evolvedNameG&&!p.evolvedNameU)); // no evolutions = final
    const isLegForNick = !!(p.pokeType==='Legendary'||p.pokeType==='Mythical'||p.pokeType==='Ultra Beast');
    const dustOkForLeague = (dustVal) => !dustVal || dustVal===0 || dustVal<=DET || isFinalEvoForNick || isLegForNick;

    const qualLeagues = [
      {l:'l', pct:Math.round(p.rankPctL||0), qualifies:(p.rankPctL||0)>=RULES.keepThreshold && dustOkForLeague(p.dustL)},
      {l:'g', pct:Math.round(p.rankPctG||0), qualifies:(p.rankPctG||0)>=RULES.keepThreshold && dustOkForLeague(p.dustG)},
      {l:'u', pct:Math.round(p.rankPctU||0), qualifies:(p.rankPctU||0)>=RULES.keepThreshold && dustOkForLeague(p.dustU)},
      {l:'m', pct:Math.round(p.rankPctM||0), qualifies:(p.rankPctM||0)>=RULES.keepThreshold},
    ].filter(x=>x.qualifies).sort((a,b)=>b.pct-a.pct);
    if (qualLeagues.length===0) {
      // Fallback: show best available league rank + master (e.g. Snom78g34m)
      const allLeagues = [
        {l:'g', pct:Math.round(p.rankPctG||0)},
        {l:'u', pct:Math.round(p.rankPctU||0)},
        {l:'l', pct:Math.round(p.rankPctL||0)},
        {l:'m', pct:Math.round(p.rankPctM||0)},
      ].filter(x=>x.pct>0).sort((a,b)=>b.pct-a.pct);
      if (allLeagues.length > 0) {
        const bestL = allLeagues[0];
        const master = allLeagues.find(x=>x.l==='m');
        mid = bestL.pct+bestL.l;
        if (master && master.l !== bestL.l) mid += master.pct+'m';
      } else {
        mid = iv;
      }
    } else {
      mid = qualLeagues.map(x=>x.pct+x.l).join('');
    }
    return fitName(p.name, mid, nickSuf, 12);
  } else if (slot==='M') {
    const pv=Math.round(p.rankPctM||p.ivAvg||0);
    mid=LC.R+(pv===100?PERFECT:String(pv));
    return fitName(base, mid, nickSuf, 12);
  } else if (['L','G','U'].includes(slot)) {
    const pv=Math.round(slot==='L'?p.rankPctL:slot==='G'?p.rankPctG:p.rankPctU);
    mid=LC[slot]+(pv===100?PERFECT:String(pv));
    return fitName(base, mid, nickSuf, 12);
  } else if (slot==='shiny'||slot==='shiny_lower') {
    const best=['G','U','L','M'].find(l=>(p['rankPct'+l]||0)>=RULES.keepThreshold);
    if (best) {
      const pv=Math.round(p['rankPct'+best]||0);
      mid=LC[best]+(pv===100?PERFECT:String(pv));
    } else {
      mid=String(iv);
    }
    nickSuf=SHINY_SFX+suf;
    return fitName(p.name, mid, nickSuf, 12);
  } else if (slot==='lucky') {
    // Lucky with no league slot: NameⓇIV (Master/level-up candidate)
    const pv=Math.round(p.rankPctM||p.ivAvg||0);
    mid=LC.R+String(pv);
    return fitName(p.name, mid, nickSuf, 12);
  } else {
    // Fallback: show best available league rank + master rank — never bare IV%
    const allL = [
      {l:'g', pct:Math.round(p.rankPctG||0)},
      {l:'u', pct:Math.round(p.rankPctU||0)},
      {l:'l', pct:Math.round(p.rankPctL||0)},
      {l:'m', pct:Math.round(p.rankPctM||0)},
    ].filter(x=>x.pct>0).sort((a,b)=>b.pct-a.pct);
    if (allL.length > 0) {
      const bestL = allL[0];
      const master = allL.find(x=>x.l==='m');
      mid = bestL.pct+bestL.l+(master&&master.l!==bestL.l?master.pct+'m':'');
    } else {
      mid = String(iv);
    }
    return fitName(p.name, mid, '', 12);
  }
}

// Fit as many chars of name as possible: name + mid + suf <= maxLen
// mid = the league symbol + number (e.g. Ⓖ96), suf = trailing flags (S, b, ☆, $)
function fitName(name, mid, suf, maxLen) {
  const available = maxLen - mid.length - suf.length;
  const truncated = available > 0 ? name.substring(0, available) : '';
  return (truncated + mid + suf).substring(0, maxLen);
}

// ═══════════════════════════════════════════════
// MOVE EVALUATOR
// ═══════════════════════════════════════════════
function evalMoves(name, qm, cm1, cm2, isShadow, isPurified) {
  // Use shadow moves if available and pokemon is shadow (and not being purified)
  const moveDb = (isShadow && !isPurified && SHADOW_MOVES[name]) ? SHADOW_MOVES : BEST_MOVES;
  // Always flag Frustration as needing TM
  const notes = [];
  if (qm === 'Frustration') notes.push('TM Fast → remove Frustration!');
  const best=moveDb[name];
  if (!best) return {known:false,notes:[],hasAllBestMoves:false,hasBestMoves:false};
  const lg=['L','G','U','M'].find(l=>best[l]);
  if (!lg) return {known:false,notes:[],hasAllBestMoves:false,hasBestMoves:false};
  const [bf,bc1,bc2]=best[lg];
  if (qm&&bf&&qm!=='Frustration'&&qm!==bf) notes.push(`TM Fast → ${bf}`);
  if (bc1&&cm1&&cm1!==bc1&&cm1!==bc2) notes.push(`TM Charged → ${bc1}`);
  if (bc2&&!cm2) notes.push(`Unlock 2nd move (${bc2})`);
  else if (bc2&&cm2&&cm2!==bc2&&cm2!==bc1) notes.push(`TM 2nd → ${bc2}`);
  const hasBestMoves=qm===bf&&cm1&&(cm1===bc1||cm1===bc2);
  const hasAllBestMoves=hasBestMoves&&(!bc2||(cm2&&(cm2===bc2||cm2===bc1)))&&notes.length===0&&!!qm;
  return {known:true,notes,hasAllBestMoves,hasBestMoves,bestFast:bf,bestC1:bc1,bestC2:bc2};
}

// ═══════════════════════════════════════════════
// CATCH DATE PARSER (D/M/YYYY Australian format)
// ═══════════════════════════════════════════════
function parseCatchDate(s) {
  if (!s||!s.trim()) return null;
  const parts=s.trim().split('/');
  if (parts.length!==3) return null;
  const [d,m,y]=parts.map(Number);
  if (!d||!m||!y) return null;
  return new Date(y,m-1,d).getTime();
}

// ═══════════════════════════════════════════════
// STABLE POKEMON IDENTITY KEY
// Survives evolution, power-ups, re-exports and purges
// Format: familyKey|form|gender|atkIV|defIV|staIV|catchDate
// ═══════════════════════════════════════════════
function makeStableKey(p) {
  // Key: PokemonNumber|Form|Gender|AtkIV|DefIV|StaIV|CatchDate
  // CP excluded: it changes when the pokemon is powered up, which would lose overrides
  const date = p.catchDate || ('_idx' + (p.idx||''));
  return [
    p.pokeNum || '',
    p.form || '',
    p.gender || '',
    p.atkIV !== undefined ? p.atkIV : '',
    p.defIV !== undefined ? p.defIV : '',
    p.staIV !== undefined ? p.staIV : '',
    date
  ].join('|');
}

function deduplicateKeys(pokemon) {
  // For truly identical pokemon (same species/IVs/date/CP), append _2, _3 suffix
  const seen = {};
  pokemon.forEach(p => {
    const base = p.stableKey;
    seen[base] = (seen[base]||0) + 1;
    if (seen[base] > 1) p.stableKey = base + '_' + seen[base];
  });
}

// ═══════════════════════════════════════════════
// STARDUST TO MAX
// (DUST_PP defined in config.js)
function dustToMax(cur,tgt){let t=0;for(let l=Math.floor(cur||1);l<tgt;l++){const c=DUST_PP[l]||10000;t+=(l===Math.floor(cur)&&(cur%1)!==0)?c:c*2;}return t;}
function formatDust(n){return n>=1000?(n/1000).toFixed(0)+'k':String(n);}

// PURIFICATION SIMULATION
// ═══════════════════════════════════════════════
function simulatePurify(p, allRows) {
  if (!p.isShadow) return;
  // +2 to each IV capped at 15
  const pAtk = Math.min(15, (p.atkIV||0)+2);
  const pDef = Math.min(15, (p.defIV||0)+2);
  const pSta = Math.min(15, (p.staIV||0)+2);
  p.purifyHundo = pAtk===15 && pDef===15 && pSta===15;

  // Re-evaluate league ranks with purified IVs
  // We can't recalculate PvP rank from scratch without the full ranking table
  // But we can use a heuristic: if original rank% is close, purified will be higher
  // Better: check if any league rank% when adjusted for IV improvement would cross 90%
  // Since we don't have the full rank table, use IV average improvement as proxy
  // Purified IV avg
  const purifyIvAvg = ((pAtk+pDef+pSta)/45)*100;

  // Check each league - if purified IVs would likely rank well
  // Use the existing rank data but scale it: if original is within 5% of threshold
  // and purified IVs are significantly better, flag it
  // More accurately: check if min(ivs) >= 13 for hundo, or use rank% + improvement
  const improvement = purifyIvAvg - (p.ivAvg||0);

  // For each league, estimate purified rank
  const leagueChecks = [
    {lg:'L', rank:p.rankPctL||0, evo:p.evolvedNameL||p.name},
    {lg:'G', rank:p.rankPctG||0, evo:p.evolvedNameG||p.name},
    {lg:'U', rank:p.rankPctU||0, evo:p.evolvedNameU||p.name},
    {lg:'M', rank:purifyIvAvg, evo:p.evolvedNameU||p.evolvedNameG||p.name},
  ];

  // Find best league where purified version would qualify
  // Heuristic: if current rank + (improvement * 0.5) >= 90, likely qualifies
  let bestLeague='', bestPct=0;
  leagueChecks.forEach(({lg, rank, evo}) => {
    if (rank <= 0) return;
    if (rank >= RULES.keepThreshold) return; // already qualifies as shadow — no need to purify
    const estimatedPurified = Math.min(100, rank + improvement * 0.4);
    if (estimatedPurified >= RULES.keepThreshold && estimatedPurified > bestPct) {
      const leagueCap = LEAGUE_CAPS[lg] ?? 99999;
      if (leagueCap < 99999) {
        const estimatedPurifiedCP = Math.round((p.cp||0) * 1.07);
        if (estimatedPurifiedCP > leagueCap) return; // purified CP would bust the cap
      }
      bestPct = estimatedPurified;
      bestLeague = lg;
      p.purifyEvo = evo;
    }
  });
  p.purifyLeague = bestLeague;
  p.purifyRankPct = Math.round(bestPct);
}

// ═══════════════════════════════════════════════
// MAIN ANALYSIS
// ═══════════════════════════════════════════════
function analyse(rows) {
  // Build family map (robust against bad scans, separates regional variants)
  const getFamKey = buildFamilyMap(rows);

  // Parse all rows
  const parsed = rows.map(r => {
    const sp=Number(r['Shadow/Purified'])||0;
    const iv=Number(r['IV Avg'])||0;
    const atkIV=Number(r['Atk IV'])||0, defIV=Number(r['Def IV'])||0, staIV=Number(r['Sta IV'])||0;
    const rG=parseFloat(r['Rank % (G)'])||0, rU=parseFloat(r['Rank % (U)'])||0, rL=parseFloat(r['Rank % (L)'])||0;
    const dustG=Number(r['Dust Cost (G)'])||0, dustU=Number(r['Dust Cost (U)'])||0, dustL=Number(r['Dust Cost (L)'])||0;
    const dusts=[dustG,dustU,dustL].filter(d=>d>0);
    const dustMin=dusts.length?Math.min(...dusts):0;
    const mv=evalMoves(r['Name'],r['Quick Move'],r['Charge Move'],r['Charge Move 2'],(Number(r['Shadow/Purified'])||0)===1,(Number(r['Shadow/Purified'])||0)===2);

    const baseNum=r['Pokemon Number'];
    const validateEvo = name => {
      if (!name||name===r['Name']) return '';
      const validEvos = VALID_EVOLUTIONS[r['Name']];
      if (!validEvos) return '';
      return validEvos.includes(name) ? name : '';
    };

    return {
      idx:r['Index'], name:r['Name'], form:r['Form']||'',
      pokeNum:baseNum, familyKey:getFamKey(r['Name'], r['Form']||'', r['Gender']||''),
      gender:r['Gender']||'',
      cp:Number(r['CP'])||0, hp:Number(r['HP'])||0,
      atkIV,defIV,staIV, ivAvg:iv,
      level:Number(r['Level Min'])||0,
      quickMove:r['Quick Move']||'', chargeMove1:r['Charge Move']||'', chargeMove2:r['Charge Move 2']||'',
      isLucky:r['Lucky']==='1', isShadow:sp===1, isPurified:sp===2,
      isFavorite:r['Favorite']==='1', isShiny:false,
      isNundo:atkIV===0&&defIV===0&&staIV===0,
      rankPctG:rG, rankPctU:rU, rankPctL:rL, rankPctM:iv,
      rankNumG:Number(r['Rank # (G)'])||null, rankNumU:Number(r['Rank # (U)'])||null, rankNumL:Number(r['Rank # (L)'])||null,
      evolvedNameG:validateEvo(r['Name (G)']), evolvedNameU:validateEvo(r['Name (U)']), evolvedNameL:validateEvo(r['Name (L)']),
      dustG,dustU,dustL,dustMin,dustCostBest:dustMin,
      catchDate:r['Catch Date']||'', catchDateMs:parseCatchDate(r['Catch Date']),
      pvpTag:r['Marked for PvP use']||'',
      moveKnown:mv.known, hasAllBestMoves:mv.hasAllBestMoves, hasBestMoves:mv.hasBestMoves,
      hasTwoMoves:!!r['Charge Move 2'], moveNotes:mv.notes,
      bestFast:mv.bestFast, bestC1:mv.bestC1, bestC2:mv.bestC2,
      pokeType:getPokeType(r['Name']),
      slots:[], decision:'review', reason:'', nickname:'', suggestStar:false,
      suggestStarExpensive:false, suggestStarCheaper:false,
      isExpensiveWinner:false, isAffordableWinner:false, isCheaperAlternative:false,
      targetEvo:'', hidden:false, evoIndicator:'', canEvolve:false, neverEvolved:false, isHundo:false, dustToL40:0, belowCapNote:'',
      isDynamax:false, isGigantamax:false, isCostumed:false, vivillonPattern:'', specialForm:'', manualDecision:'', notes:'', stableKey:'',
      overBudget100:false, cheaperAvailable:false,
      purifyHundo:false, purifyLeague:'', purifyRankPct:0,
    };
  });

  // Group by family key
  const byFamily={};
  parsed.forEach(p=>{
    if(!byFamily[p.familyKey]) byFamily[p.familyKey]=[];
    byFamily[p.familyKey].push(p);
  });

  // Set stable keys now that familyKey is assigned
  parsed.forEach(p => { p.stableKey = makeStableKey(p); });
  deduplicateKeys(parsed);

  // Simulate purification for shadows
  parsed.forEach(p => {
    simulatePurify(p, rows);
    // If shadow qualifies when purified, assign purify league as a slot
    // so it gets e.g. GurdurrⒼ92p instead of Ⓡ73p
    if (p.isShadow && p.purifyLeague && p.purifyRankPct >= RULES.keepThreshold) {
      if (!p.slots.includes(p.purifyLeague)) {
        p.slots.push(p.purifyLeague);
        p.isPurifySlot = true;
      }
    }
  });

  // Determine slots — ONE best per evolution stage per league
  Object.values(byFamily).forEach(members=>{
    const isLegendary=members.some(p=>LEGENDARY.has(p.name)||MYTHICAL.has(p.name)||ULTRA_BEAST.has(p.name));

    // Evaluate leagues in priority order M>U>G>L so higher leagues get first pick
    // Track which pokemon have been assigned to avoid double-assigning
    const claimed = new Set();
    ['M','U','G','L'].forEach(lg=>{
      const rankField=`rankPct${lg}`;
      const byEvoStage={};
      members.forEach(p=>{
        const stageName = lg==='L'?(p.evolvedNameL||p.name)
          :lg==='G'?(p.evolvedNameG||p.name)
          :lg==='U'?(p.evolvedNameU||p.name)
          :(p.evolvedNameU||p.evolvedNameG||p.name);
        // Split by gender for dimorphic species
        const isDimorphic = GENDER_DIMORPHIC.has(stageName)||GENDER_DIMORPHIC.has(p.name);
        const groupKey = (isDimorphic && p.gender) ? stageName+'|'+p.gender : stageName;
        if (!byEvoStage[groupKey]) byEvoStage[groupKey]=[];
        byEvoStage[groupKey].push(p);
      });

      Object.entries(byEvoStage).forEach(([stageName,group])=>{
        // Master league: only final evolution
        if (lg==='M') {
          const hasHigherEvo = members.some(m =>
            m.name === stageName && (
              (m.evolvedNameG && m.evolvedNameG !== stageName) ||
              (m.evolvedNameU && m.evolvedNameU !== stageName)
            )
          );
          if (hasHigherEvo) return;
        }

        // CP commitment check — exclude from league if already powered past cap
        const leagueCap = LEAGUE_CAPS[lg] ?? 99999;
        // Dust exclusion: if dust cost for this league exceeds threshold, skip entirely
        // This prevents lower evolutions with prohibitive Ultra/Master dust from
        // blocking their selection in cheaper leagues (Little/Great)
        const DUST_EXCLUDE_THRESHOLD = 300000; // over 300k = not worth considering
        const leagueDust = p => lg==='L'?p.dustL:lg==='G'?p.dustG:lg==='U'?p.dustU:0;

        const eligible = (lg==='M' ? group : group.filter(p => (p.cp||0) <= leagueCap * 1.05))
          .filter(p => {
            // Dust exclusion: non-final, non-legendary over 300k excluded
            const d = leagueDust(p);
            const pIsFinalEvo = !members.some(m =>
              m.name === p.name && (
                (m.evolvedNameG && m.evolvedNameG !== p.name) ||
                (m.evolvedNameU && m.evolvedNameU !== p.name)
              )
            );
            if (d > DUST_EXCLUDE_THRESHOLD && !pIsFinalEvo && !isLegendary) return false;

            // Committed to a lower league: already powered to cap with 0 dust and favourited
            // Exclude from higher leagues so lower league slot is respected
            if (lg === 'U' && p.dustL === 0 && (p.cp||0) <= 500 * 1.05 && p.isFavorite) return false;
            if (lg === 'G' && p.dustL === 0 && (p.cp||0) <= 500 * 1.05 && p.isFavorite) return false;
            if (lg === 'U' && p.dustG === 0 && (p.cp||0) <= 1500 * 1.05 && (p.cp||0) > 500 * 1.05 && p.isFavorite) return false;

            // Set isCommitted flag for display (pokemon at their cap with 0 dust)
            const leagueDustVal = lg==='L'?p.dustL:lg==='G'?p.dustG:lg==='U'?p.dustU:null;
            if (lg !== 'M' && (p.cp||0) >= leagueCap * 0.97 && leagueDustVal === 0) p.isCommitted = true;

            if (!claimed.has(p.idx)) return true;
            // Allow claimed pokemon if they're in a DIFFERENT evo stage group
            const thisStage = lg==='L'?(p.evolvedNameL||p.name)
              :lg==='G'?(p.evolvedNameG||p.name)
              :lg==='U'?(p.evolvedNameU||p.name)
              :(p.evolvedNameU||p.evolvedNameG||p.name);
            const claimedForSameStage = p.slots.some(s => {
              if (!RULES.leagues.includes(s)) return false;
              const claimedStage = s==='L'?(p.evolvedNameL||p.name)
                :s==='G'?(p.evolvedNameG||p.name)
                :s==='U'?(p.evolvedNameU||p.name)
                :(p.evolvedNameU||p.evolvedNameG||p.name);
              return claimedStage === thisStage;
            });
            return !claimedForSameStage;
          });
        // Allow 5% over cap to account for rounding/display differences
        if (!eligible.length) return;

        // Effective dust = half for Lucky; treat 0 explicitly as free (already powered up)
        const effectiveDust = p => {
          const leagueDust = lg==='L'?p.dustL:lg==='G'?p.dustG:lg==='U'?p.dustU:null;
          const d = (leagueDust !== null && leagueDust !== undefined) ? leagueDust : (p.dustCostBest || 999999);
          return p.isLucky ? Math.round(d/2) : d;
        };

        // Sort by tier then effective dust:
        // Tier 1: 100% rank (exact 100.00)
        // Tier 2: 99%+ 
        // Tier 3: 90%+
        // Within each tier: cheapest effective dust first
        const rankTier = p => {
          const r = p[rankField]||0;
          if (r >= 99.99) return 0;  // 100%
          if (r >= 99.0)  return 1;  // 99%+
          if (r >= 90.0)  return 2;  // 90%+
          return 3;
        };

        eligible.sort((a, b) => {
          const ra = a[rankField]||0, rb = b[rankField]||0;
          const roundedA = Math.round(ra), roundedB = Math.round(rb);
          if (roundedA !== roundedB) return roundedB - roundedA;
          // Prefer already-evolved (p.name === stageName) over pre-evos at same rounded rank
          const aIsEvolved = (a.name === stageName) ? 0 : 1;
          const bIsEvolved = (b.name === stageName) ? 0 : 1;
          if (aIsEvolved !== bIsEvolved) return aIsEvolved - bIsEvolved;
          return effectiveDust(a) - effectiveDust(b);
        });

        const best = eligible[0];
        const bestRank = best[rankField]||0;

        // Before assigning: check if best rounds to 100% in a lower league
        // with a different evo target — if so, protect it for that lower league
        // and try the next candidate for this league
        const lowerLeagues = lg==='G' ? ['L'] :
                             lg==='U' ? ['G','L'] :
                             lg==='M' ? ['U','G','L'] : [];
        const shouldProtect = lowerLeagues.some(ll => {
          if (!RULES.leagues.includes(ll)) return false;
          const lowerEvo = ll==='L'?(best.evolvedNameL||best.name)
            :ll==='G'?(best.evolvedNameG||best.name)
            :(best.evolvedNameU||best.name);
          const thisEvo = stageName;
          if (lowerEvo === thisEvo) return false; // same evo, no conflict
          const lowerRank = Math.round(best['rankPct'+ll]||0);
          const thisRank = Math.round(bestRank);
          return lowerRank >= 100 && thisRank < 100; // protect if lower is 100, this isn't
        });

        let actualBest = best;
        if (shouldProtect && eligible.length > 1) {
          // Try next best that doesn't have the same protection issue
          const alternative = eligible.slice(1).find(p => {
            const altShouldProtect = lowerLeagues.some(ll => {
              const lowerEvo = ll==='L'?(p.evolvedNameL||p.name)
                :ll==='G'?(p.evolvedNameG||p.name):(p.evolvedNameU||p.name);
              if (lowerEvo === stageName) return false;
              const lr = Math.round(p['rankPct'+ll]||0);
              const tr = Math.round(p[rankField]||0);
              return lr >= 100 && tr < 100;
            });
            return !altShouldProtect;
          });
          if (alternative) actualBest = alternative;
        }
        const best2 = actualBest;
        const bestRank2 = best2[rankField]||0;

        // Always promote the best candidate — threshold determines if it's confirmed or tentative
        const isConfirmed = bestRank2 >= RULES.keepThreshold;
        if (bestRank2 >= 70 || isLegendary) { // Only skip truly weak candidates
          if (!best2.slots.includes(lg)) best2.slots.push(lg);
          best2.targetEvo = stageName !== best2.name ? stageName : '';
          best2.slotConfirmed = isConfirmed; // true = circled letter, false = review name
          if (!isConfirmed) best.slots.push(lg+'_tentative');
          const eDustCheck = effectiveDust(best);
          // Use league-specific evo key so a stage final for Little isn't blocked by a Great evo
          const leagueEvoKey = lg==='L'?'evolvedNameL':lg==='G'?'evolvedNameG':'evolvedNameU';
          const isFinalEvoStage = !members.some(m =>
            m.name === stageName && m[leagueEvoKey] && m[leagueEvoKey] !== stageName
          );
          const lgAffordable = (DUST_THRESHOLDS[lg] || DUST_THRESHOLDS.G).affordable;

          // Claim only affordable final-evo winners (prevents them blocking lower leagues)
          if (isConfirmed && eDustCheck <= lgAffordable && (isFinalEvoStage || lg==='M')) {
            claimed.add(best.idx);
          }

          // Dual recommendation: expensive winner + affordable backup
          if (eDustCheck > lgAffordable && isConfirmed) {
            best2.isExpensiveWinner = true;
            best2.expensiveForLeague = lg;
            const affordableWinner = eligible.slice(1).find(p =>
              effectiveDust(p) <= lgAffordable && (p[rankField]||0) >= RULES.keepThreshold
            );
            if (affordableWinner) {
              if (!affordableWinner.slots.includes(lg+'_affordable')) affordableWinner.slots.push(lg+'_affordable');
              affordableWinner.isAffordableWinner = true;
              affordableWinner.affordableForLeague = lg;
              if (isFinalEvoStage) claimed.add(affordableWinner.idx);
            }
          } else if (eDustCheck <= lgAffordable && isFinalEvoStage && isConfirmed) {
            best2.isAffordableWinner = true;
            best2.affordableForLeague = lg;
          }

          // Cyan star: winner is cheaper than an existing starred pokemon at the same rounded rank.
          // Check full group (not just eligible) — starred one may have been claimed/excluded.
          // Dust comparison: only fire when the starred alt costs MORE than the winner.
          // Equal/zero dust means both picks are equivalent cost — no need to warn before acting.
          const bestRounded2 = Math.round(bestRank2);
          if (isConfirmed) {
            const hasStarredAtSameRank = group.some(p =>
              p !== best2 &&
              p.isFavorite &&
              Math.round(p[rankField]||0) === bestRounded2 &&
              effectiveDust(p) > eDustCheck
            );
            if (hasStarredAtSameRank) {
              if (!best2.cheaperAlternativeLeagues) best2.cheaperAlternativeLeagues = [];
              best2.cheaperAlternativeLeagues.push(lg);
            }
          }

          // Flag if a cheaper option exists at same tier
          const bestTier = rankTier(best);
          const cheaperExists = eligible.slice(1).some(p =>
            rankTier(p) === bestTier && effectiveDust(p) < effectiveDust(best)
          );
          if (cheaperExists) best.cheaperAvailable = (best.cheaperAvailable||[]);
          // (cheaperAvailable flag is set on winner to show it could be replaced)

          // Check if 200k+ threshold — flag as tentative if over budget
          const eDust = effectiveDust(best);
          if (eDust > 200000 && bestTier === 0) {
            best.overBudget100 = true;
          }

          // Second runner-up: if another candidate also qualifies at 90%+
          // assign them to remaining open leagues (handled by league loop)
        } else if (isLegendary && !eligible.some(m=>(m[rankField]||0)>=RULES.keepThreshold)) {
          if (!best2.slots.includes(lg)) best2.slots.push(lg);
          best2.targetEvo = stageName !== best2.name ? stageName : '';
        }
      });
    });

    // Shiny, shadow, purified, lucky, nundo slots
    const shinies=members.filter(p=>p.isShiny).sort((a,b)=>b.ivAvg-a.ivAvg);
    if(shinies.length){shinies[0].slots.push('shiny');shinies.slice(1).forEach(p=>p.slots.push('shiny_lower'));}
    const shadows=members.filter(p=>p.isShadow).sort((a,b)=>b.ivAvg-a.ivAvg);
    if(shadows.length) shadows[0].slots.push('shadow');
    const purified=members.filter(p=>p.isPurified).sort((a,b)=>b.ivAvg-a.ivAvg);
    if(purified.length) purified[0].slots.push('purified');
    members.filter(p=>p.isLucky).forEach(p=>p.slots.push('lucky'));
    members.filter(p=>p.isNundo).forEach(p=>p.slots.push('nundo'));

    // Set decisions and nicknames
    members.forEach(p=>{
      // Fix dustCostBest to use the dust for the assigned league slot
      const leagueSlot = p.slots.find(s=>['L','G','U','M'].includes(s));
      if (leagueSlot === 'L' && p.dustL > 0) p.dustCostBest = p.dustL;
      else if (leagueSlot === 'G' && p.dustG > 0) p.dustCostBest = p.dustG;
      else if (leagueSlot === 'U' && p.dustU > 0) p.dustCostBest = p.dustU;
      else if (leagueSlot === 'M') p.dustCostBest = 0;
      else p.dustCostBest = p.dustMin || 0;

      const hasLeagueSlot=p.slots.some(s=>RULES.leagues.includes(s)||s.endsWith('_affordable'));
      const hasAffordableBackup=p.slots.some(s=>s.endsWith('_affordable'));
      const hasProtectedSlot=isLegendary&&p.slots.length>0;
      const qualifiesAny=RULES.leagues.some(l=>(p[`rankPct${l}`]||0)>=RULES.keepThreshold);

      // Collection species: slot top N by IV%
      if (COLLECTION_SETS && COLLECTION_SETS[p.name]) {
        const cset = COLLECTION_SETS[p.name];
        const sorted = [...members].sort((a,b) => (b.ivAvg||0)-(a.ivAvg||0));
        if (sorted.indexOf(p) < cset.target && !p.slots.includes('collection')) {
          p.slots.push('collection');
        }
      }

      if (p.slots.includes('nundo')) {
        p.decision='keep'; p.reason='Nundo — 0/0/0';
        p.nickname=buildNickname(p,'nundo');
      } else if (hasLeagueSlot) {
        const lgSlots=p.slots.filter(s=>RULES.leagues.includes(s)||s.endsWith('_affordable')).map(s=>s.replace('_affordable',''));
        const lgNames=lgSlots.map(s=>RULES.leagueNames[s]);
        const nickSlot=['M','U','G','L'].find(s=>lgSlots.includes(s))||lgSlots[0];
        if(nickSlot==='M') p.targetEvo=p.evolvedNameU||p.evolvedNameG||'';
        else if(nickSlot==='G') p.targetEvo=p.evolvedNameG||'';
        else if(nickSlot==='U') p.targetEvo=p.evolvedNameU||'';
        else if(nickSlot==='L') p.targetEvo=p.evolvedNameL||'';
        if (p.slotConfirmed) {
          // Confirmed best — circled letter nickname
          p.decision='keep';
          p.reason='Best '+lgNames.join(' + ');
          p.nickname=buildNickname(p,nickSlot);
        } else {
          // Auto-promoted but below 90% — keep but use review name so you know it's tentative
          p.decision='review';
          p.reason='Best available for '+lgNames.join(' + ')+' (below 90% threshold)';
          p.nickname=buildNickname(p,'review');
        }
      } else if (p.slots.includes('lucky')) {
        p.decision='keep'; p.reason='Lucky — always keep';
        // Lucky with a qualifying league gets circled-letter nick; fallback to Ⓡ for Master
        const luckyLeague = ['U','G','L','M'].find(l => (p['rankPct'+l]||0) >= RULES.keepThreshold);
        p.nickname=buildNickname(p, luckyLeague || 'M');
      } else if (p.slots.includes('shiny')||p.slots.includes('shiny_lower')) {
        p.decision='keep'; p.reason='Shiny — always favourite';
        p.nickname=buildNickname(p,'shiny');
      } else if (p.slots.includes('shadow')) {
        p.decision='keep'; p.reason='Best shadow — keep for raids/Master League';
        p.nickname=buildNickname(p,'lucky'); // NameⓇIV format — same as Lucky no-league
      } else if (p.slots.includes('purified')) {
        p.decision='keep'; p.reason='Best purified';
        p.nickname=buildNickname(p,'review');
      } else if (isLegendary&&p.slots.length===0&&qualifiesAny) {
        p.decision='protected'; p.reason='Legendary — best available';
        p.nickname=buildNickname(p,'review');
      } else if (isLegendary&&p.slots.length===0) {
        p.decision='protected'; p.reason='Legendary — keep until better found';
        p.nickname=buildNickname(p,'review');
      } else if (qualifiesAny) {
        p.decision='review'; p.reason='≥90% but not best in family — review';
        p.nickname=buildNickname(p,'review');
      } else if (p.slots.includes('collection')) {
        p.decision='keep';
        const cset = COLLECTION_SETS && COLLECTION_SETS[p.name];
        p.reason = cset ? `Collection — keeping ${cset.target} for full set` : 'Collection species';
        const pv = Math.round(p.rankPctM||p.ivAvg||0);
        p.nickname = fitName(p.name, LC.R+(pv>=100?PERFECT:String(pv)), '', 12);
        if (!p.slots.includes('collection_keep')) p.slots.push('collection_keep');
      } else if (p.isLucky) {
        // Lucky can never be traded — always keep as Master/Raid candidate
        p.decision='keep';
        p.reason='Lucky — always keep (Master/Raid candidate)';
        p.nickname=buildNickname(p,'lucky');
        if(!p.slots.includes('lucky')) p.slots.push('lucky');
      } else if (p.atkIV===15&&p.defIV===15&&p.staIV===15) {
        // 15/15/15 hundo — always keep regardless of league rank
        p.decision='keep';
        p.reason='Hundo (15/15/15) — always keep';
        p.nickname=buildNickname(p,'lucky'); // NameⓇ100 format
        if(!p.slots.includes('hundo')) p.slots.push('hundo');
        p.suggestStar=true;
      } else {
        p.decision='trade';
        p.reason=`IV ${Math.round(p.ivAvg)}% — not best in any slot`;
        if (COLLECTION_SETS && COLLECTION_SETS[p.name] && !p.specialForm && !p.vivillonPattern) {
          p.decision='review';
          p.reason='Collection species — set pattern in override panel';
        }
        p.nickname=buildNickname(p,'trade');
      }

      // Apply manual decision override from Supabase
      const ov = overridesCache[p.stableKey];
      if (ov && ov.manual_decision) p.decision = ov.manual_decision;
      if (ov && ov.is_shiny) p.isShiny = true;
      if (ov && ov.is_dynamax) p.isDynamax = true;
      if (ov && ov.is_gigantamax) p.isGigantamax = true;
      if (ov && ov.is_costumed) p.isCostumed = true;
      if (ov && ov.vivillon_pattern) p.vivillonPattern = ov.vivillon_pattern;
      if (ov && ov.special_form) p.specialForm = ov.special_form;
      if (ov && ov.notes) p.notes = ov.notes;

      // Suggest star: only confirmed best, lucky, best shiny, protected, nundo
      const isBestShiny = p.slots.includes('shiny'); // only TOP shiny, not shiny_lower
      // For protected (legendary), only star if it's the best IV in the family
      const isProtectedBest = p.decision==='protected' &&
        members.every(m => m===p || (m.ivAvg||0) <= (p.ivAvg||0));

      const hasAffordableSlot = p.slots.some(s => RULES.leagues.includes(s) || s.endsWith('_affordable'));
      p.suggestStarExpensive = p.isExpensiveWinner === true && !hasAffordableSlot;
      p.suggestStar = (
        !p.suggestStarExpensive &&
        (
          (p.decision==='keep' && (
            p.slots.some(s=>RULES.leagues.includes(s)) ||
            p.slots.some(s=>s.endsWith('_affordable')) ||
            p.slots.includes('lucky') ||
            isBestShiny ||
            p.slots.includes('nundo') ||
            p.slots.includes('shadow') ||
            p.slots.includes('purified')
          )) ||
          isProtectedBest ||
          (p.isLucky) ||
          (p.isCostumed)
        )
      );
      const cyanLeagues = p.cheaperAlternativeLeagues || [];
      const leagueSlots = p.slots.filter(s => RULES.leagues.includes(s));
      p.isCheaperAlternative = cyanLeagues.some(cl => leagueSlots.includes(cl));
      p.suggestStarCheaper = p.isCheaperAlternative && !p.suggestStarExpensive;
    });
    // Fix dustCostBest to use the dust for the assigned league slot
    members.forEach(p=>{
      const leagueSlot = p.slots.find(s=>['L','G','U','M'].includes(s));
      if (leagueSlot === 'L' && p.dustL > 0) p.dustCostBest = p.dustL;
      else if (leagueSlot === 'G' && p.dustG > 0) p.dustCostBest = p.dustG;
      else if (leagueSlot === 'U' && p.dustU > 0) p.dustCostBest = p.dustU;
      else if (leagueSlot === 'M') p.dustCostBest = 0; // Master = power to max, not league specific
      else p.dustCostBest = p.dustMin; // fallback for non-league slots
    });

    // ── EVO-COMMITTED CONFLICT RESOLUTION ───────────────────────────────────
    // If a pokemon holds slots requiring different evo stages (e.g. Great as Pawmot
    // AND Little as Pawmi), it can only physically be one thing.
    // Keep the highest league slot; remove conflicting lower slots and find next best.

    // First build a map of which evo stages already have a winner per league
    // so we don't assign duplicate slots
    const slotWinners = {}; // key: lg+'|'+evoTarget -> true if already has winner

    // Record existing slot winners
    members.forEach(p => {
      RULES.leagues.forEach(lg => {
        if (!p.slots.includes(lg)) return;
        const evo = lg==='L'?(p.evolvedNameL||p.name)
          :lg==='G'?(p.evolvedNameG||p.name)
          :lg==='U'?(p.evolvedNameU||p.name)
          :(p.evolvedNameU||p.evolvedNameG||p.name);
        slotWinners[lg+'|'+evo] = (slotWinners[lg+'|'+evo]||0) + 1;
      });
    });

    members.forEach(p => {
      if (p.slots.length < 2) return;
      const leagueSlots = p.slots.filter(s => RULES.leagues.includes(s));
      if (leagueSlots.length < 2) return;

      const slotEvo = (s, ref) => {
        const r = ref || p;
        if (s==='L') return r.evolvedNameL || r.name;
        if (s==='G') return r.evolvedNameG || r.name;
        if (s==='U') return r.evolvedNameU || r.name;
        return r.evolvedNameU || r.evolvedNameG || r.name;
      };

      const priority = ['M','U','G','L'];

      // Revised keep logic: highest league wins UNLESS a lower league rounds to 100%
      // and the higher league does NOT also round to 100%
      // e.g. Gurdurr 99.8% Great (rounds to 100%) vs 98.93% Ultra (rounds to 99%)
      // -> protect Great, find another Ultra candidate
      let keepSlot = priority.find(s => leagueSlots.includes(s)); // default: highest league
      const roundedRank = s => Math.round(p['rankPct'+s]||0);

      // Check if a lower slot should be protected
      for (const higherSlot of priority) {
        if (!leagueSlots.includes(higherSlot)) continue;
        for (const lowerSlot of priority.slice(priority.indexOf(higherSlot)+1)) {
          if (!leagueSlots.includes(lowerSlot)) continue;
          if (slotEvo(higherSlot) === slotEvo(lowerSlot)) continue; // same evo, no conflict
          const higherRounded = roundedRank(higherSlot);
          const lowerRounded = roundedRank(lowerSlot);
          // Protect lower slot if it rounds to 100 and higher does not
          if (lowerRounded >= 100 && higherRounded < 100) {
            keepSlot = lowerSlot; // protect the 100% lower league slot
          }
        }
      }

      const keepEvo = slotEvo(keepSlot);
      const conflicting = leagueSlots.filter(s => s !== keepSlot && slotEvo(s) !== keepEvo);
      if (!conflicting.length) return;

      conflicting.forEach(s => {
        const evoTarget = slotEvo(s);
        p.slots = p.slots.filter(x => x !== s);
        p.slotConfirmed = p.slots.some(x => RULES.leagues.includes(x));

        // Decrement winner count for this stage
        const wk = s+'|'+evoTarget;
        slotWinners[wk] = Math.max(0, (slotWinners[wk]||1) - 1);

        // Only find next best if this evo stage has NO winner left
        if ((slotWinners[wk]||0) > 0) return;

        // Find next best for this league/evoTarget
        const rf = 'rankPct'+s;
        const nextBest = members
          .filter(m => m !== p)
          .filter(m => !m.slots.some(ms => RULES.leagues.includes(ms) && slotEvo(ms, m) === evoTarget))
          .filter(m => {
            const d = s==='L'?m.dustL:s==='G'?m.dustG:s==='U'?m.dustU:0;
            const isFinal = !(m.evolvedNameG && m.evolvedNameG !== m.name) &&
                            !(m.evolvedNameU && m.evolvedNameU !== m.name);
            return (m[rf]||0) >= 70 && (d <= 300000 || isFinal || isLegendary);
          })
          .sort((a,b) => {
            const ra = a[rf]||0, rb = b[rf]||0;
            const da = (s==='L'?a.dustL:s==='G'?a.dustG:a.dustU)||0;
            const db = (s==='L'?b.dustL:s==='G'?b.dustG:b.dustU)||0;
            const eda = a.isLucky?da/2:da, edb = b.isLucky?db/2:db;
            const ta = ra>=99.99?0:ra>=99?1:ra>=90?2:3;
            const tb = rb>=99.99?0:rb>=99?1:rb>=90?2:3;
            if (ta!==tb) return ta-tb;
            if (Math.abs(ra-rb)>0.1) return rb-ra;
            return eda-edb;
          })[0];

        if (nextBest) {
          if (!nextBest.slots.includes(s)) {
            nextBest.slots.push(s);
            slotWinners[wk] = 1; // mark as filled
          }
          nextBest.slotConfirmed = (nextBest[rf]||0) >= RULES.keepThreshold;
          const nt = slotEvo(s, nextBest);
          nextBest.targetEvo = nt && nt !== nextBest.name ? nt : '';
        }
      });
    });

    // Remove duplicate slots: if two pokemon have the same league+evoTarget,
    // keep only the better ranked one
    RULES.leagues.forEach(lg => {
      const rf = 'rankPct'+lg;
      const byEvo = {};
      members.filter(p => p.slots.includes(lg)).forEach(p => {
        const evo = lg==='L'?(p.evolvedNameL||p.name)
          :lg==='G'?(p.evolvedNameG||p.name)
          :lg==='U'?(p.evolvedNameU||p.name)
          :(p.evolvedNameU||p.evolvedNameG||p.name);
        const key = lg+'|'+evo;
        if (!byEvo[key]) byEvo[key] = [];
        byEvo[key].push(p);
      });
      // If more than one winner for same stage, remove the weaker ones
      Object.values(byEvo).forEach(group => {
        if (group.length <= 1) return;
        group.sort((a, b) => {
          const ra = Math.round(a[rf]||0), rb = Math.round(b[rf]||0);
          if (ra !== rb) return rb - ra;
          const aEvo = lg==='L'?(a.evolvedNameL||a.name):lg==='G'?(a.evolvedNameG||a.name):(a.evolvedNameU||a.name);
          const bEvo = lg==='L'?(b.evolvedNameL||b.name):lg==='G'?(b.evolvedNameG||b.name):(b.evolvedNameU||b.name);
          const aEvolved = a.name === aEvo ? 0 : 1;
          const bEvolved = b.name === bEvo ? 0 : 1;
          if (aEvolved !== bEvolved) return aEvolved - bEvolved;
          const da = a.isLucky ? (a['dust'+lg]||0)/2 : (a['dust'+lg]||0);
          const db = b.isLucky ? (b['dust'+lg]||0)/2 : (b['dust'+lg]||0);
          return da - db;
        });
        group.slice(1).forEach(p => {
          p.slots = p.slots.filter(s => s !== lg);
          p.slotConfirmed = p.slots.some(s => RULES.leagues.includes(s));
        });
      });
    });
    // ─────────────────────────────────────────────────────────────────────────

    // Recompute cyan/expensive star flags — conflict resolution above may have
    // removed slots from p.slots, leaving cheaperAlternativeLeagues stale.
    members.forEach(p => {
      const cyanLeagues = (p.cheaperAlternativeLeagues || []).filter(cl =>
        p.slots.includes(cl)
      );
      p.cheaperAlternativeLeagues = cyanLeagues;
      const leagueSlots = p.slots.filter(s => RULES.leagues.includes(s));
      p.isCheaperAlternative = cyanLeagues.some(cl => leagueSlots.includes(cl));
      p.suggestStarCheaper = p.isCheaperAlternative && !p.suggestStarExpensive;
    });

    const allN=new Set(parsed.map(p=>p.name));
    members.forEach(p=>{
      if(p.suggestStar&&p.targetEvo){
        // Check if ANY member of the evo chain exists in collection
        // e.g. if targeting Kadabra but we have Alakazam, not "never evolved"
        const famMemNames = new Set(members.map(m=>m.name));
        // Get all evo targets for this pokemon's family
        const evoChain = new Set();
        members.forEach(m=>{
          if(m.evolvedNameG) evoChain.add(m.evolvedNameG);
          if(m.evolvedNameU) evoChain.add(m.evolvedNameU);
          if(m.evolvedNameL) evoChain.add(m.evolvedNameL);
        });
        // Never evolved = none of the evo targets exist in the full collection
        const nv = [...evoChain].every(evo => !allN.has(evo));
        p.evoIndicator=nv?'<span class="evo-ind evo-gold" title="First one!">&#x24BA;</span> ':'<span class="evo-ind evo-grey" title="Evolve">&#x24BA;</span> ';
        p.canEvolve=true; p.neverEvolved=nv;
      }
      if(p.atkIV===15&&p.defIV===15&&p.staIV===15){
        p.isHundo=true;
        p.dustToL40=(p.level||0)<40?dustToMax(p.level||1,40):0;
        const ls=p.slots.find(s=>['L','G','U'].includes(s));
        const cap=ls==='L'?500:ls==='G'?1500:ls==='U'?2500:null;
        if(cap&&(p.cp||0)<cap) p.belowCapNote='Max CP below '+RULES.leagueNames[ls]+' cap ('+p.cp+' max) - hundo is optimal';
      }
    });
  });

  // Build family list
  const famList=Object.entries(byFamily).map(([key,members])=>{
    members.sort((a,b)=>{
      const o={keep:0,protected:1,review:2,trade:3};
      return (o[a.decision]||3)-(o[b.decision]||3);
    });
    // Use most evolved / most common name as family label
    // Most evolved = the name that appears most as an evo target, or just most common
    const nameCounts = {};
    members.forEach(m=>nameCounts[m.name]=(nameCounts[m.name]||0)+1);
    // Prefer names that are NOT evo targets (i.e. final evolutions)
    const evoTargets = new Set();
    members.forEach(m=>{
      if(m.evolvedNameG) evoTargets.add(m.evolvedNameG);
      if(m.evolvedNameU) evoTargets.add(m.evolvedNameU);
      if(m.evolvedNameL) evoTargets.add(m.evolvedNameL);
    });
    const finalEvos = Object.keys(nameCounts).filter(n=>!evoTargets.has(n)||nameCounts[n]>5);
    const primaryName = finalEvos.length
      ? finalEvos.sort((a,b)=>nameCounts[b]-nameCounts[a])[0]
      : (members[0]?.name||key);
    return {
      key, members,
      primaryName,
      keepCount:members.filter(p=>p.decision==='keep').length,
      tradeCount:members.filter(p=>p.decision==='trade').length,
      reviewCount:members.filter(p=>p.decision==='review'||p.decision==='protected').length,
    };
  }).sort((a,b)=>a.primaryName.localeCompare(b.primaryName));

  return {pokemon:parsed, families:famList};
}