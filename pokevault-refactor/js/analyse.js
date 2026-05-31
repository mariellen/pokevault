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
    const gender = r['Gender']||'';
    const needsGenderSplit = GENDER_SPLIT_SPECIES.has(r['Name']);
    let baseFamKey = (isRegional || needsSplit) ? r['Pokemon Number']+'|'+form : r['Pokemon Number'];
    if (needsGenderSplit && gender) baseFamKey = baseFamKey + '|' + gender;
    ['Name (G)','Name (U)','Name (L)'].forEach(col => {
      const evoName = (r[col]||'').trim();
      if (!evoName || evoName === r['Name']) return;
      const evoNum = nameToNum[evoName];
      if (!evoNum) return;
      if (STANDALONE_SPECIES.has(evoName)) return; // e.g. Kleavor — standalone, not part of Scyther family
      // Evo inherits same regional form; gender-split evo inherits same gender (e.g. Frillish♂→Jellicent♂)
      let evoFamKey = isRegional ? evoNum+'|'+form : evoNum;
      if (needsGenderSplit && gender && GENDER_SPLIT_SPECIES.has(evoName)) evoFamKey = evoFamKey + '|' + gender;
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

function buildNickname(p, slot, convention) {
  const iv = Math.round(p.ivAvg||0);
  const atkIV=p.atkIV||0, defIV=p.defIV||0, staIV=p.staIV||0;
  const isNundo = atkIV===0&&defIV===0&&staIV===0;
  const isHundo = atkIV===15&&defIV===15&&staIV===15;

  // Target name for this slot; also capture the evo target's form for B1 nick prefix.
  let base = p.name;
  let evolvedFormForSlot = '';
  if (slot==='G' && p.evolvedNameG) { base=p.evolvedNameG; evolvedFormForSlot=p.evolvedFormG||''; }
  else if (slot==='U' && p.evolvedNameU) { base=p.evolvedNameU; evolvedFormForSlot=p.evolvedFormU||''; }
  else if (slot==='L' && p.evolvedNameL) { base=p.evolvedNameL; evolvedFormForSlot=p.evolvedFormL||''; }
  else if (slot==='M') {
    base=p.evolvedNameU||p.evolvedNameG||p.name;
    evolvedFormForSlot=p.evolvedFormU||p.evolvedFormG||'';
  }
  // VALID_EVOLUTIONS returns form-qualified keys (e.g. 'Ninetales|Alola') — strip the suffix
  // so fitName works on the plain species name.
  if (base.includes('|')) base = base.split('|')[0];

  // Form nick prefix: visually distinct forms use short prefix instead of species name
  // (e.g. Castform Snowy→'Snow', Deoxys Attack→'Atk', Furfrou Dandy→'Dand')
  // B1: evo-target form prefix when evo form differs from own form (e.g. Rockruff '' →
  //     Midnight: different → 'Night'). Alolan Vulpix ('Alola' → 'Alola'): same → no prefix.
  //     Fires per-slot, so a Rockruff with G=Midnight/U=Midday gets Night(G) and Day(U).
  // B2: own-form prefix — suppressed for regional-variant forms (Alola/Galar/Hisui/Paldea)
  //     when no cross-league evo-form divergence. These are in their own PokéVault families so
  //     the prefix is redundant. Battle forms (Midnight/Midday etc.) keep their prefix.
  const activeForm = p.specialForm || p.form;
  const evoFormValues = [
    p.evolvedNameG ? (p.evolvedFormG || '') : null,
    p.evolvedNameU ? (p.evolvedFormU || '') : null,
    p.evolvedNameL ? (p.evolvedFormL || '') : null,
  ].filter(f => f !== null);
  // Filter blanks before comparing — a missing form is not a divergent form.
  const nonBlankEvoForms = evoFormValues.filter(f => f !== '');
  const evoFormsDiffer = nonBlankEvoForms.length > 1 && new Set(nonBlankEvoForms).size > 1;
  const evoFormPrefix = evolvedFormForSlot && evolvedFormForSlot !== (p.form || '')
    && typeof FORM_NICK_PREFIXES !== 'undefined' && FORM_NICK_PREFIXES[evolvedFormForSlot];
  const REGIONAL_FORMS = new Set(['Alola', 'Galar', 'Hisui', 'Paldea']);
  const suppressB2 = !evoFormsDiffer && (base !== p.name || REGIONAL_FORMS.has(p.form || ''));
  const formPrefix = !suppressB2 && activeForm
    && typeof FORM_NICK_PREFIXES !== 'undefined' && FORM_NICK_PREFIXES[activeForm];
  if (evoFormPrefix) base = evoFormPrefix;
  else if (formPrefix) base = formPrefix;

  if (isNundo) return fitName(base, NUNDO, '', 12);

  // Special marker suffixes applied regardless of convention (shiny ※, dynamax Ⓓ, gigantamax Ⓧ)
  let specialSuf = '';
  if (p.isDynamax) specialSuf += 'Ⓓ';
  if (p.isGigantamax) specialSuf += 'Ⓧ';
  if (p.isShiny || slot === 'shiny' || slot === 'shiny_lower') specialSuf += SHINY_SFX;

  // Non-pvpvault conventions: simplified name+IV/moves format
  if (convention && convention !== 'pvpvault') {
    if (convention === 'ivpct') {
      return fitName(base, String(iv), specialSuf, 12);
    }
    if (convention === 'rawiv') {
      return fitName(base, String(atkIV)+String(defIV)+String(staIV), specialSuf, 12);
    }
    if (convention === 'moves') {
      const mc = typeof MOVE_CODES !== 'undefined' ? MOVE_CODES : null;
      const qCode = mc && mc[p.quickMove];
      const cCode = mc && mc[p.chargeMove1];
      if (qCode && cCode) return fitName(base, qCode+'/'+cCode, specialSuf, 12);
      return fitName(base, String(iv), specialSuf, 12); // fallback to ivpct
    }
  }

  // Special-status with no confirmed slot — must short-circuit before holding nick
  const hasSlot = slot && slot !== 'review';
  if (!hasSlot) {
    // Lucky: always Ⓡ format regardless of rank (includes any co-occurring special suffixes)
    if (p.isLucky) {
      const specSuf = (p.isDynamax ? 'Ⓓ' : '') + (p.isGigantamax ? 'Ⓧ' : '') + (isHundo ? HUNDO_SFX : '') + (p.isShiny ? SHINY_SFX : '');
      return fitName(p.name, LC.R + String(iv), specSuf, 12);
    }
    // Shiny with no slot: Ⓡ + iv + [Ⓗ] + ※
    if (p.isShiny) return fitName(p.name, LC.R + String(iv), (isHundo ? HUNDO_SFX : '') + SHINY_SFX, 12);
    // Dynamax/Gigantamax: redirect to slot handlers that pick best qualifying league
    if (p.isDynamax) slot = 'dynamax';
    else if (p.isGigantamax) slot = 'gigantamax';
  }

  // Build suffix first so we know how many chars it needs
  let suf='';

  // Dust dollars — only shown above affordable threshold; suppressed entirely for hundos
  if (!isHundo) {
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
  }
  // Shadow purification suffix — omit only if shadow holds a CONFIRMED own-league slot
  // (the purify slot itself doesn't count; tentative slots below keepThreshold don't count)
  if (p.isShadow && p.purifyLeague) {
    const hasShadowOwnSlot = p.slots.some(s => {
      if (!['L','G','U','M'].includes(s) || s === p.purifyLeague) return false;
      const r = s==='L'?(p.rankPctL||0):s==='G'?(p.rankPctG||0):s==='U'?(p.rankPctU||0):(p.ivAvg||0);
      return r >= RULES.keepThreshold;
    });
    if (!hasShadowOwnSlot) suf += p.purifyHundo ? 'p✪' : 'p';
  }
  if (p.isPurified) suf += '*';
  if (p.isDynamax) suf += 'Ⓓ';
  if (p.isGigantamax) suf += 'Ⓧ';
  if (isHundo) suf += HUNDO_SFX;

  // Move flags
  if (p.hasAllBestMoves) suf+='☆';
  else if (p.hasTwoMoves&&p.hasBestMoves) suf+='b';

  // Shiny on non-shiny slots — always last so ※ trails everything else in GO
  if (p.isShiny && slot !== 'shiny' && slot !== 'shiny_lower') suf += SHINY_SFX;

  let mid='', nickSuf=suf;

  if (slot==='trade') {
    // name + iv + 't' + suf — use lowercase, fit name
    mid=iv+'t';
    return fitName(p.name, mid, nickSuf, 12);
  } else if (slot==='review') {
    // Shadow purify: use purify league symbol + purifyRankPct when no own-league slot
    if (p.isShadow && p.purifyLeague) {
      const ownSlotExists = p.slots.some(s => {
        if (!['L','G','U','M'].includes(s) || s === p.purifyLeague) return false;
        const r = s==='L'?(p.rankPctL||0):s==='G'?(p.rankPctG||0):s==='U'?(p.rankPctU||0):(p.ivAvg||0);
        return r >= RULES.keepThreshold;
      });
      if (!ownSlotExists) {
        const pv = Math.round(p.purifyRankPct || 0);
        return fitName(p.name, (LC[p.purifyLeague]||LC.R) + String(pv), nickSuf, 12);
      }
    }
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
    // Lucky uses Ⓡ (best-overall indicator); confirmed ML slot uses Ⓜ
    mid=(p.isLucky ? LC.R : LC.M)+(pv===100?PERFECT:String(pv));
    return fitName(base, mid, nickSuf, 12);
  } else if (['L','G','U'].includes(slot)) {
    const pv = (p.isPurifySlot && slot === p.purifyLeague)
      ? Math.round(p.purifyRankPct || 0)
      : Math.round(slot==='L'?p.rankPctL:slot==='G'?p.rankPctG:p.rankPctU);
    mid=LC[slot]+(pv===100?PERFECT:String(pv));
    return fitName(base, mid, nickSuf, 12);
  } else if (slot==='shiny'||slot==='shiny_lower') {
    const best=['G','U','L'].find(l=>(p['rankPct'+l]||0)>=RULES.keepThreshold);
    if (best) {
      const pv=Math.round(p['rankPct'+best]||0);
      mid=LC[best]+(pv===100?PERFECT:String(pv));
    } else {
      mid=LC.R+String(iv);
    }
    nickSuf=suf+SHINY_SFX;
    return fitName(p.name, mid, nickSuf, 12);
  } else if (slot==='dynamax') {
    const best=['G','U','L','M'].find(l=>(p['rankPct'+l]||0)>=RULES.keepThreshold);
    if (best) { const pv=Math.round(p['rankPct'+best]||0); mid=LC[best]+(pv===100?PERFECT:String(pv)); }
    else { mid=LC.R+String(iv); }
    return fitName(p.name, mid, nickSuf, 12); // nickSuf has Ⓓ from suf
  } else if (slot==='gigantamax') {
    const best=['G','U','L','M'].find(l=>(p['rankPct'+l]||0)>=RULES.keepThreshold);
    if (best) { const pv=Math.round(p['rankPct'+best]||0); mid=LC[best]+(pv===100?PERFECT:String(pv)); }
    else { mid=LC.R+String(iv); }
    return fitName(p.name, mid, nickSuf, 12); // nickSuf has Ⓧ from suf
  } else if (slot==='lucky') {
    // Pure hundo with no league slot (not actually lucky): standalone Ⓗ only
    if (isHundo && !p.isLucky) return fitName(p.name, HUNDO_SFX, '', 12);
    // Lucky with no league slot: BaseⓇIV — base is evo species name where applicable
    const pv=Math.round(p.rankPctM||p.ivAvg||0);
    mid=LC.R+String(pv);
    return fitName(base, mid, nickSuf, 12);
  } else if (slot==='M_placeholder') {
    mid = String(iv)+'m';
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
// mid = the league symbol + number (e.g. Ⓖ96), suf = trailing flags (Ⓗ, b, ☆, $, ※)
function fitName(name, mid, suf, maxLen) {
  const available = maxLen - mid.length - suf.length;
  const nm = available > 0 ? name.slice(0, available) : '';
  return (nm + mid + suf).substring(0, maxLen);
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
// Format: familyKey|form|gender|atkIV|defIV|staIV|catchDate||originalScanDate
// ═══════════════════════════════════════════════
function makeStableKey(p) {
  // Key: PokemonNumber|Form|Gender|AtkIV|DefIV|StaIV|CatchDate||OriginalScanDate
  // CP excluded: it changes when the pokemon is powered up, which would lose overrides
  // originalScanDate used as fallback — set on first scan, never changes (100% coverage vs 33% catch dates)
  const date = p.catchDate || p.originalScanDate || ('_idx' + (p.idx||''));
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
function normSpeciesId(name) {
  return (name || '').toLowerCase()
    .replace(/['.♀♂:é]/g, s => s === 'é' ? 'e' : '')
    .replace(/[\s\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/, '');
}

function simulatePurify(p) {
  if (!p.isShadow) return;
  const pAtk = Math.min(15, (p.atkIV||0)+2);
  const pDef = Math.min(15, (p.defIV||0)+2);
  const pSta = Math.min(15, (p.staIV||0)+2);
  p.purifyHundo = pAtk===15 && pDef===15 && pSta===15;

  const purifyIvAvg = ((pAtk+pDef+pSta)/45)*100;
  const improvement = purifyIvAvg - (p.ivAvg||0);
  const purifiedMinLevel = Math.max(p.level||1, 25);
  const hasBaseStats = typeof GO_BASE_STATS_BY_NAME !== 'undefined' && typeof CP_MULTIPLIERS !== 'undefined';

  const leagueChecks = [
    {lg:'L', cap:500,      rank:p.rankPctL||0, evo:p.evolvedNameL||p.name},
    {lg:'G', cap:1500,     rank:p.rankPctG||0, evo:p.evolvedNameG||p.name},
    {lg:'U', cap:2500,     rank:p.rankPctU||0, evo:p.evolvedNameU||p.name},
    {lg:'M', cap:Infinity, rank:p.ivAvg||0,    evo:p.evolvedNameU||p.evolvedNameG||p.name},
  ];

  let bestLeague='', bestPct=0;
  leagueChecks.forEach(({lg, cap, rank, evo}) => {
    if (rank <= 0) return;
    if (rank >= RULES.keepThreshold) return;
    const estimatedPurified = lg==='M' ? purifyIvAvg : Math.min(100, rank + improvement * 0.4);
    if (estimatedPurified < RULES.keepThreshold) return;

    if (cap < Infinity) {
      let exceedsCap;
      if (hasBaseStats) {
        const evoId = normSpeciesId(evo);
        const evoStats = GO_BASE_STATS_BY_NAME[evoId] || GO_BASE_STATS_BY_DEX[p.pokeNum] || null;
        if (evoStats) {
          const cpm = CP_MULTIPLIERS[purifiedMinLevel];
          if (cpm) {
            const cp = Math.max(10, Math.floor(
              (evoStats.atk+pAtk) * Math.sqrt(evoStats.def+pDef) * Math.sqrt(evoStats.sta+pSta) * cpm * cpm / 10
            ));
            exceedsCap = cp > cap;
          } else {
            exceedsCap = Math.round((p.cp||0)*1.07) > cap;
          }
        } else {
          console.warn('[PurifyCalc] Missing base stats for', evo, '(dex', p.pokeNum+') — using heuristic');
          exceedsCap = Math.round((p.cp||0)*1.07) > cap;
        }
      } else {
        exceedsCap = Math.round((p.cp||0)*1.07) > cap;
      }
      if (exceedsCap) return;
    }

    if (estimatedPurified > bestPct) {
      bestLeague = lg;
      bestPct = estimatedPurified;
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
  // Evo targets that are standalone families — not valid evo paths for slot assignment
  const STANDALONE_SPECIES = new Set(['Kleavor', 'Weezing|Galar']);

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
    // Finding B2: form-qualified key lookup for regional variants (Alola/Galar/Hisui/Paldea).
    // When a Pokémon has a regional form, VALID_EVOLUTIONS may have a 'Name|Form' entry
    // returning form-qualified evo targets (e.g. 'Arcanine|Hisui') so regional lines are
    // distinguishable from their base-form counterparts in nicks and targetEvo.
    const pForm = r['Form'] || '';
    const REGIONAL_FORMS_VE = ['Alola', 'Galar', 'Hisui', 'Paldea'];
    const isRegionalPoke = REGIONAL_FORMS_VE.includes(pForm);
    const validateEvo = name => {
      if (!name || name === r['Name']) return '';
      const formKey = isRegionalPoke ? r['Name'] + '|' + pForm : null;
      const validEvos = (formKey && typeof VALID_EVOLUTIONS !== 'undefined' && VALID_EVOLUTIONS[formKey])
        || (typeof VALID_EVOLUTIONS !== 'undefined' && VALID_EVOLUTIONS[r['Name']]);
      if (!validEvos) return '';
      // Support form-qualified evo targets ('Arcanine|Hisui'): match by base species name
      const baseName = name.split('|')[0];
      const match = validEvos.find(v => v === name || v.split('|')[0] === baseName);
      if (!match) return '';
      if (STANDALONE_SPECIES.has(match.split('|')[0])) return '';
      return match; // may be 'Arcanine|Hisui' for Hisui Growlithe
    };

    // Finding B1: capture per-league evo target form from Pokégenie's Form (G/U/L) columns.
    // 'Normal' is normalised to '' for consistency with the base-form convention.
    const toEvoForm = f => (!f || f === 'Normal') ? '' : f;
    const evolvedFormG = toEvoForm(r['Form (G)']);
    const evolvedFormU = toEvoForm(r['Form (U)']);
    const evolvedFormL = toEvoForm(r['Form (L)']);

    // Apply evo overrides for species where Pokégenie omits evo path data (e.g. male Gothita)
    const evoOvr = (typeof EVO_OVERRIDES !== 'undefined')
      ? (EVO_OVERRIDES[r['Name']+'|'+(r['Gender']||'')] || EVO_OVERRIDES[r['Name']] || null)
      : null;
    let evolvedNameG = validateEvo(r['Name (G)']) || (evoOvr && validateEvo(evoOvr.G)) || '';
    let evolvedNameU = validateEvo(r['Name (U)']) || (evoOvr && validateEvo(evoOvr.U)) || '';
    let evolvedNameL = validateEvo(r['Name (L)']) || (evoOvr && validateEvo(evoOvr.L)) || '';

    // Tyrogue: IV-based evo correction (Pokégenie can misreport equality case).
    // ATK > DEF → Hitmonlee; DEF > ATK → Hitmonchan; ATK = DEF → Hitmontop.
    if (r['Name'] === 'Tyrogue') {
      const hitmon = atkIV > defIV ? 'Hitmonlee' : atkIV < defIV ? 'Hitmonchan' : 'Hitmontop';
      const tyrogueEvos = typeof VALID_EVOLUTIONS !== 'undefined' ? VALID_EVOLUTIONS['Tyrogue'] : null;
      if (tyrogueEvos) {
        if (tyrogueEvos.includes(evolvedNameG)) evolvedNameG = hitmon;
        if (tyrogueEvos.includes(evolvedNameU)) evolvedNameU = hitmon;
        if (tyrogueEvos.includes(evolvedNameL)) evolvedNameL = hitmon;
      }
    }

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
      evolvedNameG, evolvedNameU, evolvedNameL,
      evolvedFormG, evolvedFormU, evolvedFormL,
      standaloneEvoG:!!(r['Name (G)'] && r['Name (G)']!==r['Name'] && STANDALONE_SPECIES.has(r['Name (G)'])),
      standaloneEvoU:!!(r['Name (U)'] && r['Name (U)']!==r['Name'] && STANDALONE_SPECIES.has(r['Name (U)'])),
      standaloneEvoL:!!(r['Name (L)'] && r['Name (L)']!==r['Name'] && STANDALONE_SPECIES.has(r['Name (L)'])),
      dustG,dustU,dustL,dustMin,dustCostBest:dustMin,
      catchDate:r['Catch Date']||'', catchDateMs:parseCatchDate(r['Catch Date']),
      scanDate:r['Scan Date']||'',
      originalScanDate:r['Original Scan Date']||'',
      pvpTag:r['Marked for PvP use']||'',
      moveKnown:mv.known, hasAllBestMoves:mv.hasAllBestMoves, hasBestMoves:mv.hasBestMoves,
      hasTwoMoves:!!r['Charge Move 2'], moveNotes:mv.notes,
      bestFast:mv.bestFast, bestC1:mv.bestC1, bestC2:mv.bestC2,
      pokeType:getPokeType(r['Name']),
      slots:[], decision:'review', reason:'', nickname:'', suggestStar:false,
      hasBattleSlot:false,
      suggestStarExpensive:false, suggestStarCheaper:false,
      isExpensiveWinner:false, isAffordableWinner:false, isCheaperAlternative:false,
      targetEvo:'', hidden:false, evoIndicator:'', canEvolve:false, neverEvolved:false, isHundo:false, dustToL40:0, belowCapNote:'',
      isDynamax:false, isGigantamax:false, isCostumed:false, vivillonPattern:'', specialForm:'', manualDecision:'', notes:'', stableKey:'',
      overBudget100:false, cheaperAvailable:false,
      evolutionUnknown: typeof FAMILY_OVERRIDES !== 'undefined' && FAMILY_OVERRIDES.unknownEvo ? FAMILY_OVERRIDES.unknownEvo.has(r['Name']) : false,
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

  // Apply flag overrides before slot/nick building so isShiny, isDynamax, specialForm
  // are correct when shiny slot assignment and buildNickname run.
  if (typeof overridesCache !== 'undefined') {
    parsed.forEach(p => {
      const ov = overridesCache[p.stableKey];
      if (!ov) return;
      if (ov.is_shiny) p.isShiny = true;
      if (ov.is_dynamax) p.isDynamax = true;
      if (ov.is_gigantamax) p.isGigantamax = true;
      if (ov.is_costumed) p.isCostumed = true;
      if (ov.vivillon_pattern) p.vivillonPattern = ov.vivillon_pattern;
      if (ov.special_form) p.specialForm = ov.special_form;
    });
  }

  // Simulate purification for shadows
  parsed.forEach(p => {
    simulatePurify(p);
    // If shadow qualifies when purified, assign purify league as a slot
    // so it gets e.g. GurdurrⒼ92p instead of Ⓡ73p
    if (p.isShadow && p.purifyLeague && p.purifyRankPct >= RULES.keepThreshold) {
      if (!p.slots.includes(p.purifyLeague)) {
        p.slots.push(p.purifyLeague);
        p.isPurifySlot = true;
        p.slotConfirmed = true;
      }
    }
  });

  // Determine slots — ONE best per evolution stage per league
  Object.values(byFamily).forEach(members=>{
    const isLegendary=members.some(p=>LEGENDARY.has(p.name)||MYTHICAL.has(p.name)||ULTRA_BEAST.has(p.name));

    // Evaluate leagues in priority order M>U>G>L so higher leagues get first pick
    ['M','U','G','L'].forEach(lg=>{
      const rankField=`rankPct${lg}`;
      const byEvoStage={};
      members.forEach(p=>{
        // Skip leagues where the evo target is a standalone species — rankPct for that league
        // reflects the standalone species' rank, not this Pokémon's, so the data is invalid.
        if (lg==='L' && p.standaloneEvoL) return;
        if (lg==='G' && p.standaloneEvoG) return;
        if (lg==='U' && p.standaloneEvoU) return;

        const stageName = lg==='L'?(p.evolvedNameL||p.name)
          :lg==='G'?(p.evolvedNameG||p.name)
          :lg==='U'?(p.evolvedNameU||p.name)
          :(p.evolvedNameU||p.evolvedNameG||p.name);
        // Split by gender for dimorphic species; split shadow/purified/lucky into own sub-groups
        // so each variant type gets an independent slot (shadow Great + regular Great can coexist)
        const isDimorphic = GENDER_DIMORPHIC.has(stageName)||GENDER_DIMORPHIC.has(p.name);
        const variantKey = p.isShadow ? '|shadow' : p.isPurified ? '|purified' : p.isLucky ? '|lucky' : '';
        const groupKey = (isDimorphic && p.gender) ? stageName+'|'+p.gender+variantKey : stageName+variantKey;
        if (!byEvoStage[groupKey]) byEvoStage[groupKey]=[];
        byEvoStage[groupKey].push(p);
      });

      Object.entries(byEvoStage).forEach(([groupKey,group])=>{
        // Strip gender/variant suffix to get the actual species name for comparisons
        const stageName = groupKey.split('|')[0];
        // Master league: only final evolution
        if (lg==='M') {
          if (isLegendary) return; // Legendaries skip ML — handled by best_overall
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
        const DUST_EXCLUDE_THRESHOLD = RULES.dustExcludeThreshold; // over threshold = not worth considering
        const leagueDust = p => lg==='L'?p.dustL:lg==='G'?p.dustG:lg==='U'?p.dustU:0;

        const eligible = (lg==='M' ? group : group.filter(p => (p.cp||0) <= leagueCap * 1.05))
          .filter(p => {
            // One slot per Pokémon: once assigned to any league in the main pass, exclude from all others.
            // isPurifySlot Pokémon are exempt until they win their first main-pass battle slot —
            // the purify-assigned slot is a recommendation (keep-to-purify), not a won battle slot.
            if (p.hasBattleSlot) return false;
            if (!p.isPurifySlot && p.slots.some(s => RULES.leagues.includes(s) || s.endsWith('_affordable'))) return false;

            // Master league: only the final evolution (must BE stageName, not just evolve to it)
            // Exception 1: hundo pre-evos always allowed — will be evolved, and 15/15/15 beats any evolved form
            // Exception 2: best-IV pre-evo allowed when no evolved form is available in the group
            // Exception 3: best-IV pre-evo allowed when it strictly outranks ALL final evos (unevolved high-IV)
            if (lg === 'M' && p.name !== stageName) {
              // Pre-evo committed to Little League: should stay as LL battler, not ML candidate
              if (p.dustL === 0 && (p.cp||0) <= 500 * 1.05 && p.isFavorite && (p.rankPctL||0) >= RULES.keepThreshold) return false;
              const isHundo = p.atkIV === 15 && p.defIV === 15 && p.staIV === 15;
              if (isHundo) return true;
              const finalEvosInGroup = group.filter(m => m.name === stageName);
              if (finalEvosInGroup.length > 0) {
                const bestFinalEvoIV = Math.max(...finalEvosInGroup.map(m => m.ivAvg || 0));
                if ((p.ivAvg || 0) <= bestFinalEvoIV) return false;
                const maxPreEvoIV = Math.max(...group.filter(m => m.name !== stageName).map(m => m.ivAvg || 0));
                return (p.ivAvg || 0) >= maxPreEvoIV;
              }
              const maxIV = Math.max(...group.map(m => m.ivAvg || 0));
              return (p.ivAvg || 0) >= maxIV;
            }

            // Dust exclusion: non-final, non-legendary over 300k excluded
            const d = leagueDust(p);
            const pIsFinalEvo = !members.some(m =>
              m.name === p.name && (
                (m.evolvedNameG && m.evolvedNameG !== p.name) ||
                (m.evolvedNameU && m.evolvedNameU !== p.name)
              )
            );
            if (d > DUST_EXCLUDE_THRESHOLD && !pIsFinalEvo && !isLegendary && (p[rankField]||0) < RULES.keepThreshold) return false;

            // Already consumed for evolution in a higher-priority league — can't also battle as itself here.
            // e.g. Skwovet wins UL-as-Greedent (targetEvo='Greedent'), so it can't also hold a GL-as-Skwovet slot.
            // ML falls back to p.name but targetEvo is always undefined when ML runs (first in M→U→G→L order).
            const thisLgEvo = lg==='L'?(p.evolvedNameL||p.name)
              :lg==='G'?(p.evolvedNameG||p.name)
              :lg==='U'?(p.evolvedNameU||p.name)
              :p.name;
            if (p.targetEvo && p.targetEvo !== p.name && thisLgEvo === p.name) return false;

            // Exclude if already holding a confirmed higher-priority slot for a DIFFERENT evo target.
            // Such a candidate would win this slot then be deconflicted by diffEvoConflicts, leaving the slot empty.
            if (lg !== 'M') {
              const priority = ['M','U','G','L'];
              const lgPri = priority.indexOf(lg);
              const hasConflictingConfirmedSlot = p.slots.some(existingSlot => {
                const esPri = priority.indexOf(existingSlot);
                if (esPri < 0 || esPri >= lgPri) return false;
                const esEvo = existingSlot==='L'?(p.evolvedNameL||p.name)
                  :existingSlot==='G'?(p.evolvedNameG||p.name)
                  :existingSlot==='U'?(p.evolvedNameU||p.name)
                  :(p.evolvedNameU||p.evolvedNameG||p.name); // Master: same formula as slotEvo('M')
                if (esEvo === thisLgEvo) return false; // same evo target — no conflict
                return (p['rankPct'+existingSlot]||0) >= RULES.keepThreshold;
              });
              if (hasConflictingConfirmedSlot) return false;
            }

            // Pre-evo with no valid evo path for this league — don't assign a self-referencing slot.
            // Rank>0 check: if Pokégenie filled a rank, the evo name may be self-referential (e.g.
            // Gligar battling GL as itself); exclude only truly unanalysed rows (rank=0, evo blank).
            if (lg === 'U' && !p.evolvedNameU && !pIsFinalEvo && !isLegendary) return false;
            if (lg === 'G' && !p.evolvedNameG && !(p.rankPctG > 0) && !pIsFinalEvo && !isLegendary) return false;
            if (lg === 'L' && !p.evolvedNameL && !(p.rankPctL > 0) && !pIsFinalEvo && !isLegendary) return false;

            // Committed to a lower league: already powered to cap with 0 dust and favourited
            // Check rankPct to distinguish "powered up" (true 0 dust) from "no data" (empty CSV field → 0)
            const littleQualifies = (p.rankPctL||0) >= RULES.keepThreshold;
            const greatQualifies  = (p.rankPctG||0) >= RULES.keepThreshold;
            const EPS = 0.01;
            const betterInThisLg = (lowerRank) => (p[rankField]||0) > (lowerRank||0) + EPS;
            // "Committed to a lower league" applies only when the higher-league evo target matches the
            // Little-league target (same physical form — truly can't serve both simultaneously).
            // Skwovet-as-Skwovet (Little) vs evolved-to-Greedent (Great/Ultra) are different forms.
            const littleEvoTarget = p.evolvedNameL || p.name;
            const lgEvoTarget = lg === 'G' ? (p.evolvedNameG||p.name)
                              : lg === 'U' ? (p.evolvedNameU||p.name)
                              : (p.evolvedNameU||p.evolvedNameG||p.name);
            if ((lg === 'U' || lg === 'G' || lg === 'M') && p.dustL === 0 && (p.cp||0) <= 500 * 1.05
                && p.isFavorite && littleQualifies && littleEvoTarget === lgEvoTarget) return false;
            // Low-CP Pokémon committed to Great but not Ultra (dustG=0, dustU≠0) — exclude from Ultra
            if (lg === 'U' && p.dustG === 0 && p.dustU !== 0 && (p.cp||0) <= 500 * 1.05
                && p.isFavorite && greatQualifies && !betterInThisLg(p.rankPctG)) return false;
            if (lg === 'U' && p.dustG === 0 && (p.cp||0) <= 1500 * 1.05 && (p.cp||0) > 500 * 1.05
                && p.isFavorite && !betterInThisLg(p.rankPctG)) return false;

            // Set isCommitted flag for display (pokemon at their cap with 0 dust)
            const leagueDustVal = lg==='L'?p.dustL:lg==='G'?p.dustG:lg==='U'?p.dustU:null;
            if (lg !== 'M' && (p.cp||0) >= leagueCap * 0.97 && leagueDustVal === 0) p.isCommitted = true;

            return true;
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
          // Prefer higher actual rank before evolved preference — higher real rank always wins
          if (Math.abs(ra - rb) > 0.01) return rb - ra;
          // Prefer already-evolved (p.name === stageName) over pre-evos at tied actual rank
          const aIsEvolved = (a.name === stageName) ? 0 : 1;
          const bIsEvolved = (b.name === stageName) ? 0 : 1;
          if (aIsEvolved !== bIsEvolved) return aIsEvolved - bIsEvolved;
          return effectiveDust(a) - effectiveDust(b);
        });

        // Option C+D: affordable-first two-pass. ML always single pass (Option D — exempt by design).
        // Pass 1 (GL/UL/LL): affordable candidates only (effective dust ≤ lgAffordable).
        // Pass 2 (GL/UL/LL): full eligible pool as fallback when no affordable candidate exists.
        const lgAffordable = (DUST_THRESHOLDS[lg] || DUST_THRESHOLDS.G).affordable;
        const eligiblePool = lg !== 'M' ? (() => {
          const aff = eligible.filter(p =>
            effectiveDust(p) <= lgAffordable && (p[rankField]||0) >= RULES.keepThreshold
          );
          return aff.length ? aff : eligible;
        })() : eligible;

        const best = eligiblePool[0];
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
          // Pre-evo battles as itself in lower league (evolvedNameG blank → lowerEvo = its own name).
          // GL-as-Skwovet and UL-as-Greedent are separate commitments — surface both, let user choose.
          if (lowerEvo === best.name) return false;
          const lowerRank = Math.round(best['rankPct'+ll]||0);
          const thisRank = Math.round(bestRank);
          return lowerRank >= 100 && thisRank < 100; // protect if lower is 100, this isn't
        });

        let actualBest = best;
        if (shouldProtect && eligiblePool.length > 1) {
          // Try next best that doesn't have the same protection issue
          const alternative = eligiblePool.slice(1).find(p => {
            const altShouldProtect = lowerLeagues.some(ll => {
              const lowerEvo = ll==='L'?(p.evolvedNameL||p.name)
                :ll==='G'?(p.evolvedNameG||p.name):(p.evolvedNameU||p.name);
              if (lowerEvo === stageName) return false;
              if (lowerEvo === p.name) return false; // same rule as above
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
        // ML rank = ivAvg; keep original 70% floor for ML to avoid surfacing every Pokémon
        const floorForLg = lg === 'M' ? 70 : 0;
        if (bestRank2 > floorForLg) {
          // Skip tentative if best2 has a better rank in a lower-priority league.
          // Prevents one-slot exclusion from trapping a Pokémon in a tentative higher league
          // when its primary league is lower in priority (e.g. shadow pre-evo with tiny UL rank but 99%+ GL).
          if (!isConfirmed) {
            const processingOrder = ['M','U','G','L'];
            const lgIndex = processingOrder.indexOf(lg);
            const hasStrongerLaterLeague = processingOrder.slice(lgIndex + 1)
              .some(l => (best2['rankPct'+l]||0) > bestRank2);
            if (hasStrongerLaterLeague) return;
          }
          if (!best2.slots.includes(lg)) best2.slots.push(lg);
          best2.hasBattleSlot = true; // mark: won a main-pass battle slot (one-slot rule)
          best2.targetEvo = stageName !== best2.name ? stageName : '';
          best2.slotConfirmed = isConfirmed || !!best2.slotConfirmed; // purify loop may have already confirmed
          if (!isConfirmed) best2.slots.push(lg+'_tentative');
          const eDustCheck = effectiveDust(best2);
          // Use league-specific evo key so a stage final for Little isn't blocked by a Great evo
          const leagueEvoKey = lg==='L'?'evolvedNameL':lg==='G'?'evolvedNameG':'evolvedNameU';
          const isFinalEvoStage = !members.some(m =>
            m.name === stageName && m[leagueEvoKey] && m[leagueEvoKey] !== stageName
          );
          // Dual recommendation: expensive winner + affordable backup (Pass 2 only)
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
              // Finding A Option 1: affordable backup is a keep-worthy cyan pick (decision set in decision block)
              affordableWinner.suggestStarCheaper = true;
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
          const bestTier = rankTier(best2);
          const cheaperExists = eligible.slice(1).some(p =>
            rankTier(p) === bestTier && effectiveDust(p) < effectiveDust(best2)
          );
          if (cheaperExists) best2.cheaperAvailable = (best2.cheaperAvailable||[]);
          // (cheaperAvailable flag is set on winner to show it could be replaced)

          // Check if 200k+ threshold — flag as tentative if over budget
          const eDust = effectiveDust(best2);
          if (eDust > 200000 && bestTier === 0) {
            best2.overBudget100 = true;
          }

          // Second runner-up: if another candidate also qualifies at 90%+
          // assign them to remaining open leagues (handled by league loop)
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
    // Dynamax: best-IV per species gets 'dynamax' slot, unless it already holds a league slot.
    // Best-without-league-slot: if best-IV holds a league slot, the best remaining candidate
    // without a league slot inherits the Dmax/Gmax slot (regardless of IV gap — same as shadow).
    const dmaxCandidates = {};
    members.filter(p => p.isDynamax).forEach(p => {
      if (!dmaxCandidates[p.name]) dmaxCandidates[p.name] = [];
      dmaxCandidates[p.name].push(p);
    });
    Object.values(dmaxCandidates).forEach(cands => {
      cands.sort((a, b) => (b.ivAvg||0) - (a.ivAvg||0) || (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));
      const best = cands[0]; if (!best) return;
      const target = best.slots.some(s => RULES.leagues.includes(s))
        ? cands.find(p => !p.slots.some(s => RULES.leagues.includes(s)))
        : best;
      if (target && !target.slots.includes('dynamax')) target.slots.push('dynamax');
    });
    // Gigantamax: same best-without-league-slot logic
    const gmaxCandidates = {};
    members.filter(p => p.isGigantamax).forEach(p => {
      if (!gmaxCandidates[p.name]) gmaxCandidates[p.name] = [];
      gmaxCandidates[p.name].push(p);
    });
    Object.values(gmaxCandidates).forEach(cands => {
      cands.sort((a, b) => (b.ivAvg||0) - (a.ivAvg||0) || (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));
      const best = cands[0]; if (!best) return;
      const target = best.slots.some(s => RULES.leagues.includes(s))
        ? cands.find(p => !p.slots.some(s => RULES.leagues.includes(s)))
        : best;
      if (target && !target.slots.includes('gigantamax')) target.slots.push('gigantamax');
    });
    // All species: best-IV per species without a confirmed league slot → 'best_overall' slot
    // Non-legendaries: must have a qualifying rank (≥90%) in some league AND the species must have
    // no confirmed keeper already in the family (prevents same-species losers from piling up).
    {
      const speciesWithConfirmedKeeper = new Set(
        members.filter(p =>
          RULES.leagues.some(s => p.slots.includes(s) && (p['rankPct'+s]||0) >= RULES.keepThreshold)
        ).map(p => p.name)
      );
      const bestOverallBySpecies = {};
      members.filter(p => {
        if (p.isDynamax || p.isGigantamax) return false;
        if (p.slots.some(s => RULES.leagues.includes(s) && (p['rankPct'+s]||0) >= RULES.keepThreshold)) return false;
        if (!isLegendary && !RULES.leagues.some(l => (p[`rankPct${l}`]||0) >= RULES.keepThreshold)) return false;
        if (!isLegendary && speciesWithConfirmedKeeper.has(p.name)) return false;
        return true;
      }).forEach(p => {
        const k = p.name;
        if (!bestOverallBySpecies[k] || (p.ivAvg||0) > (bestOverallBySpecies[k].ivAvg||0) ||
          ((p.ivAvg||0) === (bestOverallBySpecies[k].ivAvg||0) && p.isFavorite && !bestOverallBySpecies[k].isFavorite))
          bestOverallBySpecies[k] = p;
      });
      Object.values(bestOverallBySpecies).forEach(best => {
        if (!best.slots.includes('best_overall')) best.slots.push('best_overall');
      });
    }

    // Set decisions and nicknames
    members.forEach(p=>{
      // Fix dustCostBest to use the dust for the assigned league slot
      const leagueSlot = p.slots.find(s=>['L','G','U','M'].includes(s));
      if (leagueSlot === 'L' && p.dustL > 0) p.dustCostBest = p.dustL;
      else if (leagueSlot === 'G' && p.dustG > 0) p.dustCostBest = p.dustG;
      else if (leagueSlot === 'U' && p.dustU > 0) p.dustCostBest = p.dustU;
      else if (leagueSlot === 'M') p.dustCostBest = 0;
      else p.dustCostBest = p.dustMin || 0;

      const hasLeagueSlot=p.slots.some(s=>RULES.leagues.includes(s)||s.endsWith('_affordable'))&&!(isLegendary&&p.slots.includes('best_overall')&&!p.slotConfirmed);
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
        // Prefer capped league (Ⓤ/Ⓖ/Ⓛ) over Master (Ⓡ); when multiple capped leagues, pick highest rank
        const cappedSlots = lgSlots.filter(s => s !== 'M');
        const nickSlot = cappedSlots.length > 0
          ? cappedSlots.sort((a, b) => (p['rankPct'+b]||0) - (p['rankPct'+a]||0))[0]
          : (['M','U','G','L'].find(s => lgSlots.includes(s)) || lgSlots[0]);
        if(nickSlot==='M') p.targetEvo=p.evolvedNameU||p.evolvedNameG||'';
        else if(nickSlot==='G') p.targetEvo=p.evolvedNameG||'';
        else if(nickSlot==='U') p.targetEvo=p.evolvedNameU||'';
        else if(nickSlot==='L') p.targetEvo=p.evolvedNameL||'';
        // Finding A Option 1: affordable backup (X_affordable slot only, no confirmed league slot) is
        // a keep-worthy cyan pick — circled-letter nick + cyan star, not review/holding format.
        const hasOnlyAffordableSlot = p.isAffordableWinner && !p.slots.some(s => RULES.leagues.includes(s));
        if (p.slotConfirmed || hasOnlyAffordableSlot) {
          p.decision='keep';
          p.reason = hasOnlyAffordableSlot
            ? 'Affordable backup for '+RULES.leagueNames[nickSlot]
            : 'Best '+lgNames.join(' + ');
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
      } else if (p.slots.includes('dynamax')) {
        p.decision='keep'; p.reason='Best Dynamax — keep';
        p.nickname=buildNickname(p,'dynamax');
      } else if (p.slots.includes('gigantamax')) {
        p.decision='keep'; p.reason='Best Gigantamax — keep';
        p.nickname=buildNickname(p,'gigantamax');
      } else if (p.slots.includes('best_overall')) {
        p.decision='keep'; p.reason=isLegendary?'Best Legendary — keep':'Best in family — keep';
        p.nickname=buildNickname(p,'lucky');
      } else if (p.slots.includes('shadow')) {
        p.decision='keep'; p.reason='Best shadow — keep for raids/Master League';
        p.nickname=buildNickname(p,'lucky'); // NameⓇIV format — same as Lucky no-league
      } else if (p.slots.includes('purified')) {
        p.decision='keep'; p.reason='Best purified';
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

      p.suggestStarExpensive = p.isExpensiveWinner === true;
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
            p.slots.includes('purified') ||
            p.slots.includes('dynamax') ||
            p.slots.includes('gigantamax') ||
            p.slots.includes('best_overall')
          )) ||
          isProtectedBest ||
          (p.isLucky) ||
          (p.isCostumed)
        )
      );
      const cyanLeagues = p.cheaperAlternativeLeagues || [];
      const leagueSlots = p.slots.filter(s => RULES.leagues.includes(s));
      p.isCheaperAlternative = cyanLeagues.some(cl => leagueSlots.includes(cl));
      // Finding A Option 1: affordable backup gets cyan only when it holds NO real league slot
      // (avoids regression when nextBest promotion gives it a real slot later)
      const isAffordableOnly1 = p.isAffordableWinner && !leagueSlots.length;
      p.suggestStarCheaper = (p.isCheaperAlternative || isAffordableOnly1) && !p.suggestStarExpensive;

      // Force keep for special overrides. Shinies never get red star (pokemonStarRank guards it).
      // Duplicate shinies are resolved in the post-processing pass below.
      if (p.isShiny) p.decision = 'keep'; // suggestStar left as computed — shinies earn stars normally
      // Hundos always keep regardless of slot routing
      if (p.atkIV === 15 && p.defIV === 15 && p.staIV === 15) {
        p.decision = 'keep';
        if (!p.slots.includes('hundo')) p.slots.push('hundo');
        p.suggestStar = true;
      }

      // starType: used by render.js and tests.
      // Shiny pokemon all get suggestStar=true (forced above), but only show ✨ when
      // the star reason is shiny-only (no real PvP/lucky/nundo slot alongside it).
      const hasRealSlot = p.slots.some(s => RULES.leagues.includes(s))
        || p.slots.includes('lucky') || p.slots.includes('nundo');
      if (p.suggestStar && p.isFavorite && (!p.isShiny || hasRealSlot)) p.starType = 'gold';
      else if (p.suggestStar && !p.isFavorite && !p.suggestStarCheaper && (!p.isShiny || hasRealSlot)) p.starType = 'green';
      else if (p.suggestStarExpensive && p.isFavorite) p.starType = 'gold';
      else if (p.suggestStarExpensive && !p.isFavorite) p.starType = 'blue';
      else if (p.suggestStarCheaper && !p.isFavorite) p.starType = 'cyan';
      else if (p.isShiny) p.starType = 'shiny'; // shiny with no real PvP slot reason
      else if (!p.suggestStar && !p.suggestStarExpensive && !p.suggestStarCheaper && p.isFavorite) p.starType = 'red';
      else if (p.evolutionUnknown && Math.max(p.rankPctG||0,p.rankPctU||0,p.rankPctL||0,p.rankPctM||0) >= 90) p.starType = 'swirl';
      else p.starType = 'none';
      // Visibility star: tradeable Dmax/Gmax/Legendary dupes — display-only, no impact on counts
      if (p.decision === 'trade' && (p.isDynamax || p.isGigantamax || isLegendary)) {
        p.starType = 'visibility';
      }
      // Gold + expensive winner: action already complete in GO — $ dust warning is redundant.
      if (p.starType === 'gold' && p.isExpensiveWinner) {
        p.nickname = p.nickname.replace(/\$+/, '');
      }
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
        const vk = p.isShadow ? '|shadow' : p.isPurified ? '|purified' : p.isLucky ? '|lucky' : '';
        slotWinners[lg+'|'+evo+vk] = (slotWinners[lg+'|'+evo+vk]||0) + 1;
      });
    });

    const releasedSlotPokemon = new Set();
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

      const keepSlot = priority.find(s => leagueSlots.includes(s)); // highest-priority league
      const keepEvo = slotEvo(keepSlot);

      // Different evo stage: must release (can't physically be in two evo stages at once).
      // Use the highest-priority CONFIRMED slot as the anchor for diffEvo resolution.
      // If keepSlot is tentative but a lower-priority slot is confirmed with a different evo target,
      // the confirmed slot wins — don't release it just because it has lower league priority.
      const confirmedLeagueSlots = leagueSlots.filter(s => (p['rankPct'+s]||0) >= RULES.keepThreshold);
      const diffEvoAnchor = confirmedLeagueSlots.length > 0
        ? priority.find(s => confirmedLeagueSlots.includes(s))
        : keepSlot;
      const diffEvoAnchorEvo = slotEvo(diffEvoAnchor);
      const diffEvoConflicts = leagueSlots.filter(s => s !== diffEvoAnchor && slotEvo(s) !== diffEvoAnchorEvo);

      // Same evo stage: keep the slot with the highest rank; release the rest
      // (Pokémon should specialise in the league where it has the best rank)
      // Ties (e.g. 100%/100%) are kept — nothing is released
      const sameEvoSlots = leagueSlots.filter(s => slotEvo(s) === keepEvo);
      const bestRankedSlot = sameEvoSlots.reduce((best, s) => {
        const rb = p['rankPct'+best]||0, rs = p['rankPct'+s]||0;
        return rs > rb ? s : best;
      }, keepSlot);
      // Release all same-evo slots except the highest-ranked one.
      // Under one-slot-per-Pokémon, this should be unreachable from the main assignment pass,
      // but acts as a safety net (e.g. nextBest assigning a second slot).
      const sameEvoConflicts = sameEvoSlots.filter(s => s !== bestRankedSlot);

      const conflicting = [...diffEvoConflicts, ...sameEvoConflicts];
      if (!conflicting.length) return;

      conflicting.forEach(s => {
        const evoTarget = slotEvo(s);
        p.slots = p.slots.filter(x => x !== s);
        p.slotConfirmed = p.slots.some(x =>
          RULES.leagues.includes(x) && (p['rankPct'+x]||0) >= RULES.keepThreshold
        );
        if (p.expensiveForLeague === s) p.isExpensiveWinner = false;
        releasedSlotPokemon.add(p);

        // Decrement winner count for this stage
        const vk = p.isShadow ? '|shadow' : p.isPurified ? '|purified' : p.isLucky ? '|lucky' : '';
        const wk = s+'|'+evoTarget+vk;
        slotWinners[wk] = Math.max(0, (slotWinners[wk]||1) - 1);

        // Only find next best if this evo stage has NO winner left
        if ((slotWinners[wk]||0) > 0) return;

        // Find next best for this league/evoTarget
        const rf = 'rankPct'+s;
        const nextBest = members
          .filter(m => m !== p)
          .filter(m => {
            // Must match the same variant (shadow/regular/lucky/purified) as the releasing Pokémon
            const m_vk = m.isShadow ? '|shadow' : m.isPurified ? '|purified' : m.isLucky ? '|lucky' : '';
            if (m_vk !== vk) return false;
            // One slot per Pokémon: nextBest candidate must not already hold a battle slot
            if (m.hasBattleSlot) return false;
            if (!m.isPurifySlot && m.slots.some(sl => RULES.leagues.includes(sl) || sl.endsWith('_affordable'))) return false;
            // Candidate's evo target for this league must match the released slot's evo target
            const candidateEvo = s==='L'?(m.evolvedNameL||m.name)
              :s==='G'?(m.evolvedNameG||m.name)
              :s==='U'?(m.evolvedNameU||m.name)
              :(m.evolvedNameU||m.evolvedNameG||m.name);
            return candidateEvo === evoTarget;
          })
          .filter(m => {
            const d = s==='L'?m.dustL:s==='G'?m.dustG:s==='U'?m.dustU:0;
            const isFinal = !(m.evolvedNameG && m.evolvedNameG !== m.name) &&
                            !(m.evolvedNameU && m.evolvedNameU !== m.name);
            return (m[rf]||0) >= 70 && (d <= RULES.dustExcludeThreshold || isFinal || isLegendary);
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
          })
          .find(m => {
            // Skip candidate if it already holds a higher-priority slot for the same evo target
            // — it would be immediately deconflicted, leaving this slot unfilled
            const slPriority = ['M','U','G','L'];
            const myPri = slPriority.indexOf(s);
            return !m.slots.some(sl => {
              const slPri = slPriority.indexOf(sl);
              if (slPri < 0 || slPri >= myPri) return false;
              const slEvo = sl==='L'?(m.evolvedNameL||m.name)
                :sl==='G'?(m.evolvedNameG||m.name)
                :sl==='U'?(m.evolvedNameU||m.name)
                :(m.evolvedNameU||m.evolvedNameG||m.name);
              return slEvo === evoTarget && (m['rankPct'+sl]||0) >= RULES.keepThreshold;
            });
          });

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
        const vk = p.isShadow ? '|shadow' : p.isPurified ? '|purified' : p.isLucky ? '|lucky' : '';
        const key = lg+'|'+evo+vk;
        if (!byEvo[key]) byEvo[key] = [];
        byEvo[key].push(p);
      });
      // If more than one winner for same stage, remove the weaker ones
      Object.values(byEvo).forEach(group => {
        if (group.length <= 1) return;
        group.sort((a, b) => {
          const rawA = a[rf]||0, rawB = b[rf]||0;
          const ra = Math.round(rawA), rb = Math.round(rawB);
          if (ra !== rb) return rb - ra;
          if (Math.abs(rawA - rawB) > 0.01) return rawB - rawA;
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
          p.slotConfirmed = p.slots.some(s =>
            RULES.leagues.includes(s) && (p['rankPct'+s]||0) >= RULES.keepThreshold
          );
        });
      });
    });
    // ─────────────────────────────────────────────────────────────────────────

    // Conflict resolution may assign new slots (via nextBest) to Pokémon whose
    // decision was already set to trade/review when they had no slot. Re-pass
    // promotes them to keep with correct nick and suggestStar.
    members.forEach(p => {
      const leagueSlots = p.slots.filter(s => RULES.leagues.includes(s));
      if (!leagueSlots.length) return;
      if (!p.slotConfirmed) return; // below 90% — leave as review
      // Run re-pass for: newly promoted nextBest pokemon (decision !== 'keep')
      //                  OR pokemon that had a slot released by deconfliction
      if (p.decision === 'keep' && !releasedSlotPokemon.has(p)) return;
      const cappedSlots = leagueSlots.filter(s => s !== 'M');
      const nickSlot = cappedSlots.length
        ? cappedSlots.sort((a, b) => (p['rankPct'+b]||0) - (p['rankPct'+a]||0))[0]
        : leagueSlots[0];
      const lgNames = leagueSlots.map(s => RULES.leagueNames[s]);
      p.decision = 'keep';
      p.reason = 'Best ' + lgNames.join(' + ');
      p.nickname = buildNickname(p, nickSlot);
      if (nickSlot === 'L') p.dustCostBest = p.dustL || 0;
      else if (nickSlot === 'G') p.dustCostBest = p.dustG || 0;
      else if (nickSlot === 'U') p.dustCostBest = p.dustU || 0;
      else p.dustCostBest = 0;
      p.suggestStarExpensive = p.isExpensiveWinner === true;
      p.suggestStar = !p.suggestStarExpensive;
      // Update starType to reflect current slot state (initial pass may be stale)
      const hasRealSlot = p.slots.some(s => RULES.leagues.includes(s))
        || p.slots.includes('lucky') || p.slots.includes('nundo');
      if (p.suggestStar && p.isFavorite && (!p.isShiny || hasRealSlot)) p.starType = 'gold';
      else if (p.suggestStar && !p.isFavorite && (!p.isShiny || hasRealSlot)) p.starType = 'green';
      else if (p.suggestStarExpensive && p.isFavorite) p.starType = 'gold';
      else if (p.suggestStarExpensive && !p.isFavorite) p.starType = 'blue';
    });

    // Recompute cyan/expensive star flags — conflict resolution above may have
    // removed slots from p.slots, leaving cheaperAlternativeLeagues stale.
    members.forEach(p => {
      const cyanLeagues = (p.cheaperAlternativeLeagues || []).filter(cl =>
        p.slots.includes(cl)
      );
      p.cheaperAlternativeLeagues = cyanLeagues;
      const leagueSlots = p.slots.filter(s => RULES.leagues.includes(s));
      p.isCheaperAlternative = cyanLeagues.some(cl => leagueSlots.includes(cl));
      // Finding A Option 1: affordable backup keeps cyan only when holding no real league slot
      const isAffordableOnly2 = p.isAffordableWinner && !leagueSlots.length;
      p.suggestStarCheaper = (p.isCheaperAlternative || isAffordableOnly2) && !p.suggestStarExpensive;
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

    // Shiny duplicate reconciliation: keeper = highest ivAvg (prefer isFavorite if tied),
    // all others → trade. Runs when overrides are pre-loaded (returning session).
    const shinyBySpecies = {};
    members.filter(p => p.isShiny).forEach(p => {
      (shinyBySpecies[p.name] = shinyBySpecies[p.name] || []).push(p);
    });
    Object.values(shinyBySpecies).forEach(shinies => {
      if (shinies.length <= 1) return;
      const keeper = shinies.reduce((best, p) => {
        if ((p.ivAvg||0) > (best.ivAvg||0)) return p;
        if ((p.ivAvg||0) === (best.ivAvg||0) && p.isFavorite && !best.isFavorite) return p;
        return best;
      });
      shinies.forEach(p => {
        if (p === keeper) return;
        p.decision = 'trade';
        p.reason = `Shiny duplicate — ${keeper.name} ${Math.round(keeper.ivAvg||0)}% IV is keeper`;
      });
    });

    // ML placeholder pass: if the family has no ML slot at all, surface the highest-ivAvg
    // member with no league slot as a grey-starred review placeholder. Gives Mariellen
    // a Master League candidate to star before culling everything else.
    // Legendaries/Mythicals/UBs skip ML entirely (handled by best_overall) — no placeholder.
    if (!isLegendary) {
      const hasConfirmedMlKeeper = members.some(m => m.slots.includes('M') && m.slotConfirmed);
      const candidates = members.filter(m =>
        !m.slots.some(s => RULES.leagues.includes(s) || s.endsWith('_affordable')) &&
        m.decision !== 'keep' && m.decision !== 'protected'
      );
      if (!hasConfirmedMlKeeper) {
        if (candidates.length > 0) {
          const best = candidates.reduce((a, b) => (b.ivAvg||0) > (a.ivAvg||0) ? b : a);
          best.slots.push('M');
          best.isMlPlaceholder = true;
          best.decision = 'review';
          best.reason = 'ML placeholder — best available (no confirmed ML keeper in family)';
          best.nickname = buildNickname(best, 'M_placeholder');
          best.starType = 'grey';
        }
      }
    }
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
      completeness: computeFamilyCompleteness(members),
    };
  }).sort((a,b)=>a.primaryName.localeCompare(b.primaryName));

  return {pokemon:parsed, families:famList};
}

// ═══════════════════════════════════════════════
// FAMILY COMPLETENESS
// Tier: 'gold' (all round to 100%) | 'green' (all ≥95%) | 'blue' (all ≥90%) | 'none'
// Icons: bonus markers — don't affect tier.
// ═══════════════════════════════════════════════
function computeFamilyCompleteness(members) {
  const LEAGUES = ['L', 'G', 'U', 'M'];
  const eligibleLeagues = LEAGUES.filter(lg => members.some(p => (p['rankPct'+lg]||0) > 0));
  if (!eligibleLeagues.length) return { tier: 'none' };

  const confirmedKeepers = members.filter(p =>
    p.decision === 'keep' && p.slotConfirmed && LEAGUES.some(lg => p.slots.includes(lg))
  );
  const allCovered = eligibleLeagues.every(lg => confirmedKeepers.some(p => p.slots.includes(lg)));
  if (!allCovered) return { tier: 'none' };

  const ranks = confirmedKeepers.flatMap(p =>
    eligibleLeagues.filter(lg => p.slots.includes(lg)).map(lg => p['rankPct'+lg] || 0)
  );
  if (!ranks.length) return { tier: 'none' };

  const allHundo = ranks.every(r => Math.round(r) >= 100);
  const allGreen = ranks.every(r => r >= 95);
  const tier = allHundo ? 'gold' : allGreen ? 'green' : 'blue';

  return {
    tier,
    hasShinyKeep:   members.some(p => p.isShiny      && p.decision === 'keep'),
    hasLuckyKeep:   members.some(p => p.isLucky      && p.decision === 'keep'),
    hasDynamaxKeep: members.some(p => p.isDynamax    && p.decision === 'keep'),
    hasGmaxKeep:    members.some(p => p.isGigantamax && p.decision === 'keep'),
  };
}

// ═══════════════════════════════════════════════
// MERGE CANDIDATES
// Find same-IV pairs at different CP where ≥1 has no catch date —
// likely the same individual scanned before and after a power-up.
// ═══════════════════════════════════════════════
function findMergeCandidates(families) {
  const candidates = [];

  families.forEach(fam => {
    const byIV = {};
    fam.members.forEach(p => {
      const key = `${p.atkIV}/${p.defIV}/${p.staIV}`;
      if (!byIV[key]) byIV[key] = [];
      byIV[key].push(p);
    });

    Object.values(byIV).forEach(group => {
      if (group.length < 2) return;
      const cps = new Set(group.map(p => p.cp));
      if (cps.size < 2) return; // identical CP = genuine duplicates, not merge candidates
      // Candidate if any member lacks a date, OR if two members share a date (same pokemon powered up)
      const missingDate = group.some(p => !p.catchDate);
      const dates = group.map(p => p.catchDate).filter(Boolean);
      const hasDuplicateDate = new Set(dates).size < dates.length;
      if (!missingDate && !hasDuplicateDate) return;
      candidates.push({ family: fam.primaryName, members: group });
    });
  });

  return candidates.sort((a, b) => a.family.localeCompare(b.family));
}