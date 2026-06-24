// ═══════════════════════════════════════════════
// PokéVault — App Controller
// UI rendering, filters, sorting, event handlers
// Depends on: config.js, supabase.js, analyse.js, render.js
// ═══════════════════════════════════════════════
'use strict';

// Capture deep link hash immediately — applyFilters() → updateHash() overwrites
// window.location.hash before applyHashState() can read it on first cloud load.
let initialHash = window.location.hash;

// ═══════════════════════════════════════════════
// GA4 EVENT TRACKING
// Fire-and-forget telemetry. Must NEVER break the app, NEVER leak user PII.
// (ticket: ga4-event-tracking — see reviews/ga4-event-tracking-impl-summary.md)
// ═══════════════════════════════════════════════

// Hardened helper: `=== 'function'` (not `!== 'undefined'`) so a defined-but-broken
// gtag can't throw, and a try/catch so analytics never aborts a user action.
function trackEvent(name, params = {}) {
  try {
    if (typeof gtag === 'function') gtag('event', name, params);
  } catch (e) {
    // analytics must never break the app
    if (typeof console !== 'undefined') console.debug('trackEvent failed', name, e);
  }
}

// PII redaction: nicknames are free-text and frequently contain personal data.
// Send a SHAPE descriptor only — never the raw nick. Satisfies "which nick
// formats are most common" with zero PII egress.
function buildNickShape(nick) {
  const n = nick || '';
  return {
    nick_length: n.length,
    has_iv_pattern: /\d{1,2}\/\d{1,2}\/\d{1,2}/.test(n),
    has_cp: /\bcp\s*\d+/i.test(n),
  };
}

// Same PII reasoning for search terms — users search by personal labels.
function buildSearchShape(term) {
  const t = term || '';
  return { term_length: t.length, is_numeric: /^\d+$/.test(t) };
}

// Debounced search tracking — fire once, 500ms after the last keystroke,
// to avoid flooding GA4 with every character typed. Module-scoped timer is
// fine for the singleton search box.
let _searchTrackTimer;
function trackSearchDebounced(term) {
  clearTimeout(_searchTrackTimer);
  _searchTrackTimer = setTimeout(() => {
    trackEvent('search', buildSearchShape(term));
  }, 500);
}

// Dmax/Gmax filter flags (mutually exclusive)
let showDynamaxOnly = false;
let showGigantamaxOnly = false;

// Best-in-league / costly shortcut filter state (go through applyFilters so Dmax survives sort changes)
let bestLeagueOnly = false;
let costlyOnly = false;

// Moves column visibility (session only — no localStorage)
let movesColumnVisible = false;

// Load in progress — blocks CSV upload to prevent concurrent write to shared globals
let loadInProgress = false;

function setLoadInProgress(active) {
  loadInProgress = active;
  ['fileInput','csvFileInput','tryOwnInput'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.disabled=active;
  });
  const dz=document.getElementById('dropZone');
  if(dz) dz.style.pointerEvents=active?'none':'';
}

// ═══════════════════════════════════════════════
// CSV FILENAME LABEL (Feature Batch June 2026 — F3)
// Single source of truth for the header "· filename" provenance label.
// Persists to localStorage so it survives reloads / cloud auto-load. Uses
// textContent (auto-escaped) — filenames can contain HTML metacharacters.
// Call with a name to set+persist; call with null/'' to clear both.
// ═══════════════════════════════════════════════
function setCsvFilename(name){
  const el=document.getElementById('csvFilename');
  if(name){
    const capped=String(name).slice(0,120);
    try{ localStorage.setItem('pokevault_last_csv', capped); }catch(e){}
    if(el){ el.textContent=' · '+capped; el.style.display='inline'; }
  } else {
    try{ localStorage.removeItem('pokevault_last_csv'); }catch(e){}
    if(el){ el.textContent=''; el.style.display='none'; }
  }
}

// Collection Tracker modal qualifier state
let dexQualDmax    = false;
let dexQualGmax    = false;
let dexQualHundo   = false;
let dexShinyAvailOnly = false;

// ═══════════════════════════════════════════════
// STAR PRIORITY (0=gold … 6=none)
// ═══════════════════════════════════════════════
function pokemonStarRank(p) {
  if (p.suggestStar && p.isFavorite) return 0;
  if (p.suggestStar && !p.isFavorite) return 1;
  if (p.suggestStarCheaper) return 2;
  if (p.suggestStarExpensive) return 3;
  if (p.isMlPlaceholder) return 3.5;
  if (!p.isShiny && p.isFavorite && !p.suggestStar && !p.suggestStarExpensive && !p.suggestStarCheaper && !p.isMlPlaceholder) return 4;
  if (p.starType === 'visibility') return 5;
  return 6;
}

// Returns the shiny keeper for a group (highest ivAvg, prefer isFavorite if tied).
// Returns null if no shinies in group.
function shinyKeeperOf(group) {
  const shinies = group.filter(p => p.isShiny);
  if (!shinies.length) return null;
  return shinies.reduce((best, p) => {
    if ((p.ivAvg||0) > (best.ivAvg||0)) return p;
    if ((p.ivAvg||0) === (best.ivAvg||0) && p.isFavorite && !best.isFavorite) return p;
    return best;
  });
}

// Identifies duplicate shinies in allPokemon and marks them trade.
// Called after overrides are applied (fresh session) or after analyse() (returning session).
function reconcileShinyDecisions(pokemon) {
  const shinyBySpecies = {};
  pokemon.filter(p => p.isShiny).forEach(p => {
    (shinyBySpecies[p.name] = shinyBySpecies[p.name] || []).push(p);
  });
  Object.values(shinyBySpecies).forEach(shinies => {
    if (shinies.length <= 1) return;
    const keeper = shinyKeeperOf(shinies);
    shinies.forEach(p => {
      if (p === keeper) return;
      p.decision = 'trade';
      p.reason = `Shiny duplicate — ${keeper.name} ${Math.round(keeper.ivAvg||0)}% IV is keeper`;
    });
  });
}

// ═══════════════════════════════════════════════
// SCAN-DATE SORT (ticket: sort-scan-date)
// Sort families by their most-recently-scanned member (newest first).
// Scan date is a per-Pokémon attribute, so the family key is the MAX
// (newest) member scan date. Missing/unparseable dates always sort to the
// BOTTOM — for BOTH directions (per Opus review: "sort to bottom" is the
// hard rule; do not let missing entries float to the top in ascending mode).
// ═══════════════════════════════════════════════

// Per-Pokémon scan timestamp (ms) or null when missing/unparseable.
// Uses parsePokegenieDate (defined later, hoisted) so chronological — not
// lexical — comparison is guaranteed across Pokégenie's date formats.
function parseScanDateMs(p) {
  const raw = p && p.scanDate;
  if (!raw || !String(raw).trim()) return null;
  const iso = parsePokegenieDate(raw); // '' on failure, else 'YYYY-MM-DDTHH:MM'
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

// Family-level key = newest member scan date, or null if none parse.
// reduce(...Math.max) avoids spread call-stack limits on large families.
function familyScanKey(fam) {
  const times = (fam.members || [])
    .map(parseScanDateMs)
    .filter(t => t !== null);
  return times.length ? times.reduce((a, b) => Math.max(a, b), -Infinity) : null;
}

// Comparator for Array.sort on the families array.
// dir: 'desc' = newest first (primary brief option), 'asc' = oldest first.
// Missing-date families are always pinned last regardless of direction.
function compareFamiliesByScanDate(a, b, dir) {
  const ka = familyScanKey(a), kb = familyScanKey(b);
  const aMissing = ka === null, bMissing = kb === null;
  if (aMissing && bMissing) return a.primaryName.localeCompare(b.primaryName);
  if (aMissing) return 1;   // a to bottom
  if (bMissing) return -1;  // b to bottom
  if (ka !== kb) return dir === 'asc' ? ka - kb : kb - ka;
  return a.primaryName.localeCompare(b.primaryName); // stable tie-break
}

// ═══════════════════════════════════════════════
// PER-FAMILY SORTING
// ═══════════════════════════════════════════════
function sortFamilyBy(thEl,col){
  const card=thEl.closest('.family-card');
  if(!card) return;
  const famKey=card.id.replace(/^fam-/,'');
  const cur=familySortState[famKey]||{col:null,dir:1};
  const dir=cur.col===col?-cur.dir:-1;
  familySortState[famKey]={col,dir};

  const fam=families.find(f=>f.key===famKey);
  if(!fam) return;

  fam.members.sort((a,b)=>{
    let va,vb;
    if(col==='ivAvg'){va=a.ivAvg||0;vb=b.ivAvg||0;}
    else if(col==='rankPctL'){va=a.rankPctL||0;vb=b.rankPctL||0;}
    else if(col==='rankPctG'){va=a.rankPctG||0;vb=b.rankPctG||0;}
    else if(col==='rankPctU'){va=a.rankPctU||0;vb=b.rankPctU||0;}
    else if(col==='rankPctM'){va=a.rankPctM||0;vb=b.rankPctM||0;}
    else if(col==='dust'){va=a.dustCostBest||999999;vb=b.dustCostBest||999999;}
    else if(col==='cp'){va=a.cp||0;vb=b.cp||0;}
    else if(col==='catchDate'){va=a.catchDateMs||0;vb=b.catchDateMs||0;}
    else if(col==='nick'){va=(a.nickname||'').toLowerCase();vb=(b.nickname||'').toLowerCase();}
    else if(col==='star'){
      va=pokemonStarRank(a);vb=pokemonStarRank(b);
    }
    else if(col==='name'){va=a.name.toLowerCase();vb=b.name.toLowerCase();}
    else if(col==='decision'){const o={keep:0,protected:1,review:2,trade:3};va=o[a.decision]||3;vb=o[b.decision]||3;}
    else{va=0;vb=0;}
    return typeof va==='string'?va.localeCompare(vb)*dir:(va-vb)*dir;
  });

  // Update header indicators
  card.querySelectorAll('th[data-col]').forEach(th=>{
    th.classList.remove('sort-asc','sort-desc');
    if(th.dataset.col===col) th.classList.add(dir===1?'sort-asc':'sort-desc');
  });

  // Render only the rows the active filters leave visible — a column re-sort must
  // not re-reveal rows hidden by a league / Dmax / Gmax / search / practical filter
  // (#23). fam.members keeps the new sort order; we just drop the filtered-out rows.
  const tbody=card.querySelector('tbody');
  if(tbody) tbody.innerHTML=fam.members.filter(p=>isMemberVisible(p,fam)).map(p=>buildRow(p)).join('');
}

// ═══════════════════════════════════════════════
// HIDE ROW
// ═══════════════════════════════════════════════
function hideRow(idx){
  const p=allPokemon.find(x=>x.idx===idx);
  if(!p) return;
  p.hidden=true;
  const tr=document.querySelector(`tr[data-idx="${idx}"]`);
  if(tr) tr.classList.add('row-hidden');
  // Show "show hidden" button in this family
  const card=tr?.closest('.family-card');
  if(card){
    let wrap=card.querySelector('.show-hidden-wrap');
    if(!wrap){
      wrap=document.createElement('div');
      wrap.className='show-hidden-wrap';
      card.querySelector('.family-body').appendChild(wrap);
    }
    const hiddenCount=families.find(f=>f.key===card.id.replace(/^fam-/,''))?.members.filter(p=>p.hidden).length||0;
    wrap.innerHTML=`<button class="show-hidden-btn" onclick="showHidden('${card.id}')">Show ${hiddenCount} hidden row${hiddenCount!==1?'s':''}</button>`;
  }
}

function showHidden(cardId){
  const card=document.getElementById(cardId);
  if(!card) return;
  const famKey=cardId.replace(/^fam-/,'');
  const fam=families.find(f=>f.key===famKey);
  if(!fam) return;
  fam.members.forEach(p=>p.hidden=false);
  const tbody=card.querySelector('tbody');
  if(tbody) tbody.innerHTML=fam.members.map(p=>buildRow(p)).join('');
  const wrap=card.querySelector('.show-hidden-wrap');
  if(wrap) wrap.remove();
}

// ═══════════════════════════════════════════════
// RENDER FAMILY
// ═══════════════════════════════════════════════
function buildGoSearchStr(primaryName, members) {
  const famGenders=[...new Set(members.map(p=>p.gender).filter(Boolean))];
  const famForms=[...new Set(members.map(p=>p.form).filter(Boolean))];
  const famFormOverride=members.find(p=>p.vivillonPattern&&p.vivillonPattern!=='Unknown');
  const formToGoSearch={
    'Alola':'alola','Galar':'galar','Hisui':'hisui','Paldea':'paldea',
    'Male':'male','Female':'female',
    'Attack':'attack','Defense':'defense','Speed':'speed',
    'Plant':'grass','Sandy':'ground','Trash':'steel',
    'Midnight':'midnight','Dusk':'dusk','Hero':'hero',
    'Aria':'aria','Land':'land','Sky':'sky','Roaming':'roaming',
  };
  const parts=[primaryName];
  if(famGenders.length===1) parts.push(famGenders[0]==='♂'?'male':'female');
  if(famFormOverride&&FORM_SEARCH&&FORM_SEARCH[famFormOverride.vivillonPattern]){
    parts.push(FORM_SEARCH[famFormOverride.vivillonPattern]);
  } else if(famForms.length===1){
    const form=famForms[0]||'Normal';
    if(form==='Normal'||form===''){
      const knownVariants=['alola','galar','hisui','paldea'];
      knownVariants.filter(v=>allPokemon.some(p=>p.name===primaryName&&(formToGoSearch[p.form]||'')===v))
        .forEach(v=>parts.push('!'+v));
    } else {
      const mapped=formToGoSearch[form];
      if(mapped) parts.push(mapped);
    }
  }
  return parts.join('&');
}

function buildFamilySearchStr(members) {
  const formToGoSearch={
    'Alola':'alola','Galar':'galar','Hisui':'hisui','Paldea':'paldea',
    'Male':'male','Female':'female',
    'Attack':'attack','Defense':'defense','Speed':'speed',
    'Plant':'grass','Sandy':'ground','Trash':'steel',
    'Midnight':'midnight','Dusk':'dusk','Hero':'hero',
    'Aria':'aria','Land':'land','Sky':'sky','Roaming':'roaming',
  };
  const seen=new Set();
  const parts=[];
  members.forEach(p=>{
    const form=p.form||'';
    const key=p.name+'|'+form;
    if(seen.has(key)) return;
    seen.add(key);
    const sp=[p.name.toLowerCase()];
    // Gender: if all members of this name+form share a gender, append it
    const nameMembers=members.filter(m=>m.name===p.name&&(m.form||'')=== form);
    const genders=[...new Set(nameMembers.map(m=>m.gender).filter(Boolean))];
    if(genders.length===1) sp.push(genders[0]==='♂'?'male':'female');
    // Form
    const formOverride=nameMembers.find(m=>m.vivillonPattern&&m.vivillonPattern!=='Unknown');
    if(formOverride&&FORM_SEARCH&&FORM_SEARCH[formOverride.vivillonPattern]){
      sp.push(FORM_SEARCH[formOverride.vivillonPattern]);
    } else if(form&&form!=='Normal'){
      const mapped=formToGoSearch[form];
      if(mapped) sp.push(mapped);
    }
    parts.push(sp.join('&'));
  });
  return parts.join(',')+'&!variant';
}

function renderFamily(fam,isOpen){
  const {key,members,primaryName}=fam;
  const goldCount=members.filter(p=>p.isFavorite&&p.suggestStar).length;
  const luckyCount=members.filter(p=>p.isLucky).length;
  const binCount=members.filter(p=>!p.isFavorite&&p.decision!=='keep').length;
  const isEevee=members.some(p=>p.name==='Eevee');
  const eeveeTip=isEevee?`<div class="eevee-tip">💡 Eevee family: best evolutions for Great = Umbreon / Sylveon, Ultra = Glaceon / Espeon. Check existing eeveelutions below.</div>`:'';

  const {tier:cTier='none',hasShinyKeep,hasLuckyKeep,hasDynamaxKeep,hasGmaxKeep}=fam.completeness||{};
  const headerClass='family-header'+(cTier&&cTier!=='none'?' fam-complete-'+cTier:'');
  const completeIcons=[hasShinyKeep?'✨':'',hasLuckyKeep?'🍀':'',hasDynamaxKeep?'Ⓓ':'',hasGmaxKeep?'Ⓧ':''].filter(Boolean).join(' ');

  const famForms=[...new Set(members.map(p=>p.form).filter(x=>x&&x!=='Normal'))];
  const famFormStr=famForms.length===1?`<span style="color:var(--cyan);font-size:11px">${famForms[0]}</span>`:'';
  const goSearchStr=buildGoSearchStr(primaryName,members);
  const FAM_STANDALONE=new Set(['Kleavor']);
  const ownedNames=members.map(p=>p.name);
  const csvEvoNames=members.flatMap(p=>[p.evolvedNameG,p.evolvedNameU,p.evolvedNameL].filter(Boolean));
  const validEvoNames=members.flatMap(p=>(VALID_EVOLUTIONS&&VALID_EVOLUTIONS[p.name])||[]);
  const evoTargetNames=[...new Set([...csvEvoNames,...validEvoNames])].filter(n=>!FAM_STANDALONE.has(n));
  const dbFamily=typeof getFullFamily==='function'?getFullFamily(primaryName):null;
  const famAllNames=dbFamily?[...new Set([...ownedNames,...dbFamily])]:[...new Set([...ownedNames,...evoTargetNames])];
  const REGIONAL_TAGS=['Alola','Galar','Hisui','Paldea'];
  const famRegionalForm=members[0]?.form||'';
  const isRegionalFamily=REGIONAL_TAGS.includes(famRegionalForm);
  let familySearchStr;
  if(isRegionalFamily){
    familySearchStr=famAllNames.join(',')+'&'+famRegionalForm.toLowerCase();
  }else{
    const exclusions=REGIONAL_TAGS.filter(tag=>allPokemon.some(p=>famAllNames.includes(p.name)&&p.form===tag));
    familySearchStr=famAllNames.join(',')+(exclusions.length?'&!'+exclusions.map(e=>e.toLowerCase()).join('&!'):'');
  }
  const goSearchEsc=goSearchStr.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
  const famSearchEsc=familySearchStr.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
  const nameEsc=primaryName.replace(/"/g,'&quot;');
  // F1/F2: bulk GO search strings — all keepers (🔍⭐) and all merge candidates (🔍🔀).
  const _starKeepers=familyStarKeepers(members);
  const _mergeCands=familyMergeCandidates(members);
  const _starBulkEsc=buildBulkCpSearch(_starKeepers).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
  const _mergeBulkEsc=buildBulkCpSearch(_mergeCands).replace(/&/g,'&amp;').replace(/"/g,'&quot;');

  const leagueDots=['L','G','U','M'].map(lg=>{
    const col=lg==='L'?'var(--little)':lg==='G'?'var(--great)':lg==='U'?'var(--ultra)':'var(--master)';
    const has=members.some(p=>
      p.decision==='keep'&&
      p.slots.some(s=>s===lg||s===lg+'_affordable'));
    return `<span style="color:${has?col:'var(--dim)'}">${has?'●':'○'}</span>`;
  }).join('');

  const sorted=[...members].filter(p=>!(practicalMode&&p.isExpensiveWinner)).sort((a,b)=>pokemonStarRank(a)-pokemonStarRank(b));
  const rows=sorted.map(p=>buildRow(p)).join('');

  const thead=`<thead><tr>
    <th data-col="star" onclick="sortFamilyBy(this,'star')">&#9733;</th>
    <th data-col="name" onclick="sortFamilyBy(this,'name')">Pok&#233;mon</th>
    <th data-col="cp" onclick="sortFamilyBy(this,'cp')">CP</th>
    <th data-col="nick" onclick="sortFamilyBy(this,'nick')">Suggested Nick</th>
    <th data-col="ivAvg" onclick="sortFamilyBy(this,'ivAvg')">IV%</th>
    <th data-col="rankPctL" onclick="sortFamilyBy(this,'rankPctL')" style="color:var(--little)">Little</th>
    <th data-col="rankPctG" onclick="sortFamilyBy(this,'rankPctG')" style="color:var(--great)">Great</th>
    <th data-col="rankPctU" onclick="sortFamilyBy(this,'rankPctU')" style="color:var(--ultra)">Ultra</th>
    <th data-col="rankPctM" onclick="sortFamilyBy(this,'rankPctM')" style="color:var(--master)">Master</th>
    <th class="col-moves">Moves / TM</th>
    <th></th>
  </tr></thead>`;

  return `<div class="family-card ${isOpen?'open':''}" id="fam-${key}">
    <div class="${headerClass}" onclick="toggleFamily('fam-${key}')">
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;flex:1;min-width:0">
        <span class="fam-count ${members.length>countThreshold?'fam-count-large':''}">${primaryName}${famFormStr?' '+famFormStr:''} <span style="color:var(--dim);font-size:11px">(${members.length})</span></span>
        <button class="copy-search-btn" data-copy="${goSearchEsc}" onclick="event.stopPropagation();copyGoSearch(this.dataset.copy,this)" title="Copy GO search — this form only">🔍 Me</button>
        ${famAllNames.length>1?`<button class="copy-search-btn" data-copy="${famSearchEsc}" onclick="event.stopPropagation();copyGoSearch(this.dataset.copy,this)" title="Copy GO search — whole family">🔍 + Fam</button>`:''}
        ${_starKeepers.length?`<button class="copy-search-btn" data-copy="${_starBulkEsc}" onclick="event.stopPropagation();copyGoSearch(this.dataset.copy,this);trackEvent('bulk_search_copy',{kind:'keepers',count:${_starKeepers.length}})" title="Copy GO search — all recommended keepers (CP) — paste into GO, select all, bulk-star">🔍⭐</button>`:''}
        ${_mergeCands.length?`<button class="copy-search-btn" data-copy="${_mergeBulkEsc}" onclick="event.stopPropagation();copyGoSearch(this.dataset.copy,this);trackEvent('bulk_search_copy',{kind:'merge',count:${_mergeCands.length}})" title="Copy GO search — all merge candidates (CP)">🔍🔀</button>`:''}
        ${goldCount?`<span class="fam-badge" style="color:var(--gold)">${goldCount}★</span>`:''}
        ${luckyCount?`<span class="fam-badge" style="color:var(--gold)">${luckyCount}🍀</span>`:''}
        ${binCount?`<span class="fam-badge" style="color:var(--muted)">${binCount}🗑</span>`:''}
        ${completeIcons?`<span class="fam-badge" style="font-size:11px" title="Completeness icons">${completeIcons}</span>`:''}
      </div>
      <div style="display:flex;gap:6px;align-items:center;margin-left:auto;flex-shrink:0">
        <span class="fam-league-dots">${leagueDots}</span>
        <button class="copy-search-btn" data-fam="${nameEsc}" onclick="event.stopPropagation();openCullModal(this.dataset.fam)" title="View in Cull modal" aria-label="View ${primaryName} in Cull modal">🗑</button>
        <span class="fam-chevron">▶</span>
      </div>
    </div>
    ${eeveeTip}
    <div class="family-body">
      <table class="poke-table">${thead}<tbody>${rows}</tbody></table>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════
// SUMMARY + FILTERS
// ═══════════════════════════════════════════════
function renderSummary(pokemon){
  const t=pokemon.length, k=pokemon.filter(p=>p.decision==='keep').length,
    tr=pokemon.filter(p=>p.decision==='trade').length;
  document.getElementById('hdr-stats').innerHTML=
    `<span>Total <strong>${t.toLocaleString()}</strong></span>
     <span style="color:var(--green)">Keep <strong>${k.toLocaleString()}</strong></span>
     <span style="color:var(--red)">Trade <strong>${tr.toLocaleString()}</strong></span>`;
}

function applyFilters(){
  page=1;
  const term=searchTerm.toLowerCase();
  const incEvos=document.getElementById('evoToggle')?.checked;
  const rankMap={L:'rankPctL',G:'rankPctG',U:'rankPctU',M:'rankPctM'};

  filteredFamilies=families.filter(fam=>{
    if(term){
      const nm=fam.primaryName.toLowerCase().includes(term);
      // Check evo targets — so searching "Sylveon" finds Eevees recommended for Sylveon
      const evoMatch=fam.members.some(p=>
        (p.evolvedNameG||'').toLowerCase().includes(term)||
        (p.evolvedNameU||'').toLowerCase().includes(term)||
        (p.evolvedNameL||'').toLowerCase().includes(term));
      // Always match all member names — so searching "Smoochum" finds the Jynx family
      const memberMatch=fam.members.some(p=>p.name.toLowerCase().includes(term));
      // Exact pokédex number search: "1" matches Bulbasaur family (key="1") only, not 10/100
      const dexMatch=/^\d+$/.test(term) && fam.members.some(p=>String(p.pokeNum)===term);
      if(!nm&&!evoMatch&&!memberMatch&&!dexMatch) return false;
    }
    if(decFilter==='hundo'&&!fam.members.some(p=>p.isHundo&&(hundoMode===1||(hundoMode===2&&pokemonStarRank(p)===0)||(hundoMode===3&&pokemonStarRank(p)>=1&&pokemonStarRank(p)<=2)))) return false;
    else if(decFilter==='canEvolve'&&!fam.members.some(p=>p.canEvolve)) return false;
    else if(decFilter==='neverEvolved'&&!fam.members.some(p=>p.neverEvolved)) return false;
    else if(!['all','hundo','canEvolve','neverEvolved'].includes(decFilter)&&!fam.members.some(p=>p.decision===decFilter)) return false;
    if(showDynamaxOnly&&!fam.members.some(p=>p.isDynamax)) return false;
    if(showGigantamaxOnly&&!fam.members.some(p=>p.isGigantamax)) return false;
    if(leagueFilters.size>0){
      // Row-level: does any member qualify for ALL selected leagues
      const ok=[...leagueFilters].some(lg=>fam.members.some(p=>(p[rankMap[lg]]||0)>=RULES.keepThreshold));
      if(!ok) return false;
    }
    return true;
  });

  if(sortMode==='count'){
    filteredFamilies.sort((a,b)=>b.members.length-a.members.length);
  }else if(sortMode==='star'){
    filteredFamilies.sort((a,b)=>{
      const d=familyStarPriority(a)-familyStarPriority(b);
      return d!==0?d:a.primaryName.localeCompare(b.primaryName);
    });
  }else if(sortMode==='scanDateDesc'){
    filteredFamilies.sort((a,b)=>compareFamiliesByScanDate(a,b,'desc'));
  }else if(sortMode==='scanDateAsc'){
    filteredFamilies.sort((a,b)=>compareFamiliesByScanDate(a,b,'asc'));
  }else{
    filteredFamilies.sort((a,b)=>a.primaryName.localeCompare(b.primaryName));
  }
  if(bestLeagueOnly) filteredFamilies=filteredFamilies.filter(f=>f.members.some(p=>p.suggestStar&&!p.isFavorite));
  if(costlyOnly) filteredFamilies=filteredFamilies.filter(f=>f.members.some(p=>p.suggestStarExpensive&&!p.isFavorite));
  renderPage();
  updateHash();
}

function renderPage(){
  const total=filteredFamilies.length;
  const totalPages=Math.ceil(total/PER_PAGE);
  const pageFams=filteredFamilies.slice((page-1)*PER_PAGE,page*PER_PAGE);
  const autoOpen=filteredFamilies.length<=3;

  // When league filter active, filter rows within families too
  const activeLeagueArr=[...leagueFilters];
  const rankMap={L:'rankPctL',G:'rankPctG',U:'rankPctU',M:'rankPctM'};

  let html='';
  if(!pageFams.length){
    html=`<div style="text-align:center;padding:60px;color:var(--muted)"><div style="font-size:36px;margin-bottom:10px">🔍</div><div style="font-size:14px;font-weight:600">No Pokémon found</div><div style="font-size:12px;margin-top:5px">Try adjusting your filters</div></div>`;
  } else {
    html=pageFams.map((f,i)=>{
      // Filter rows if league active
      if(activeLeagueArr.length>0){
        f.members.forEach(p=>{
          let qualifies=!p.hidden&&activeLeagueArr.some(lg=>(p[rankMap[lg]]||0)>=RULES.keepThreshold);
          if(decFilter==='hundo') qualifies=qualifies&&p.isHundo&&(hundoMode===1||(hundoMode===2&&pokemonStarRank(p)===0)||(hundoMode===3&&pokemonStarRank(p)>=1&&pokemonStarRank(p)<=2));
          if(decFilter==='canEvolve') qualifies=qualifies&&p.canEvolve;
          if(decFilter==='neverEvolved') qualifies=qualifies&&p.neverEvolved;
          p._leagueFiltered=!qualifies;
        });
      } else {
        f.members.forEach(p=>p._leagueFiltered=false);
      }
      // Row-level dmax/gmax filter (same individual-row semantics as shiny filter)
      if(showDynamaxOnly)    f.members.forEach(p=>{ if(!p.isDynamax)    p._leagueFiltered=true; });
      if(showGigantamaxOnly) f.members.forEach(p=>{ if(!p.isGigantamax) p._leagueFiltered=true; });
      // Auto-open if league filter active, hundo filter active, or ≤3 families
      const hasQualifying=activeLeagueArr.length===0||f.members.some(p=>!p._leagueFiltered&&!p.hidden);
      const open=(autoOpen&&i===0)||activeLeagueArr.length>0||decFilter==='hundo';
      return renderFamilyFiltered(f,open&&hasQualifying,activeLeagueArr,rankMap);
    }).join('');
  }

  let pagHtml='';
  if(totalPages>1){
    const s=Math.max(1,Math.min(page-3,totalPages-6));
    const e=Math.min(totalPages,s+6);
    pagHtml=`<div class="pagination"><span class="page-info">${total} families</span>
      ${page>1?`<button class="page-btn" onclick="goPage(${page-1})">← Prev</button>`:''}
      ${Array.from({length:e-s+1},(_,i)=>`<button class="page-btn ${s+i===page?'active':''}" onclick="goPage(${s+i})">${s+i}</button>`).join('')}
      ${page<totalPages?`<button class="page-btn" onclick="goPage(${page+1})">Next →</button>`:''}
    </div>`;
  }
  document.getElementById('main-content').innerHTML=html+pagHtml;
}

// ── Row visibility — single source of truth ──────────────────────────────────
// Decides whether one family-member row should be shown given the active filters.
// Used by BOTH renderFamilyFiltered (initial paint) AND sortFamilyBy (column
// re-sort) so re-sorting a filtered family can never re-reveal rows the filters
// hid (regression #23: filters were lost when the sort order changed).
//   • _leagueFiltered — set by renderPage from the league / Dmax / Gmax filters
//   • hidden          — manual per-row hide
//   • practicalMode   — hides expensive slot winners
//   • search term     — when it matches only via an evo target, non-matching rows hide
// `opts` lets unit tests inject {term, practical}; production reads the globals
// (declared in render.js). `typeof` guards keep it safe under the loader, where
// those globals are absent.
function isMemberVisible(p, fam, opts){
  if(p._leagueFiltered||p.hidden) return false;
  const practical = (opts && 'practical' in opts) ? opts.practical
    : (typeof practicalMode!=='undefined' && practicalMode);
  if(practical && p.isExpensiveWinner) return false;
  const rawTerm = (opts && 'term' in opts) ? opts.term
    : (typeof searchTerm!=='undefined' ? searchTerm : '');
  const term = (rawTerm||'').toLowerCase();
  if(!term) return true;
  const matchesViaEvo = fam && !fam.primaryName.toLowerCase().includes(term) &&
    fam.members.some(q=>
      (q.evolvedNameG||'').toLowerCase().includes(term)||
      (q.evolvedNameU||'').toLowerCase().includes(term)||
      (q.evolvedNameL||'').toLowerCase().includes(term));
  if(!matchesViaEvo) return true; // name/dex search keeps the whole family visible
  if(p.name.toLowerCase().includes(term)) return true;
  if((p.targetEvo||'').toLowerCase().includes(term)) return true;
  return (p.evolvedNameG||'').toLowerCase().includes(term)||
         (p.evolvedNameU||'').toLowerCase().includes(term);
}

function renderFamilyFiltered(fam,isOpen,activeLeagues,rankMap){
  const {key,members,primaryName}=fam;
  const goldCount=members.filter(p=>p.isFavorite&&p.suggestStar).length;
  const luckyCount=members.filter(p=>p.isLucky).length;
  const binCount=members.filter(p=>!p.isFavorite&&p.decision!=='keep').length;
  const isEevee=members.some(p=>p.name==='Eevee');

  const {tier:cTier='none',hasShinyKeep,hasLuckyKeep,hasDynamaxKeep,hasGmaxKeep}=fam.completeness||{};
  const headerClass='family-header'+(cTier&&cTier!=='none'?' fam-complete-'+cTier:'');
  const completeIcons=[hasShinyKeep?'✨':'',hasLuckyKeep?'🍀':'',hasDynamaxKeep?'Ⓓ':'',hasGmaxKeep?'Ⓧ':''].filter(Boolean).join(' ');
  const eeveeTip=isEevee?`<div class="eevee-tip">💡 Eevee: best for Great = Umbreon / Sylveon, Ultra = Glaceon / Espeon</div>`:'';

  const term = searchTerm ? searchTerm.toLowerCase() : '';
  const termMatchesViaEvo = term && !fam.primaryName.toLowerCase().includes(term) &&
    fam.members.some(p =>
      (p.evolvedNameG||'').toLowerCase().includes(term) ||
      (p.evolvedNameU||'').toLowerCase().includes(term) ||
      (p.evolvedNameL||'').toLowerCase().includes(term));

  // Build evo search summary banner (e.g. searching "Sylveon" shows count + top pick)
  let evoSearchBanner = '';
  if (termMatchesViaEvo && term) {
    const matchG = fam.members.filter(p => (p.evolvedNameG||'').toLowerCase().includes(term) && !p._leagueFiltered && !p.hidden);
    const matchU = fam.members.filter(p => (p.evolvedNameU||'').toLowerCase().includes(term) && !p._leagueFiltered && !p.hidden);
    const matchName = fam.members.filter(p => p.name.toLowerCase().includes(term) && !p._leagueFiltered && !p.hidden);
    const greatMatches = matchG.filter(p => (p.evolvedNameG||'').toLowerCase().includes(term));
    const ultraMatches = matchU.filter(p => (p.evolvedNameU||'').toLowerCase().includes(term));
    const primaryLeague = greatMatches.length >= ultraMatches.length ? 'G' : 'U';
    const primaryMatches = primaryLeague === 'G' ? greatMatches : ultraMatches;
    const primaryRankField = primaryLeague === 'G' ? 'rankPctG' : 'rankPctU';
    const primaryDustField = primaryLeague === 'G' ? 'dustG' : 'dustU';
    const primaryLeagueName = primaryLeague === 'G' ? 'Great' : 'Ultra';
    const sortedCandidates = [...primaryMatches]
      .filter(p => (p[primaryRankField]||0) >= 90)
      .sort((a,b) => {
        const ra=Math.round(a[primaryRankField]||0), rb=Math.round(b[primaryRankField]||0);
        if (ra!==rb) return rb-ra;
        return (a[primaryDustField]||999999)-(b[primaryDustField]||999999);
      });
    const slotWinner = sortedCandidates[0];
    const parts = [];
    if (greatMatches.length) parts.push(`<span style="color:var(--great)">${greatMatches.length} Great</span>`);
    if (ultraMatches.length) parts.push(`<span style="color:var(--ultra)">${ultraMatches.length} Ultra</span>`);
    if (matchName.length) parts.push(`<span style="color:var(--cyan)">${matchName.length} in collection</span>`);
    let topNick = '';
    if (slotWinner) topNick = buildNickname(slotWinner, primaryLeague);
    const topNickEsc = topNick.replace(/'/g,'&#39;');
    const topStr = slotWinner
      ? ` &nbsp;·&nbsp; <strong>Top pick:</strong> <span style="font-family:monospace;color:var(--cyan);cursor:pointer" onclick="navigator.clipboard.writeText('${topNickEsc}')" title="Click to copy">${esc(topNick)}</span> CP:${slotWinner.cp} ${Math.round(slotWinner[primaryRankField]||0)}% ${primaryLeagueName}`
      : '';
    evoSearchBanner = `<div style="background:rgba(0,212,255,0.08);border-left:3px solid var(--cyan);padding:8px 14px;font-size:11px;color:var(--muted);margin-bottom:4px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      🔍 <strong style="color:var(--text)">${esc(term.charAt(0).toUpperCase()+term.slice(1))}</strong>: ${parts.join(' · ')}${topStr}
    </div>`;
  }

  const visible=members.filter(p=>isMemberVisible(p,fam));
  const hidden=members.filter(p=>!isMemberVisible(p,fam));
  const filteredNote=activeLeagues.length>0&&hidden.length>0?
    `<div style="padding:5px 12px;font-size:10px;color:var(--dim)">${hidden.length} row${hidden.length!==1?'s':''} hidden by league filter</div>`:'';

  const famForms=[...new Set(members.map(p=>p.form).filter(x=>x&&x!=='Normal'))];
  const famFormStr=famForms.length===1?`<span style="color:var(--cyan);font-size:11px">${famForms[0]}</span>`:'';
  const goSearchStr=buildGoSearchStr(primaryName,members);
  const FAM_STANDALONE=new Set(['Kleavor']);
  const ownedNames=members.map(p=>p.name);
  const csvEvoNames=members.flatMap(p=>[p.evolvedNameG,p.evolvedNameU,p.evolvedNameL].filter(Boolean));
  const validEvoNames=members.flatMap(p=>(VALID_EVOLUTIONS&&VALID_EVOLUTIONS[p.name])||[]);
  const evoTargetNames=[...new Set([...csvEvoNames,...validEvoNames])].filter(n=>!FAM_STANDALONE.has(n));
  const dbFamily=typeof getFullFamily==='function'?getFullFamily(primaryName):null;
  const famAllNames=dbFamily?[...new Set([...ownedNames,...dbFamily])]:[...new Set([...ownedNames,...evoTargetNames])];
  const REGIONAL_TAGS=['Alola','Galar','Hisui','Paldea'];
  const famRegionalForm=members[0]?.form||'';
  const isRegionalFamily=REGIONAL_TAGS.includes(famRegionalForm);
  let familySearchStr;
  if(isRegionalFamily){
    familySearchStr=famAllNames.join(',')+'&'+famRegionalForm.toLowerCase();
  }else{
    const exclusions=REGIONAL_TAGS.filter(tag=>allPokemon.some(p=>famAllNames.includes(p.name)&&p.form===tag));
    familySearchStr=famAllNames.join(',')+(exclusions.length?'&!'+exclusions.map(e=>e.toLowerCase()).join('&!'):'');
  }
  const goSearchEsc=goSearchStr.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
  const famSearchEsc=familySearchStr.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
  const nameEsc=primaryName.replace(/"/g,'&quot;');
  // F1/F2: bulk GO search strings — all keepers (🔍⭐) and all merge candidates (🔍🔀).
  const _starKeepers=familyStarKeepers(members);
  const _mergeCands=familyMergeCandidates(members);
  const _starBulkEsc=buildBulkCpSearch(_starKeepers).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
  const _mergeBulkEsc=buildBulkCpSearch(_mergeCands).replace(/&/g,'&amp;').replace(/"/g,'&quot;');

  const leagueDots=['L','G','U','M'].map(lg=>{
    const col=lg==='L'?'var(--little)':lg==='G'?'var(--great)':lg==='U'?'var(--ultra)':'var(--master)';
    const has=members.some(p=>
      p.decision==='keep'&&
      p.slots.some(s=>s===lg||s===lg+'_affordable'));
    return `<span style="color:${has?col:'var(--dim)'}">${has?'●':'○'}</span>`;
  }).join('');

  // Evo-target reason tags: show G→Umbreon in league colour in nick cell
  // when the row is visible because of an evo-target search match (not a name match)
  if (termMatchesViaEvo && term) {
    visible.forEach(p => {
      if (p.name.toLowerCase().includes(term)) { p._evoSearchTag = ''; return; }
      const tags = [];
      if ((p.evolvedNameG||'').toLowerCase().includes(term))
        tags.push(`<span style="color:var(--great);font-size:9px">G→${esc(p.evolvedNameG)}</span>`);
      if ((p.evolvedNameU||'').toLowerCase().includes(term))
        tags.push(`<span style="color:var(--ultra);font-size:9px">U→${esc(p.evolvedNameU)}</span>`);
      if ((p.evolvedNameL||'').toLowerCase().includes(term))
        tags.push(`<span style="color:var(--little);font-size:9px">L→${esc(p.evolvedNameL)}</span>`);
      p._evoSearchTag = tags.join(' ');
    });
  } else {
    visible.forEach(p => { p._evoSearchTag = ''; });
  }

  const sortedVisible=[...visible].sort((a,b)=>pokemonStarRank(a)-pokemonStarRank(b));
  const rows=sortedVisible.map(p=>buildRow(p)).join('');
  const collSet = COLLECTION_SETS && COLLECTION_SETS[primaryName];
  const collBadge = collSet ? (() => {
    const havePatterns = new Set(members.map(p=>p.specialForm||p.vivillonPattern).filter(Boolean));
    const totalPatterns = collSet.forms.length;
    const col = havePatterns.size >= totalPatterns ? 'var(--green)'
               : havePatterns.size >= totalPatterns * 0.7 ? 'var(--gold)' : 'var(--muted)';
    return `<span style="color:${col};font-size:10px;margin-left:4px" title="${havePatterns.size}/${totalPatterns} ${collSet.label} identified (${members.length} total)">[${havePatterns.size}/${totalPatterns} patterns${members.length>havePatterns.size?' · '+members.length+' total':''}]</span>`;
  })() : '';

  const thead=`<thead><tr>
    <th data-col="star" onclick="sortFamilyBy(this,'star')" title="Sort">★</th>
    <th data-col="name" onclick="sortFamilyBy(this,'name')">Pokémon</th>
    <th data-col="cp" onclick="sortFamilyBy(this,'cp')">CP</th>
    <th data-col="nick" onclick="sortFamilyBy(this,'nick')">Suggested Nick</th>
    <th data-col="ivAvg" onclick="sortFamilyBy(this,'ivAvg')">IV%</th>
    <th data-col="rankPctL" onclick="sortFamilyBy(this,'rankPctL')" style="color:var(--little)">Little</th>
    <th data-col="rankPctG" onclick="sortFamilyBy(this,'rankPctG')" style="color:var(--great)">Great</th>
    <th data-col="rankPctU" onclick="sortFamilyBy(this,'rankPctU')" style="color:var(--ultra)">Ultra</th>
    <th data-col="rankPctM" onclick="sortFamilyBy(this,'rankPctM')" style="color:var(--master)">Master</th>
    <th class="col-moves">Moves / TM</th>
    <th></th>
  </tr></thead>`;

  return `<div class="family-card ${isOpen?'open':''}" id="fam-${key}">
    <div class="${headerClass}" onclick="toggleFamily('fam-${key}')">
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;flex:1;min-width:0">
        <span class="fam-count ${members.length>countThreshold?'fam-count-large':''}">${primaryName}${famFormStr?' '+famFormStr:''}${collBadge} <span style="color:var(--dim);font-size:11px">(${members.length})${activeLeagues.length>0?' · '+visible.length+' shown':''}</span></span>
        <button class="copy-search-btn" data-copy="${goSearchEsc}" onclick="event.stopPropagation();copyGoSearch(this.dataset.copy,this)" title="Copy GO search — this form only">🔍 Me</button>
        ${famAllNames.length>1?`<button class="copy-search-btn" data-copy="${famSearchEsc}" onclick="event.stopPropagation();copyGoSearch(this.dataset.copy,this)" title="Copy GO search — whole family">🔍 + Fam</button>`:''}
        ${_starKeepers.length?`<button class="copy-search-btn" data-copy="${_starBulkEsc}" onclick="event.stopPropagation();copyGoSearch(this.dataset.copy,this);trackEvent('bulk_search_copy',{kind:'keepers',count:${_starKeepers.length}})" title="Copy GO search — all recommended keepers (CP) — paste into GO, select all, bulk-star">🔍⭐</button>`:''}
        ${_mergeCands.length?`<button class="copy-search-btn" data-copy="${_mergeBulkEsc}" onclick="event.stopPropagation();copyGoSearch(this.dataset.copy,this);trackEvent('bulk_search_copy',{kind:'merge',count:${_mergeCands.length}})" title="Copy GO search — all merge candidates (CP)">🔍🔀</button>`:''}
        ${goldCount?`<span class="fam-badge" style="color:var(--gold)">${goldCount}★</span>`:''}
        ${luckyCount?`<span class="fam-badge" style="color:var(--gold)">${luckyCount}🍀</span>`:''}
        ${binCount?`<span class="fam-badge" style="color:var(--muted)">${binCount}🗑</span>`:''}
        ${completeIcons?`<span class="fam-badge" style="font-size:11px" title="Completeness icons">${completeIcons}</span>`:''}
      </div>
      <div style="display:flex;gap:6px;align-items:center;margin-left:auto;flex-shrink:0">
        <span class="fam-league-dots">${leagueDots}</span>
        <button class="copy-search-btn" data-fam="${nameEsc}" onclick="event.stopPropagation();openCullModal(this.dataset.fam)" title="View in Cull modal" aria-label="View ${primaryName} in Cull modal">🗑</button>
        <span class="fam-chevron">▶</span>
      </div>
    </div>
    ${eeveeTip}${evoSearchBanner}
    <div class="family-body">
      <table class="poke-table">${thead}<tbody>${rows}</tbody></table>
      ${filteredNote}
    </div>
  </div>`;
}

function toggleFamily(id){const el=document.getElementById(id);if(!el)return;const nowOpen=el.classList.toggle('open');if(nowOpen)trackEvent('family_expand');}
function goPage(p){page=p;renderPage();window.scrollTo(0,180);}

function clearSearch(){
  const box=document.getElementById('searchBox');
  if(box){box.value='';box.focus();}
  document.getElementById('searchClear')?.classList.remove('visible');
  searchTerm='';applyFilters();
}

function familyStarPriority(fam){
  const m=fam.members;
  if(m.some(p=>p.starType==='gold'))   return 0;
  if(m.some(p=>p.starType==='green'))  return 1;
  if(m.some(p=>p.starType==='cyan'))   return 2;
  if(m.some(p=>p.starType==='blue'))   return 3;
  if(m.some(p=>p.starType==='shiny'))  return 4; // ✨ between blue and red
  if(m.some(p=>p.starType==='red'))    return 5;
  return 6;
}
// Sort-mode cycle order and button labels. Scan-date options are ADDITIVE —
// 'star' remains the default (render.js), the new modes are appended to the
// tail of the cycle. (ticket: sort-scan-date)
const SORT_CYCLE = ['star','count','name','scanDateDesc','scanDateAsc'];
const SORT_BTN_LABELS = {
  star:'★ Stars',
  count:'Sort by Count',
  name:'A-Z Name',
  scanDateDesc:'Scan date ↓',
  scanDateAsc:'Scan date ↑',
};
function nextSortMode(mode){
  const i=SORT_CYCLE.indexOf(mode);
  return SORT_CYCLE[(i+1)%SORT_CYCLE.length]||'star';
}
// Fire-and-forget GA4 sort telemetry (shared with ga4-event-tracking brief).
function trackSortChange(mode){ trackEvent('sort_change', { sort: mode }); }
function cycleSortMode(btn){
  sortMode=nextSortMode(sortMode);
  btn.textContent=SORT_BTN_LABELS[sortMode]||'★ Stars';
  btn.classList.toggle('active', sortMode!=='name');
  trackSortChange(sortMode);
  applyFilters();
}

function getNickSlot(p) {
  if (p.slots.includes('nundo')) return 'nundo';
  const lgSlots = p.slots.filter(s => RULES.leagues.includes(s));
  if (lgSlots.length) {
    const cappedSlots = lgSlots.filter(s => s !== 'M');
    return cappedSlots.length
      ? cappedSlots.sort((a,b)=>(p['rankPct'+b]||0)-(p['rankPct'+a]||0))[0]
      : lgSlots[0];
  }
  if (p.slots.includes('lucky') || p.isLucky) return 'lucky';
  if (p.slots.includes('shiny') || p.slots.includes('shiny_lower')) return 'shiny';
  if (p.slots.includes('dynamax')) return 'dynamax';
  if (p.slots.includes('gigantamax')) return 'gigantamax';
  if (p.slots.includes('best_overall')) return 'lucky';
  if (p.slots.includes('shadow')) return 'lucky';
  if (p.slots.includes('purified')) return 'review';
  if (p.decision === 'trade') return 'trade';
  return 'review';
}

function setNickConvention(val) {
  currentNickConvention = val;
  localStorage.setItem('nickConvention', val);
  if (!allPokemon.length) return;
  allPokemon.forEach(p => {
    const suggested = buildNickname(p, getNickSlot(p), val);
    const ov = (typeof overridesCache !== 'undefined') ? overridesCache[p.stableKey] : null;
    // Re-apply any nick override on top of the recomputed suggested nick.
    if (typeof applyNickOverride === 'function') applyNickOverride(p, ov, suggested);
    else p.nickname = suggested;
  });
  applyFilters();
}

function setDecFilter(f,btn){
  trackEvent('filter_click', { filter: f });
  // Toggle off if clicking the already-active filter
  if(decFilter===f){ decFilter='all'; document.querySelectorAll('[data-f]').forEach(b=>b.classList.remove('active','act-trade','act-review','act-protected')); applyFilters(); return; }
  decFilter=f;
  // Reset hundo cycle when switching to a different filter
  if(f!=='hundo'){hundoMode=0;const hb=document.getElementById('hundoBtn');if(hb)hb.textContent='✚ Hundos';}
  document.querySelectorAll('[data-f]').forEach(b=>b.classList.remove('active','act-trade','act-review','act-protected'));
  document.querySelectorAll('.sum-card').forEach(c=>c.classList.remove('active'));
  if(btn){const cls=f==='trade'?'act-trade':f==='review'?'act-review':f==='protected'?'act-protected':'active';btn.classList.add(cls);}
  applyFilters();
}

function toggleDmaxFilter(btn){
  trackEvent('filter_click', { filter: 'dmax' });
  showDynamaxOnly=!showDynamaxOnly;
  if(showDynamaxOnly){ showGigantamaxOnly=false; document.getElementById('gmaxFilterBtn')?.classList.remove('active'); }
  btn.classList.toggle('active',showDynamaxOnly);
  applyFilters();
}

function toggleGmaxFilter(btn){
  trackEvent('filter_click', { filter: 'gmax' });
  showGigantamaxOnly=!showGigantamaxOnly;
  if(showGigantamaxOnly){ showDynamaxOnly=false; document.getElementById('dmaxFilterBtn')?.classList.remove('active'); }
  btn.classList.toggle('active',showGigantamaxOnly);
  applyFilters();
}

function toggleMovesColumn(btn){
  movesColumnVisible=btn.classList.toggle('active');
  document.body.classList.toggle('moves-visible',movesColumnVisible);
}

function cycleHundoFilter(btn){
  trackEvent('filter_click', { filter: 'hundo' });
  hundoMode=(hundoMode+1)%4;
  // Clear other filter buttons and sum-card highlights
  document.querySelectorAll('[data-f]').forEach(b=>b.classList.remove('active','act-trade','act-review','act-protected'));
  document.querySelectorAll('.sum-card').forEach(c=>c.classList.remove('active'));
  if(hundoMode===0){
    decFilter='all';
    btn.classList.remove('active');
    btn.textContent='✚ Hundos';
    applyFilters();
  } else {
    decFilter='hundo';
    btn.classList.add('active');
    btn.textContent=['✚ Hundos','✚ Hundos','★ Hundos','✦ Hundos'][hundoMode];
    applyFilters();
  }
}

function toggleLeague(l,btn){
  trackEvent('filter_click', { filter: 'league_' + l });
  if(leagueFilters.has(l)){leagueFilters.delete(l);btn.classList.remove('active');}
  else{leagueFilters.add(l);btn.classList.add('active');}
  applyFilters();
}

function filterBestInLeague(btn){
  trackEvent('filter_click', { filter: 'best_in_league' });
  bestLeagueOnly=btn.classList.toggle('active');
  if(bestLeagueOnly){ costlyOnly=false; document.getElementById('costlyBtn')?.classList.remove('active'); }
  applyFilters();
}

function filterCostlyWinners(btn){
  trackEvent('filter_click', { filter: 'costly' });
  costlyOnly=btn.classList.toggle('active');
  if(costlyOnly){ bestLeagueOnly=false; document.getElementById('bestLeagueBtn')?.classList.remove('active'); }
  applyFilters();
}

function togglePractical(btn){
  trackEvent('filter_click', { filter: 'practical' });
  practicalMode=btn.classList.toggle('active');
  applyFilters();
}

function toggleCullPractical(btn){
  cullPracticalMode=btn.classList.toggle('active');
  openCullModal();
}

// ═══════════════════════════════════════════════
// MODALS
// ═══════════════════════════════════════════════

// ── Purify modal ──────────────────────────────
let currentNickConvention = localStorage.getItem('nickConvention') || 'pvpvault';

let purifySort='rank';       // 'rank' | 'dust' | 'league'
let purifyLeagueFilter='';   // '' | 'L' | 'G' | 'U' | 'M'

const LEAGUE_NAMES_P={L:'Little',G:'Great',U:'Ultra',M:'Master'};
const LEAGUE_COLORS_P={L:'var(--little)',G:'var(--great)',U:'var(--ultra)',M:'var(--master)'};
const LEAGUE_SYMS_P={L:'ⓛ',G:'Ⓖ',U:'Ⓤ',M:'Ⓡ'};

function openPurifyModal(){
  if(!allPokemon.length){alert('Load your collection first');return;}
  trackEvent('purify_modal_open');
  const modal=document.getElementById('purify-modal');
  const body=document.getElementById('purify-modal-body');
  const sub=document.getElementById('purify-modal-sub');

  // 92% threshold (not keepThreshold) to buffer for heuristic approximation
  // Also include hundo-on-purify candidates regardless of rank (all IVs ≥ 13)
  let candidates=allPokemon.filter(p=>p.isShadow&&(p.purifyHundo||(p.purifyLeague&&p.purifyRankPct>=92)));

  if(purifyLeagueFilter) candidates=candidates.filter(p=>p.purifyLeague===purifyLeagueFilter||p.purifyHundo);

  candidates.sort((a,b)=>{
    // Hundo-on-purify always sorts to the top
    if(a.purifyHundo&&!b.purifyHundo) return -1;
    if(!a.purifyHundo&&b.purifyHundo) return 1;
    if(purifySort==='dust'){
      const da=a['dust'+(a.purifyLeague||'G')]||0, db=b['dust'+(b.purifyLeague||'G')]||0;
      return da-db;
    }
    if(purifySort==='league'){
      const order={L:0,G:1,U:2,M:3};
      const lo=(order[a.purifyLeague]||0)-(order[b.purifyLeague]||0);
      if(lo!==0) return lo;
    }
    return (b.purifyRankPct||0)-(a.purifyRankPct||0);
  });

  const hundoCandidates=candidates.filter(p=>p.purifyHundo);
  const rankCandidates=candidates.filter(p=>!p.purifyHundo);
  sub.textContent=candidates.length+' shadow'+(candidates.length===1?'':'s')+' qualify when purified'+(hundoCandidates.length?' ('+hundoCandidates.length+' become hundo)':'');

  ['rank','dust','league'].forEach(s=>{
    const btn=document.getElementById('purify-sort-'+s);
    if(btn){btn.style.background=purifySort===s?'var(--cyan)':'none';btn.style.color=purifySort===s?'#000':'var(--muted)';}
  });
  ['all','L','G','U','M'].forEach(f=>{
    const btn=document.getElementById('purify-filter-'+f);
    if(!btn) return;
    const active=purifyLeagueFilter===(f==='all'?'':f);
    btn.style.background=active?'var(--cyan)':'none';
    btn.style.color=active?'#000':(f==='all'?'var(--muted)':LEAGUE_COLORS_P[f]||'var(--muted)');
  });

  if(!candidates.length){
    body.innerHTML='<div class="pv-modal-empty">No shadow purify candidates found'
      +(purifyLeagueFilter?' for '+LEAGUE_NAMES_P[purifyLeagueFilter]+' league':'')+'</div>';
    modal.style.display='flex';
    return;
  }

  const rows=candidates.map(p=>{
    const lg=p.purifyLeague||'';
    const lgName=LEAGUE_NAMES_P[lg]||'—';
    const lgColor=LEAGUE_COLORS_P[lg]||'var(--muted)';
    const lgSym=LEAGUE_SYMS_P[lg]||'Ⓡ';
    const shadowDust=p['dust'+lg]||0;
    const purifyDust=Math.round(shadowDust/2);
    const purifyBaseName=p.purifyEvo||p.name;
    const purifyNick=p.purifyHundo&&!lg
      ? fitName(purifyBaseName,'Ⓡ'+(Math.round(p.ivAvg||0)||100),'p✪',12)
      : fitName(purifyBaseName,lgSym+p.purifyRankPct+(p.purifyHundo?'✪':''),'p',12);
    const ivStr=p.atkIV+'/'+p.defIV+'/'+p.staIV;
    const pAtk=Math.min(15,(p.atkIV||0)+2);
    const pDef=Math.min(15,(p.defIV||0)+2);
    const pSta=Math.min(15,(p.staIV||0)+2);
    const purifiedIvStr=pAtk+'/'+pDef+'/'+pSta;
    const isHundoOnly=p.purifyHundo&&(!lg||p.purifyRankPct<92);

    return `<div style="display:grid;grid-template-columns:1fr auto auto auto;gap:8px;align-items:center;
        padding:8px 12px;border-bottom:1px solid var(--border);font-size:12px${isHundoOnly?';background:rgba(255,215,0,0.05)':''}">
      <div>
        <div style="font-weight:700;color:var(--text)">${esc(p.name)}${p.purifyEvo&&p.purifyEvo!==p.name?' <span style="color:var(--muted);font-size:11px;font-weight:400">→ '+esc(p.purifyEvo)+'</span>':''} <span style="color:var(--muted);font-weight:400">CP:${p.cp}</span>
          ${p.purifyHundo?'<span style="color:var(--gold);font-size:10px"> ✨ Becomes hundo!</span>':''}
        </div>
        <div style="color:var(--muted);font-size:11px">IVs: ${ivStr} → ${purifiedIvStr}${lg?' · <span style="color:'+lgColor+';font-weight:700">'+lgName+'</span> est. <span style="font-weight:700;color:var(--green)">'+p.purifyRankPct+'%</span>':''} · dust: <span style="color:var(--cyan)">${purifyDust>0?purifyDust.toLocaleString():'at cap'}</span></div>
      </div>
      <button class="copy-search-btn" onclick="copyGoSearch('${p.name}&cp${p.cp}&shadow',this)" title="Copy name+CP+shadow to find in GO/Pokégenie">🔍</button>
      <button class="copy-search-btn" onclick="copyGoSearch('${ivStr}',this)" title="Copy IVs to search in Pokégenie">IV</button>
      <span onclick="copyGoSearch('${purifyNick}',this)" style="font-family:monospace;color:var(--gold);cursor:pointer;font-size:12px;padding:2px 6px;border:1px solid var(--border);border-radius:4px;white-space:nowrap" title="Click to copy purified nick">${esc(purifyNick)}</span>
    </div>`;
  }).join('');

  body.innerHTML=`<div style="font-size:11px;color:var(--amber,#f59e0b);padding:8px 12px;border-bottom:1px solid var(--border)">
    ⚠ Check whether each Pokémon is more valuable as a shadow before purifying.
  </div><div style="font-size:11px;color:var(--muted);padding:6px 12px;border-bottom:1px solid var(--border)">
    Rank estimates are approximate (heuristic). Rescan in Pokégenie after purifying for accurate ranks.
  </div>${rows}`;
  modal.style.display='flex';
}

function closePurifyModal(){
  document.getElementById('purify-modal').style.display='none';
}

// ── Shinies modal ──────────────────────────────
let shinyFilter='all'; // 'all' | 'keep' | 'tradeable'

function isShinyTradeable(p){
  if(p.isLucky) return false;
  if((p.ivAvg||0)>=80) return false;
  return p.decision==='trade'||(p.decision==='review'&&!p.slotConfirmed);
}

function openShinyModal(){
  if(!allPokemon.length){alert('Load your collection first');return;}
  trackEvent('shinies_modal_open');
  const modal=document.getElementById('shiny-modal');
  const body=document.getElementById('shiny-modal-body');
  const sub=document.getElementById('shiny-modal-sub');

  const all=allPokemon.filter(p=>p.isShiny);
  const tradeableCount=all.filter(isShinyTradeable).length;

  let candidates=all;
  if(shinyFilter==='keep')      candidates=all.filter(p=>p.decision==='keep'||p.decision==='protected');
  if(shinyFilter==='tradeable') candidates=all.filter(isShinyTradeable);

  // keep first → rank% descending
  candidates.sort((a,b)=>{
    const da=a.decision==='keep'||a.decision==='protected'?0:a.decision==='review'?1:2;
    const db=b.decision==='keep'||b.decision==='protected'?0:b.decision==='review'?1:2;
    if(da!==db) return da-db;
    const ra=Math.max(a.rankPctG||0,a.rankPctU||0,a.rankPctL||0,a.rankPctM||0);
    const rb=Math.max(b.rankPctG||0,b.rankPctU||0,b.rankPctL||0,b.rankPctM||0);
    return rb-ra;
  });

  sub.textContent=all.length+' shiny'+(all.length===1?'':'s')+' tagged'+(tradeableCount?' ('+tradeableCount+' tradeable)':'');

  ['all','keep','tradeable'].forEach(f=>{
    const btn=document.getElementById('shiny-filter-'+f);
    if(!btn) return;
    const active=shinyFilter===f;
    btn.style.background=active?'var(--cyan)':'none';
    btn.style.color=active?'#000':(f==='keep'?'var(--green)':f==='tradeable'?'var(--red)':'var(--muted)');
  });

  if(!candidates.length){
    body.innerHTML='<div class="pv-modal-empty">'+(all.length?'No shinies match this filter':'No shinies tagged — use ✨ Mark Special to tag shinies')+'</div>';
    modal.style.display='flex';
    return;
  }

  const lgNames={L:'Little',G:'Great',U:'Ultra',M:'Master'};
  const lgColors={L:'var(--little)',G:'var(--great)',U:'var(--ultra)',M:'var(--master)'};

  const rows=candidates.map(p=>{
    const ivStr=p.atkIV+'/'+p.defIV+'/'+p.staIV;
    const iv=Math.round(p.ivAvg||0);
    const ivColor=iv>=90?'var(--green)':iv>=70?'var(--cyan)':'var(--muted)';

    // Best league slot
    const slot=['M','U','G','L'].find(lg=>(p.slots||[]).includes(lg));
    const slotStr=slot
      ? `<span style="color:${lgColors[slot]};font-weight:700">${lgNames[slot]}</span> <span style="color:var(--green)">${Math.round(p['rankPct'+slot]||0)}%</span>`
      : '<span style="color:var(--muted)">—</span>';

    const tradeable=isShinyTradeable(p);
    const decClass=p.decision==='keep'||p.decision==='protected'?'dec-keep':p.decision==='trade'?'dec-trade':'dec-review';
    const decLabel=p.decision==='protected'?'protected':p.decision||'—';

    const nick=p.nickname||'';
    const searchStr=(p.name+'&cp'+p.cp).replace(/&/g,'&amp;').replace(/"/g,'&quot;');

    return `<div style="display:grid;grid-template-columns:1fr auto auto auto;gap:8px;align-items:center;
        padding:8px 12px;border-bottom:1px solid var(--border);font-size:12px">
      <div>
        <div style="font-weight:700;color:var(--text)">${esc(p.name)}${p.form?' <span style="color:var(--muted);font-size:11px;font-weight:400">('+esc(p.form)+')</span>':''} <span style="color:var(--muted);font-weight:400">CP:${p.cp}</span>
          ${tradeable?'<span style="color:var(--red);font-size:10px;margin-left:4px">Trade?</span>':''}
        </div>
        <div style="color:var(--muted);font-size:11px">IVs: ${ivStr} · <span style="color:${ivColor}">${iv}%</span> · ${slotStr}
          ${p.isLucky?' · <span style="color:var(--gold)">Lucky</span>':''}
        </div>
      </div>
      <span style="font-size:10px;padding:2px 6px;border-radius:4px" class="${decClass}">${decLabel}</span>
      <button class="copy-search-btn" data-copy="${searchStr}" onclick="copyGoSearch(this.dataset.copy,this)" title="Copy GO search for this Pokémon">🔍 Me</button>
      <span onclick="copyGoSearch('${nick.replace(/'/g,"\\'").replace(/&/g,'&amp;')}',this)" style="font-family:monospace;color:var(--gold);cursor:pointer;font-size:12px;padding:2px 6px;border:1px solid var(--border);border-radius:4px;white-space:nowrap" title="Click to copy nick">${nick?esc(nick):'—'}</span>
    </div>`;
  }).join('');

  body.innerHTML=rows;
  modal.style.display='flex';
}

function closeShinyModal(){
  document.getElementById('shiny-modal').style.display='none';
}

// ── Collection Completion / Pokédex modal ────────
const DEX_ALL_TYPES = ['Normal','Fighting','Flying','Poison','Ground','Rock','Bug','Ghost','Steel','Fire','Water','Grass','Electric','Psychic','Ice','Dragon','Dark','Fairy'];

let dexView      = 'have';    // 'have' | 'missing'
let dexCat       = 'all';     // 'all' | 'Legendary' | 'Mythical' | 'Ultra Beast'
let dexQualShiny = false;
let dexQualLucky = false;
let dexTypes     = new Set(); // selected type pills
let dexTypesOpen = false;
let allSpecies   = null;      // cached from Supabase pokemon_species
let dexSolo      = false;     // Have view: only species with count=1
let dexSpare     = false;     // Have view: only species with count≥2
let dexExcludeEvolvable = false; // Missing view: hide species player can evolve to
let dexExcludeFamily = false;    // Missing+Lucky view: hide species where any family member is lucky
let dexExcludeLucky = false;  // Have view: hide species where all are lucky (untradeable)
let dexExcludeKeeps = false;  // Have view: hide species where trade count = 0 after luckies + starred

// ── Deep Links (hash-based state) ────────────────────────────────────
function encodeStateToHash() {
  const dexEl = document.getElementById('dex-modal');
  const dexOpen = dexEl && dexEl.style.display === 'flex';
  const params = new URLSearchParams();

  if (dexOpen) {
    params.set('view', dexView);
    if (dexCat !== 'all') params.set('category', dexCat);
    if (dexQualShiny) params.set('shiny', 'true');
    if (dexQualLucky) params.set('lucky', 'true');
    if (dexQualDmax)  params.set('dmax',  'true');
    if (dexQualGmax)  params.set('gmax',  'true');
    if (dexQualHundo) params.set('hundos', 'true');
    if (dexShinyAvailOnly) params.set('shinyavail', 'true');
    if (dexTypes.size) params.set('types', [...dexTypes].join(','));
    if (dexSolo)  params.set('solo', 'true');
    if (dexSpare) params.set('spare', 'true');
    if (dexExcludeEvolvable) params.set('noevolve', 'true');
    if (dexExcludeFamily) params.set('nofamily', 'true');
    if (dexExcludeLucky) params.set('nolucky', 'true');
    if (dexExcludeKeeps) params.set('nokeeps', 'true');
    return '#dex?' + params.toString();
  }

  if (searchTerm) params.set('search', searchTerm);
  if (decFilter !== 'all') params.set('decision', decFilter);
  if (leagueFilters.size) params.set('leagues', [...leagueFilters].join(','));
  if (practicalMode) params.set('practical', 'true');
  const qs = params.toString();
  return qs ? '#results?' + qs : '#';
}

function updateHash() {
  history.replaceState(null, '', encodeStateToHash());
}

function applyHashState() {
  const hash = window.location.hash;
  if (!hash || hash === '#') return;

  const qIdx = hash.indexOf('?');
  const prefix = qIdx === -1 ? hash.slice(1) : hash.slice(1, qIdx);
  const params = new URLSearchParams(qIdx === -1 ? '' : hash.slice(qIdx + 1));

  if (prefix === 'dex') {
    const v = params.get('view');
    if (v === 'have' || v === 'missing') dexView = v;
    const cat = params.get('category');
    if (cat) dexCat = cat;
    dexQualShiny = params.get('shiny') === 'true';
    dexQualLucky = params.get('lucky') === 'true';
    dexQualDmax  = params.get('dmax')  === 'true';
    dexQualGmax  = params.get('gmax')  === 'true';
    if (dexQualDmax && dexQualGmax) dexQualGmax = false; // mutual exclusion safety
    dexQualHundo = params.get('hundos') === 'true';
    dexShinyAvailOnly = params.get('shinyavail') === 'true';
    const types = params.get('types');
    if (types) dexTypes = new Set(types.split(',').filter(Boolean));
    dexSolo  = params.get('solo')  === 'true';
    dexSpare = params.get('spare') === 'true';
    if (dexSolo && dexSpare) dexSpare = false; // mutual exclusion safety
    dexExcludeEvolvable = params.get('noevolve') === 'true';
    dexExcludeFamily = params.get('nofamily') === 'true';
    dexExcludeLucky = params.get('nolucky') === 'true';
    dexExcludeKeeps = params.get('nokeeps') === 'true';
    openDexModal();
    return;
  }

  if (prefix === 'modal') {
    const m = params.get('modal');
    const openers = {purify:openPurifyModal, shinies:openShinyModal, merge:openMergeModal, special:openSpecialModal};
    if (m && openers[m]) openers[m]();
    return;
  }

  if (prefix === 'results') {
    const s = params.get('search');
    if (s) {
      searchTerm = s.slice(0, 100).toLowerCase();
      const box = document.getElementById('searchBox');
      if (box) { box.value = s.slice(0, 100); document.getElementById('searchClear')?.classList.add('visible'); }
    }
    const d = params.get('decision');
    if (d && d !== 'all') {
      decFilter = d;
      const btn = document.querySelector(`[data-f="${d}"]`);
      if (btn) {
        const cls = d==='trade'?'act-trade':d==='review'?'act-review':d==='protected'?'act-protected':'active';
        btn.classList.add(cls);
      }
    }
    const ls = params.get('leagues');
    if (ls) {
      ls.split(',').filter(l => ['L','G','U','M'].includes(l)).forEach(l => {
        leagueFilters.add(l);
        document.querySelector(`[data-l="${l}"]`)?.classList.add('active');
      });
    }
    if (params.get('practical') === 'true') {
      practicalMode = true;
      document.getElementById('practicalBtn')?.classList.add('active');
    }
    applyFilters();
  }
}

function copyCurrentLink() {
  const url = window.location.origin + window.location.pathname + encodeStateToHash();
  navigator.clipboard.writeText(url)
    .then(() => showToast('Link copied!'))
    .catch(() => showToast('Copy failed — use Ctrl+C'));
}

async function openDexModal() {
  const modal = document.getElementById('dex-modal');
  modal.style.display = 'flex';
  if (!allSpecies) {
    document.getElementById('dex-modal-sub').textContent = 'Loading Pokédex data...';
    document.getElementById('dex-modal-body').innerHTML = '<div class="pv-modal-empty">Fetching species from database…</div>';
    const data = await supabaseFetch('GET', 'pokemon_species?select=*&order=pokedex_number&limit=2000', null);
    if (!data) {
      document.getElementById('dex-modal-sub').textContent = '';
      document.getElementById('dex-modal-body').innerHTML = '<div class="pv-modal-empty" style="color:var(--red)">Failed to load Pokédex data. Run scripts/fetch-pokemon-species.js first.</div>';
      return; // don't cache — allow retry on next open
    }
    allSpecies = data;
  }
  renderTypePills();
  renderDexModal();
}

function closeDexModal() {
  document.getElementById('dex-modal').style.display = 'none';
  updateHash();
}

function dexNavigate(name) {
  closeDexModal();
  const box = document.getElementById('searchBox');
  if (box) box.value = name;
  searchTerm = name.toLowerCase();
  applyFilters();
  document.getElementById('searchClear')?.classList.add('visible');
}

function renderTypePills() {
  const row = document.getElementById('dex-types-row');
  row.innerHTML = DEX_ALL_TYPES.map(t => {
    const active = dexTypes.has(t);
    return `<button class="dex-type-pill${active?' dex-type-pill-active':''}" onclick="toggleDexType('${t}')" id="dexpill-${t}">${t}</button>`;
  }).join('');
}

function toggleDexType(type) {
  if (dexTypes.has(type)) dexTypes.delete(type); else dexTypes.add(type);
  renderDexModal();
}

function toggleDexTypes() {
  dexTypesOpen = !dexTypesOpen;
  document.getElementById('dex-types-row').style.display = dexTypesOpen ? 'flex' : 'none';
}

function updateDexFilterButtons() {
  // View toggle
  document.getElementById('dex-view-have').classList.toggle('dex-view-active', dexView === 'have');
  document.getElementById('dex-view-missing').classList.toggle('dex-view-active', dexView === 'missing');
  // Category — use CSS class, not inline style
  const catMap = { all:'dex-cat-all', Legendary:'dex-cat-leg', Mythical:'dex-cat-myth', 'Ultra Beast':'dex-cat-ub' };
  Object.values(catMap).forEach(id => document.getElementById(id)?.classList.remove('dex-filter-active'));
  document.getElementById(catMap[dexCat])?.classList.add('dex-filter-active');
  // Qualifiers
  document.getElementById('dex-qual-shiny')?.classList.toggle('dex-filter-active', dexQualShiny);
  document.getElementById('dex-qual-lucky')?.classList.toggle('dex-filter-active', dexQualLucky);
  document.getElementById('dex-qual-dmax')?.classList.toggle('dex-filter-active', dexQualDmax);
  document.getElementById('dex-qual-gmax')?.classList.toggle('dex-filter-active', dexQualGmax);
  document.getElementById('dex-qual-hundo')?.classList.toggle('dex-filter-active', dexQualHundo);
  document.getElementById('dex-shiny-avail')?.classList.toggle('dex-filter-active', dexShinyAvailOnly);
  // Solo / Spare / Exclude evolvable
  document.getElementById('dex-solo')?.classList.toggle('dex-filter-active', dexSolo);
  document.getElementById('dex-spare')?.classList.toggle('dex-filter-active', dexSpare);
  document.getElementById('dex-excl-evolve')?.classList.toggle('dex-filter-active', dexExcludeEvolvable);
  document.getElementById('dex-excl-family')?.classList.toggle('dex-filter-active', dexExcludeFamily);
  document.getElementById('dex-excl-lucky')?.classList.toggle('dex-filter-active', dexExcludeLucky);
  document.getElementById('dex-excl-keeps')?.classList.toggle('dex-filter-active', dexExcludeKeeps);
  // Solo/Spares/Excl.Lucky/Excl.Keeps are Have-view concepts — hide them in Missing view
  const haveOnlyIds = ['dex-solo', 'dex-spare', 'dex-excl-lucky', 'dex-excl-keeps'];
  haveOnlyIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = dexView === 'missing' ? 'none' : '';
  });
  // Excl.Family and Excl.Evolvable are Missing-view concepts — hide them in Have view
  const missingOnlyIds = ['dex-excl-evolve', 'dex-excl-family'];
  missingOnlyIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = dexView === 'have' ? 'none' : '';
  });
  // "Available only" is only relevant in Missing+Shiny view
  const shinyAvailEl = document.getElementById('dex-shiny-avail');
  if (shinyAvailEl) shinyAvailEl.style.display = (dexView === 'missing' && dexQualShiny) ? '' : 'none';
  // Type pills
  document.querySelectorAll('.dex-type-pill').forEach(btn => {
    btn.classList.toggle('dex-type-pill-active', dexTypes.has(btn.textContent));
  });
}

function applyDexFilters(species) {
  // Category filter
  let filtered = dexCat === 'all' ? species.slice() : species.filter(s => s.category === dexCat);
  // Type filter (AND: all selected types must appear in the species' types)
  if (dexTypes.size > 0) {
    const types = [...dexTypes];
    filtered = filtered.filter(s => types.every(t => s.type1 === t || s.type2 === t));
  }
  return filtered;
}

function renderDexModal() {
  if (!allSpecies) return;
  updateDexFilterButtons();

  const filteredSpecies = applyDexFilters(allSpecies);
  const body = document.getElementById('dex-modal-body');

  if (!allPokemon.length) {
    document.getElementById('dex-modal-sub').textContent = '';
    body.innerHTML = '<div class="pv-modal-empty">Load your collection first</div>';
    return;
  }

  if (dexView === 'have') {
    renderDexHaveView(body, filteredSpecies);
  } else {
    renderDexMissingView(body, filteredSpecies);
  }
  updateHash();
}

function renderDexHaveView(body, filteredSpecies) {
  // p.pokeNum is a raw CSV string; s.pokedex_number is a Supabase integer — convert for comparison
  const speciesNums = new Set(filteredSpecies.map(s => s.pokedex_number));

  let matched = allPokemon.filter(p => speciesNums.has(Number(p.pokeNum)));
  if (dexQualShiny && dexQualLucky) matched = matched.filter(p => p.isShiny && p.isLucky);
  else if (dexQualShiny)            matched = matched.filter(p => p.isShiny);
  else if (dexQualLucky)            matched = matched.filter(p => p.isLucky);
  if (dexQualDmax)  matched = matched.filter(p => p.isDynamax);
  if (dexQualGmax)  matched = matched.filter(p => p.isGigantamax);
  if (dexQualHundo) matched = matched.filter(p => p.isHundo);

  // Group by species (one row per species, not per individual Pokémon)
  const bySpecies = new Map(); // pokedex_number → [pokemon, ...]
  matched.forEach(p => {
    const n = Number(p.pokeNum);
    if (!bySpecies.has(n)) bySpecies.set(n, []);
    bySpecies.get(n).push(p);
  });

  // Apply solo/spare filter
  let displaySpecies = bySpecies;
  if (dexSolo)  displaySpecies = new Map([...displaySpecies].filter(([,arr]) => arr.length === 1));
  if (dexSpare) displaySpecies = new Map([...displaySpecies].filter(([,arr]) => arr.length >= 2));
  if (dexExcludeLucky) displaySpecies = new Map([...displaySpecies].filter(([,arr]) => arr.some(p => !p.isLucky)));
  if (dexExcludeKeeps) displaySpecies = new Map([...displaySpecies].filter(([,arr]) => {
    const keeper = shinyKeeperOf(arr);
    const nonTradeable = arr.filter(p => p.isLucky || pokemonStarRank(p) < 3 || p === keeper).length;
    return arr.length - nonTradeable > 0;
  }));

  const speciesCount = displaySpecies.size;

  // Subtitle with context
  const qualParts = [];
  if (dexQualShiny) qualParts.push('shiny');
  if (dexQualLucky) qualParts.push('lucky');
  if (dexQualDmax)  qualParts.push('Dynamax');
  if (dexQualGmax)  qualParts.push('Gigantamax');
  if (dexQualHundo) qualParts.push('hundo');
  const qualLabel = qualParts.length ? ' with ' + qualParts.join(' + ') : '';
  const soloLabel = dexSolo ? ' (solo only)' : dexSpare ? ' (spares only)' : '';
  const catLabel = dexCat !== 'all' ? dexCat.toLowerCase() + ' ' : '';
  document.getElementById('dex-modal-sub').textContent = `${speciesCount} ${catLabel}species${qualLabel}${soloLabel}`;

  if (!speciesCount) {
    body.innerHTML = '<div class="pv-modal-empty">No Pokémon match the current filters</div>';
    return;
  }

  // Group species by category: Legendary → Mythical → Ultra Beast → Regular
  const CAT_ORDER = ['Legendary','Mythical','Ultra Beast','Regular'];
  const speciesByCat = {};
  filteredSpecies.forEach(s => {
    (speciesByCat[s.category] = speciesByCat[s.category] || []).push(s);
  });

  // Needed for Task 4 solo evolve-from notice
  const speciesById = new Map(allSpecies.map(s => [s.pokedex_number, s]));
  const ownedNums   = new Set(allPokemon.map(p => Number(p.pokeNum)));

  let html = '';
  for (const cat of CAT_ORDER) {
    const catSpecies = (speciesByCat[cat] || []).filter(s => displaySpecies.has(s.pokedex_number));
    if (!catSpecies.length) continue;

    // Solo (count=1) first, then alphabetical
    catSpecies.sort((a, b) => {
      const aCount = displaySpecies.get(a.pokedex_number).length;
      const bCount = displaySpecies.get(b.pokedex_number).length;
      if (aCount === 1 && bCount !== 1) return -1;
      if (bCount === 1 && aCount !== 1) return 1;
      return a.name.localeCompare(b.name);
    });

    // Each category wrapped in a section div — provides visual close after UB before Regular rows
    html += `<div class="dex-cat-section">`;
    if (cat !== 'Regular') html += `<div class="dex-cat-header">${cat}</div>`;

    html += catSpecies.map(s => {
      const group = displaySpecies.get(s.pokedex_number);
      const count = group.length;
      const luckyCount = group.filter(p => p.isLucky).length;
      const starCount = group.filter(p => pokemonStarRank(p) < 3).length;
      const keeper = shinyKeeperOf(group);
      const nonTradeable = group.filter(p => p.isLucky || pokemonStarRank(p) < 3 || p === keeper).length;
      const tradeCount = count - nonTradeable;
      const type2str = s.type2 ? `/${s.type2}` : '';
      const numStr = String(s.pokedex_number).padStart(3, '0');
      const safeName = s.name.replace(/'/g, "\\'");
      const isSolo = count === 1;
      const luckyHtml = luckyCount > 0 ? `<span class="dex-lucky">🍀${luckyCount}</span>` : '';
      const starHtml = starCount > 0 ? `<span class="dex-starred">⭐${starCount}</span>` : '';
      const tradeHtml = `<span class="dex-trade">Trade: ${tradeCount}</span>`;
      const soloEvolveFrom = (isSolo && tradeCount > 0) ? findOwnedAncestor(s, speciesById, ownedNums) : null;
      const rightHtml = soloEvolveFrom
        ? `<span class="dex-evolve-notice">Evolve from ${soloEvolveFrom}</span><span class="dex-count">×1</span>${luckyHtml}${starHtml}${tradeHtml}`
        : (isSolo && tradeCount > 0)
        ? `<span class="dex-solo-notice">⚠ Only one — Lucky/Mirror trade only</span><span class="dex-count">×1</span>${luckyHtml}${starHtml}${tradeHtml}`
        : `<span class="dex-count">×${count}</span>${luckyHtml}${starHtml}${tradeHtml}`;
      return `<div class="dex-row">
  <div class="dex-row-main">
    <span class="dex-num">#${numStr}</span>
    <button class="dex-name-link" onclick="dexNavigate('${safeName}')">${esc(s.name)}</button>
    <span class="dex-types">${s.type1}${type2str}</span>
    ${rightHtml}
  </div>
</div>`;
    }).join('');

    html += `</div>`; // close dex-cat-section
  }

  body.innerHTML = html;
}

// Return a Set of all pokedex_numbers in the same evolution family as s.
// Walks up to the root via evolves_from, then BFS down using the evolvesInto map.
function getFullFamilyNums(s, speciesById, evolvesInto) {
  let root = s;
  while (root.evolves_from && speciesById.has(root.evolves_from)) {
    root = speciesById.get(root.evolves_from);
  }
  const family = new Set();
  const queue = [root.pokedex_number];
  while (queue.length) {
    const num = queue.shift();
    family.add(num);
    for (const child of (evolvesInto.get(num) || [])) queue.push(child);
  }
  return family;
}

// Walk evolves_from chain; return name of the closest owned ancestor, or null.
// "Closest" = immediate pre-evo first, then pre-evo's pre-evo.
// Covers 3-stage chains (max depth in Pokémon GO).
function findOwnedAncestor(s, speciesById, ownedNums) {
  let cur = s;
  for (let i = 0; i < 4; i++) {
    if (!cur.evolves_from) return null;
    const parent = speciesById.get(cur.evolves_from);
    if (!parent) return null;
    if (ownedNums.has(parent.pokedex_number)) return parent.name || 'pre-evolution';
    cur = parent;
  }
  return null;
}

// Walk evolves_from chain; return true if any ancestor (or self) has is_shiny_available.
// Bulbapedia only lists base evolutions — evolved forms inherit shiny availability.
function isShinyAvailableInChain(s, speciesById) {
  let cur = s;
  for (let i = 0; i < 6; i++) {
    if (cur.is_shiny_available) return true;
    if (!cur.evolves_from) return false;
    cur = speciesById.get(cur.evolves_from);
    if (!cur) return false;
  }
  return false;
}

function renderDexMissingView(body, filteredSpecies) {
  // p.pokeNum is a raw CSV string; convert to number before comparing with s.pokedex_number (integer)
  const ownedNums  = new Set(allPokemon.map(p => Number(p.pokeNum)));
  const speciesById = new Map(allSpecies.map(s => [s.pokedex_number, s]));

  // evolvesInto: Map<parent_num, child_num[]> — needed for full-family walks
  const evolvesInto = new Map();
  for (const s of allSpecies) {
    if (s.evolves_from) {
      const arr = evolvesInto.get(s.evolves_from) || [];
      arr.push(s.pokedex_number);
      evolvesInto.set(s.evolves_from, arr);
    }
  }

  // Lucky counts by pokedex number — for family lucky indicator
  const luckyCountByNum = new Map();
  if (dexQualLucky) {
    allPokemon.filter(p => p.isLucky).forEach(p => {
      const n = Number(p.pokeNum);
      luckyCountByNum.set(n, (luckyCountByNum.get(n) || 0) + 1);
    });
  }

  // Excl. Family — build sets of all nums sharing a family with any owned lucky or shiny
  const familyLuckyNums = new Set();
  if (dexQualLucky && dexExcludeFamily) {
    for (const [num] of luckyCountByNum) {
      const s = speciesById.get(num);
      if (s) getFullFamilyNums(s, speciesById, evolvesInto).forEach(n => familyLuckyNums.add(n));
    }
  }
  const familyShinyNums = new Set();
  if (dexQualShiny && dexExcludeFamily) {
    const shinyNums = new Set(allPokemon.filter(p => p.isShiny).map(p => Number(p.pokeNum)));
    for (const num of shinyNums) {
      const s = speciesById.get(num);
      if (s) getFullFamilyNums(s, speciesById, evolvesInto).forEach(n => familyShinyNums.add(n));
    }
  }

  let missing;
  if (dexQualShiny && dexQualLucky) {
    missing = filteredSpecies.filter(s => !allPokemon.some(p => Number(p.pokeNum) === s.pokedex_number && p.isShiny && p.isLucky));
  } else if (dexQualShiny) {
    missing = filteredSpecies.filter(s => !allPokemon.some(p => Number(p.pokeNum) === s.pokedex_number && p.isShiny));
  } else if (dexQualLucky) {
    missing = filteredSpecies.filter(s => !allPokemon.some(p => Number(p.pokeNum) === s.pokedex_number && p.isLucky));
  } else {
    missing = filteredSpecies.filter(s => !allPokemon.some(p => Number(p.pokeNum) === s.pokedex_number));
  }
  // Task 4: Hundos — species with no hundo owned (stacks with shiny/lucky qualifier)
  if (dexQualHundo) {
    const haveHundoNums = new Set(allPokemon.filter(p => p.isHundo).map(p => Number(p.pokeNum)));
    missing = missing.filter(s => !haveHundoNums.has(s.pokedex_number));
  }

  // Apply exclude-evolvable filter — walk full chain, not just immediate pre-evo
  if (dexExcludeEvolvable) {
    missing = missing.filter(s => !findOwnedAncestor(s, speciesById, ownedNums));
  }

  // Excl. Family: hide missing species where any family member is lucky or shiny
  if (dexQualLucky && dexExcludeFamily) {
    missing = missing.filter(s => !familyLuckyNums.has(s.pokedex_number));
  }
  if (dexQualShiny && dexExcludeFamily) {
    missing = missing.filter(s => !familyShinyNums.has(s.pokedex_number));
  }

  // Dmax/Gmax qualifiers in missing view — only show species where Dynamax/Gigantamax is released in GO.
  // Dynamax: available for all regular (non-Legendary/Mythical/UB) in-GO species.
  // Gigantamax: only species in GIGANTAMAX_SPECIES (static list in data.js).
  if (dexQualDmax) {
    const haveDmaxNums = new Set(allPokemon.filter(p => p.isDynamax).map(p => Number(p.pokeNum)));
    missing = missing.filter(s =>
      s.is_in_go &&
      s.category !== 'Legendary' &&
      s.category !== 'Mythical' &&
      s.category !== 'Ultra Beast' &&
      !haveDmaxNums.has(s.pokedex_number)
    );
  }
  if (dexQualGmax) {
    const haveGmaxNums = new Set(allPokemon.filter(p => p.isGigantamax).map(p => Number(p.pokeNum)));
    missing = missing.filter(s =>
      (typeof GIGANTAMAX_SPECIES !== 'undefined' ? GIGANTAMAX_SPECIES.has(s.name) : true) &&
      !haveGmaxNums.has(s.pokedex_number)
    );
  }

  // Task 5: Available only — hide "No shiny in GO" species when Shiny+Missing+Available only
  if (dexQualShiny && dexShinyAvailOnly) {
    missing = missing.filter(s => isShinyAvailableInChain(s, speciesById));
  }

  // Sort: in-GO first alphabetical, then not-in-GO
  missing.sort((a, b) => {
    if (a.is_in_go !== b.is_in_go) return (b.is_in_go ? 1 : 0) - (a.is_in_go ? 1 : 0);
    return a.name.localeCompare(b.name);
  });

  const missingQualParts = [];
  if (dexQualShiny) missingQualParts.push('shiny');
  if (dexQualLucky) missingQualParts.push('lucky');
  if (dexQualDmax)  missingQualParts.push('Dynamax');
  if (dexQualGmax)  missingQualParts.push('Gigantamax');
  if (dexQualHundo) missingQualParts.push('hundo');
  const qualLabel = missingQualParts.length ? missingQualParts.join(' + ') + ' ' : '';
  const catLabel  = dexCat !== 'all' ? dexCat.toLowerCase() + ' ' : '';
  const evolveLabel = dexExcludeEvolvable ? ' (excl. evolvable)' : '';
  document.getElementById('dex-modal-sub').textContent = `${missing.length} ${catLabel}${qualLabel}missing${evolveLabel}`;

  if (!missing.length) {
    body.innerHTML = '<div class="pv-modal-empty">No missing Pokémon — collection complete! 🎉</div>';
    return;
  }

  body.innerHTML = missing.map(s => {
    const type2str = s.type2 ? `/${s.type2}` : '';
    const numStr   = String(s.pokedex_number).padStart(3, '0');
    const safeName = s.name.replace(/'/g, "\\'");

    // Status notice
    let noticeHtml = '';
    if (!s.is_in_go) {
      noticeHtml = '<span class="dex-notice-grey">Not in GO</span>';
    } else if (dexQualShiny && !isShinyAvailableInChain(s, speciesById)) {
      noticeHtml = '<span class="dex-notice-amber">No shiny in GO ✨</span>';
    }

    // Can-evolve indicator: walk full chain to find closest owned ancestor
    const ownedAncestor = findOwnedAncestor(s, speciesById, ownedNums);
    const canEvolveHtml = ownedAncestor
      ? `<span class="dex-can-evolve">✓ Evolve from ${ownedAncestor}!</span>`
      : '';

    // Task 2: family lucky indicator — only shown when Lucky filter active
    let familyLuckyHtml = '';
    if (dexQualLucky && luckyCountByNum.size) {
      const familyNums = getFullFamilyNums(s, speciesById, evolvesInto);
      const parts = [];
      for (const num of familyNums) {
        const count = luckyCountByNum.get(num);
        if (count) parts.push({ count, name: speciesById.get(num)?.name || String(num) });
      }
      if (parts.length) {
        parts.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
        familyLuckyHtml = `<span class="dex-family-lucky">${parts.map(p => `${p.count}🍀 ${esc(p.name)}`).join(', ')}</span>`;
      }
    }

    return `<div class="dex-row dex-row-missing${!s.is_in_go ? ' dex-not-in-go' : ''}" onclick="navigator.clipboard?.writeText('${safeName}')" title="Tap to copy GO search string">
  <div class="dex-row-main">
    <span class="dex-num">#${numStr}</span>
    <button class="dex-name-link" onclick="event.stopPropagation();dexNavigate('${safeName}')">${esc(s.name)}</button>
    <span class="dex-types">${s.type1}${type2str}</span>
    ${noticeHtml}
    ${canEvolveHtml}
    ${familyLuckyHtml}
  </div>
</div>`;
  }).join('');
}

// ── Cull modal ──────────────────────────────────
function openCullModal(focusFam){
  if(!allPokemon.length){alert('Load your collection first');return;}
  trackEvent('cull_modal_open');
  const modal=document.getElementById('cull-modal');
  const body=document.getElementById('cull-modal-body');
  const sub=document.getElementById('cull-modal-sub');

  // Pre-fill search box if called with a family name
  const searchBox=document.getElementById('cullSearchBox');
  if(focusFam && searchBox) searchBox.value=focusFam;
  const cullTerm=(searchBox?.value||'').toLowerCase();

  // Qualify: has ≥1 gold star (regular or expensive-winner), and no UNRESOLVED green/blue/cyan stars.
  // Expensive-winner golds (suggestStarExpensive && isFavorite) count as resolved — user has already starred them.
  const qualifying=families.filter(fam=>{
    const m=fam.members;
    return m.some(p=>p.isFavorite&&(p.suggestStar||p.suggestStarExpensive))
      &&!m.some(p=>!p.isFavorite&&p.suggestStar)
      &&!m.some(p=>p.suggestStarExpensive&&!p.isFavorite)
      &&!m.some(p=>p.suggestStarCheaper&&!p.isFavorite);
  });

  const countNonGold=fam=>fam.members.filter(p=>!(p.isFavorite&&p.suggestStar)&&!p.isMlPlaceholder).length;
  qualifying.sort((a,b)=>countNonGold(b)-countNonGold(a));

  // Practical filter: hide families whose only confirmed keepers are expensive winners
  let displayQualifying = qualifying;
  if (cullPracticalMode) {
    displayQualifying = qualifying.filter(fam =>
      fam.members.some(p => p.isFavorite && (p.suggestStar || p.isExpensiveWinner))
    );
  }

  // Search filter
  if(cullTerm) displayQualifying=displayQualifying.filter(fam=>fam.primaryName.toLowerCase().includes(cullTerm));

  const totalCull=displayQualifying.reduce((s,f)=>s+countNonGold(f),0);
  sub.textContent=displayQualifying.length+' famil'+(displayQualifying.length===1?'y':'ies')+' settled · '+totalCull+' potential deletes/trades';

  if(!qualifying.length){
    body.innerHTML='<div class="pv-modal-empty">No fully-settled families yet — some families still have green, blue, or cyan stars to resolve</div>';
    modal.style.display='flex';
    return;
  }

  const FAM_STANDALONE=new Set(['Kleavor']);

  const rows=displayQualifying.map(fam=>{
    const keepers=fam.members.filter(p=>(p.isFavorite&&p.suggestStar)||p.isMlPlaceholder);
    const redCount=fam.members.filter(p=>p.isFavorite&&!p.suggestStar).length;
    const luckyCount=fam.members.filter(p=>p.isLucky).length;
    const unstarredCount=fam.members.filter(p=>!p.isFavorite).length;

    // Build +Fam search string (same logic as renderFamilyFiltered)
    const ownedNames=fam.members.map(p=>p.name);
    const evoTargetNames=fam.members.flatMap(p=>[p.evolvedNameG,p.evolvedNameU,p.evolvedNameL].filter(Boolean)).filter(n=>!FAM_STANDALONE.has(n));
    const dbFamily=typeof getFullFamily==='function'?getFullFamily(fam.primaryName):null;
    const allNames=dbFamily?[...new Set([...ownedNames,...dbFamily])]:[...new Set([...ownedNames,...evoTargetNames])];
    const REGIONAL_TAGS=['Alola','Galar','Hisui','Paldea'];
    const famRegionalForm=fam.members[0]?.form||'';
    const isRegional=REGIONAL_TAGS.includes(famRegionalForm);
    let searchStr;
    if(isRegional){
      searchStr=allNames.join(',')+'&'+famRegionalForm.toLowerCase();
    }else{
      const excl=REGIONAL_TAGS.filter(tag=>allPokemon.some(p=>allNames.includes(p.name)&&p.form===tag));
      searchStr=allNames.join(',')+(excl.length?'&!'+excl.map(e=>e.toLowerCase()).join('&!'):'');
    }
    const searchEsc=searchStr.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
    const nameEsc=fam.primaryName.replace(/"/g,'&quot;');
    const {tier:cullTier='none'}=fam.completeness||{};
    const cullBorderStyle=cullTier==='gold'?'border-left:3px solid var(--gold)':cullTier==='green'?'border-left:3px solid var(--green)':cullTier==='blue'?'border-left:3px solid var(--cyan)':'';

    const keeperLines=keepers.map(p=>{
      const nick=p.nickname||'';
      const nickEscAttr=nick.replace(/"/g,'&quot;');
      return `<div style="font-size:11px;color:var(--muted);padding-left:4px;margin-top:2px">
        <span style="color:${p.isMlPlaceholder?'var(--muted)':'var(--gold)'}">${p.isMlPlaceholder?'☆':'★'}</span>
        ${esc(p.name)} CP:${p.cp}
        ${nick?`<span style="font-family:monospace;color:${p.isMlPlaceholder?'var(--muted)':'var(--green)'};cursor:pointer" data-nick="${nickEscAttr}" onclick="copyNick(this,this.dataset.nick)" title="Click to copy">${esc(nick)}</span>`:''}
        ${p.isMlPlaceholder?'<span style="font-size:9px;color:var(--dim)">(ML placeholder)</span>':''}
      </div>`;
    }).join('');

    return `<div style="padding:8px 16px;border-bottom:1px solid var(--border)${cullBorderStyle?';'+cullBorderStyle:''}">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span data-name="${nameEsc}" onclick="navigateToFamily(this.dataset.name)" style="font-weight:700;font-size:13px;cursor:pointer;color:var(--cyan)" title="View family in main list">${esc(fam.primaryName)}</span>
        <span style="color:var(--muted);font-size:11px">${fam.members.length}</span>
        <span style="font-size:11px">: <span style="color:var(--red)">${redCount}★</span> &nbsp;<span style="color:var(--gold)">${luckyCount}🍀</span>&nbsp; <span style="color:var(--muted)">${unstarredCount}🗑</span></span>
        <button class="copy-search-btn" data-copy="${searchEsc}" onclick="copyGoSearch(this.dataset.copy,this)" title="Copy GO search — whole family">🔍 Fam</button>
      </div>
      ${keeperLines}
    </div>`;
  }).join('');

  body.innerHTML=rows;
  modal.style.display='flex';
}

function navigateToFamily(name){
  closeCullModal();
  const box=document.getElementById('searchBox');
  if(box){box.value=name;box.dispatchEvent(new Event('input'));}
}

function closeCullModal(){
  document.getElementById('cull-modal').style.display='none';
}

// ── Merge candidates modal ────────────────────
function openMergeModal(scrollToKey){
  if(!allPokemon.length){alert('Load your collection first');return;}
  const modal=document.getElementById('merge-modal');
  const body=document.getElementById('merge-modal-body');
  const sub=document.getElementById('merge-modal-sub');

  const candidates=findMergeCandidates(families);

  sub.textContent=candidates.length
    ? candidates.length+' potential merge group'+(candidates.length===1?'':'s')+' found'
    : 'No merge candidates found';

  if(!candidates.length){
    body.innerHTML='<div class="pv-modal-empty">No merge candidates found — all same-IV family members either have different IVs or both have catch dates</div>';
    modal.style.display='flex';
    return;
  }

  const rows=candidates.map((cand,i)=>{
    const sorted=[...cand.members].sort((a,b)=>{
      const da=a.originalScanDate||'9999';
      const db=b.originalScanDate||'9999';
      return da.localeCompare(db);
    });

    const famEsc=esc(cand.family); // esc() is safe in both the data-attr and the visible "<fam> family" text node
    const memberRows=sorted.map(p=>{
      const iv=`${p.atkIV}/${p.defIV}/${p.staIV}`;
      const catchStr=p.catchDate||'<span style="color:var(--gold)">no date</span>';
      const origStr=p.originalScanDate||'—';
      const searchStr=(p.name.toLowerCase()+'&cp'+(p.cp||0)).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
      return `<div style="padding:3px 0 3px 12px">
        <button class="merge-copy-btn" data-search="${searchStr}" onclick="event.stopPropagation();copyGoSearch(this.dataset.search,this)" title="Copy GO search: ${searchStr}"><span style="font-weight:700;font-size:12px">${esc(p.name)} CP:${p.cp} ${iv}</span></button>
        <div style="font-size:9px;color:var(--muted);margin-top:1px">catch:${catchStr}&nbsp;&nbsp;orig:${origStr}</div>
      </div>`;
    }).join('');

    return `<div id="mg-${i}" style="padding:10px 16px;border-bottom:1px solid var(--border)">
      <div style="font-weight:700;font-size:13px;margin-bottom:4px"><a href="#" class="merge-fam-link" data-fam="${famEsc}" onclick="event.preventDefault();closeMergeModal();const b=document.getElementById('searchBox');if(b){b.value=this.dataset.fam;b.dispatchEvent(new Event('input'));}">${famEsc} family</a></div>
      ${memberRows}
    </div>`;
  }).join('');

  body.innerHTML=rows;
  modal.style.display='flex';

  if(scrollToKey){
    const idx=candidates.findIndex(c=>c.members.some(m=>m.stableKey===scrollToKey));
    if(idx>=0){
      const el=body.querySelector('#mg-'+idx);
      if(el) setTimeout(()=>el.scrollIntoView({block:'start',behavior:'smooth'}),50);
    }
  }
}

function closeMergeModal(){
  document.getElementById('merge-modal').style.display='none';
}

// ── Cleanup / Special modals ──────────────────
let cleanupSortMode='stable';
let cleanupFromDate='';
let cleanupToDate='';
let specialSortMode='date';
let specialFilterSpecies='';
let specialFromDate='';
let specialToDate='';
let specialIncludeMarked=false;

function getSortDate(p){return p.scanDate||p.catchDate||p.originalScanDate||'';}

// Converts "DD/MM/YYYY H:MM:SS AM/PM" (Pokégenie format) → "YYYY-MM-DDTHH:MM"
function parsePokegenieDate(s){
  if(!s||!s.trim()) return '';
  const t=s.trim();
  // YYYY-MM-DD HH:MM (Pokégenie scan date format)
  if(/^\d{4}-\d{2}-\d{2}/.test(t)) return t.replace(' ','T').slice(0,16);
  // DD/MM/YYYY H:MM:SS AM/PM (legacy catch date format)
  const m=t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?)?$/i);
  if(!m) return '';
  let [,d,mo,y,h='0',mn='0',ampm='']=m;
  h=parseInt(h); mn=parseInt(mn);
  if(ampm.toUpperCase()==='PM'&&h<12) h+=12;
  if(ampm.toUpperCase()==='AM'&&h===12) h=0;
  return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}T${String(h).padStart(2,'0')}:${String(mn).padStart(2,'0')}`;
}

function matchesDateRange(p,fromDate,toDate){
  const d=getSortDate(p);
  if(!d) return !(fromDate||toDate);
  const pDate=parsePokegenieDate(d);
  if(!pDate) return !(fromDate||toDate);
  if(fromDate&&pDate<fromDate) return false;
  if(toDate&&pDate>toDate) return false;
  return true;
}

function selectAllSpecial(field,checked){
  const map={
    shiny:{cls:'special-cb-shiny',prop:'isShiny',db:'is_shiny'},
    gmax: {cls:'special-cb-gmax', prop:'isGigantamax',db:'is_gigantamax'},
    dmax: {cls:'special-cb-dmax', prop:'isDynamax',   db:'is_dynamax'}
  };
  const {cls,prop,db}=map[field];
  document.querySelectorAll('.'+cls).forEach(cb=>{
    cb.checked=checked;
    const key=cb.dataset.key;
    setOverride(key,db,checked);
    const p=allPokemon.find(x=>x.stableKey===key);
    if(p) p[prop]=checked;
  });
}

function updateSelectAllHeader(field){
  const cls={shiny:'special-cb-shiny',gmax:'special-cb-gmax',dmax:'special-cb-dmax'}[field];
  const hid={shiny:'sa-shiny',gmax:'sa-gmax',dmax:'sa-dmax'}[field];
  const cbs=[...document.querySelectorAll('.'+cls)];
  if(!cbs.length) return;
  const n=cbs.filter(c=>c.checked).length;
  const h=document.getElementById(hid);
  if(!h) return;
  h.checked=n===cbs.length;
  h.indeterminate=n>0&&n<cbs.length;
}

function openCleanupModal(){
  if(!allPokemon.length){alert('Load your collection first');return;}
  const modal=document.getElementById('cleanup-modal');
  const body=document.getElementById('cleanup-modal-body');
  const sub=document.getElementById('cleanup-modal-sub');

  const NEEDS_FORM=new Set(Object.keys(FORM_DROPDOWNS||{}));
  const searchRow=document.getElementById('cleanup-search-row');
  if(searchRow) searchRow.style.display='';
  const cleanupSearchTerm=(document.getElementById('cleanupSearch')?.value||'').toLowerCase();

  const formIsSet=p=>(p.specialForm&&p.specialForm!=='Unknown')||(p.vivillonPattern&&p.vivillonPattern!=='Unknown');
  const needsForm=allPokemon.filter(p=>NEEDS_FORM.has(p.name)&&!formIsSet(p)
      &&matchesDateRange(p,cleanupFromDate,cleanupToDate)
      &&(!cleanupSearchTerm||p.name.toLowerCase().includes(cleanupSearchTerm)))
    .sort((a,b)=>{
      if(cleanupSortMode==='cp') return (b.cp||0)-(a.cp||0);
      if(cleanupSortMode==='iv') return (b.ivAvg||0)-(a.ivAvg||0);
      if(a.catchDate&&!b.catchDate) return -1;
      if(!a.catchDate&&b.catchDate) return 1;
      return a.name.localeCompare(b.name);
    });

  const totalNeedsForm=allPokemon.filter(p=>NEEDS_FORM.has(p.name)&&!formIsSet(p)
      &&matchesDateRange(p,cleanupFromDate,cleanupToDate)).length;
  const dateActive=cleanupFromDate||cleanupToDate;
  sub.textContent=(cleanupSearchTerm?needsForm.length+' of '+totalNeedsForm:needsForm.length)+' Pokémon need form/pattern set'
    +(dateActive?' in date range':' ('+needsForm.filter(p=>p.catchDate).length+' with stable IDs)');

  const clearBtnStyle=`background:none;border:1px solid var(--border);border-radius:4px;padding:2px 8px;color:var(--muted);cursor:pointer;font-size:11px`;
  const sortBtns=`<div style="display:flex;gap:6px;margin-bottom:4px;font-size:11px;flex-wrap:wrap;align-items:center">
    <span style="color:var(--muted)">Sort:</span>
    <button onclick="cleanupSortMode='stable';openCleanupModal()" style="background:${cleanupSortMode==='stable'?'var(--cyan)':'none'};border:1px solid var(--border);border-radius:4px;padding:2px 8px;color:${cleanupSortMode==='stable'?'#000':'var(--muted)'};cursor:pointer;font-size:11px">Stable ID</button>
    <button onclick="cleanupSortMode='cp';openCleanupModal()" style="background:${cleanupSortMode==='cp'?'var(--cyan)':'none'};border:1px solid var(--border);border-radius:4px;padding:2px 8px;color:${cleanupSortMode==='cp'?'#000':'var(--muted)'};cursor:pointer;font-size:11px">CP ↓</button>
    <button onclick="cleanupSortMode='iv';openCleanupModal()" style="background:${cleanupSortMode==='iv'?'var(--cyan)':'none'};border:1px solid var(--border);border-radius:4px;padding:2px 8px;color:${cleanupSortMode==='iv'?'#000':'var(--muted)'};cursor:pointer;font-size:11px">IV% ↓</button>
  </div>
  <div class="mark-special-date-row">
    <span>From:</span>
    <input type="datetime-local" value="${cleanupFromDate}" onchange="cleanupFromDate=this.value;openCleanupModal()">
    <span>To:</span>
    <input type="datetime-local" value="${cleanupToDate}" onchange="cleanupToDate=this.value;openCleanupModal()">
    <button onclick="cleanupFromDate='';cleanupToDate='';openCleanupModal()" style="${clearBtnStyle}">Clear</button>
  </div>`;

  body.innerHTML=!needsForm.length
    ? sortBtns+'<div class="pv-modal-empty">All forms already set! ✓</div>'
    : sortBtns+needsForm.map(p=>{
        const opts=(FORM_DROPDOWNS[p.name]||[]).map(f=>`<option value="${f}" ${p.specialForm===f?'selected':''}>${f}</option>`).join('');
        const stableTag=p.catchDate
          ?`<span style="color:var(--green);font-size:9px">✓ stable ID</span>`
          :`<span style="color:var(--red);font-size:9px">⚠ no catch date</span>`;
        const cleanNick=p.nickname||'';
        const cleanNickEsc=cleanNick.replace(/"/g,'&quot;');
        const cleanNameEsc=p.name.replace(/"/g,'&quot;');
        return `<div class="pv-modal-row">
          <div class="pv-modal-info">
            <div class="pv-modal-name"><a href="#" data-name="${cleanNameEsc}" onclick="event.preventDefault();cleanupNavigate(this.dataset.name)" style="color:inherit;text-decoration:underline;cursor:pointer">${esc(p.name)}</a></div>
            <div class="pv-modal-meta">CP:${p.cp} · ${Math.round(p.ivAvg)}% IV${cleanNick?` · <span style="font-family:monospace;color:var(--green);cursor:pointer" data-nick="${cleanNickEsc}" onclick="copyNick(this,this.dataset.nick)" title="Click to copy nick">${esc(cleanNick)}</span>`:''} · ${p.catchDate||'no catch date'} · ${stableTag}</div>
          </div>
          <div class="pv-modal-controls">
            <select class="pv-modal-select" onchange="setOverride('${p.stableKey}','special_form',this.value);allPokemon.find(x=>x.stableKey==='${p.stableKey}').specialForm=this.value;">${opts}</select>
          </div>
        </div>`;
      }).join('');
  modal.classList.add('open');
}

function closeCleanupModal(){
  document.getElementById('cleanup-modal').classList.remove('open');
  const si=document.getElementById('cleanupSearch'); if(si) si.value='';
}

function cleanupNavigate(name){
  closeCleanupModal();
  const box=document.getElementById('searchBox');
  if(box) box.value=name;
  searchTerm=name.toLowerCase();
  applyFilters();
  document.getElementById('searchClear')?.classList.add('visible');
}

function openSpecialModal(){
  if(!allPokemon.length){alert('Load your collection first');return;}
  const modal=document.getElementById('special-modal');
  const body=document.getElementById('special-modal-body');
  const sub=document.getElementById('special-modal-sub');

  const allSpeciesWithCounts={};
  allPokemon.filter(p=>specialIncludeMarked||(!p.isShiny&&!p.isDynamax&&!p.isGigantamax&&!p.isCostumed))
    .forEach(p=>{allSpeciesWithCounts[p.name]=(allSpeciesWithCounts[p.name]||0)+1;});
  const speciesList=Object.entries(allSpeciesWithCounts).filter(([,c])=>c>=5)
    .sort((a,b)=>a[0].localeCompare(b[0])).map(([n])=>n);

  const candidates=allPokemon
    .filter(p=>{
      if(!specialIncludeMarked&&(p.isShiny||p.isDynamax||p.isGigantamax||p.isCostumed)) return false;
      if(specialFilterSpecies&&p.name!==specialFilterSpecies) return false;
      return matchesDateRange(p,specialFromDate,specialToDate);
    })
    .sort((a,b)=>{
      if(specialSortMode==='cp') return (b.cp||0)-(a.cp||0);
      if(specialSortMode==='iv') return (b.ivAvg||0)-(a.ivAvg||0);
      return getSortDate(b).localeCompare(getSortDate(a));
    }).slice(0,200);

  const dateActive=specialFromDate||specialToDate;
  sub.textContent=dateActive
    ? `${candidates.length} Pokémon in date range${specialIncludeMarked?' (including already marked)':''}`
    : specialIncludeMarked
      ? 'Newest 200 Pokémon (including already marked)'
      : 'Newest 200 unmarked Pokémon — tick any that are Shiny, Gigantamax or Dynamax';

  const speciesOpts=['<option value="">All species</option>',
    ...speciesList.map(n=>`<option value="${n}" ${specialFilterSpecies===n?'selected':''}>${n} (${allSpeciesWithCounts[n]})</option>`)
  ].join('');

  const btnStyle=(active)=>`background:${active?'var(--cyan)':'none'};border:1px solid var(--border);border-radius:4px;padding:2px 8px;color:${active?'#000':'var(--muted)'};cursor:pointer;font-size:11px`;
  const clearBtnStyle=`background:none;border:1px solid var(--border);border-radius:4px;padding:2px 8px;color:var(--muted);cursor:pointer;font-size:11px`;

  const controls=`<div style="display:flex;gap:6px;margin-bottom:4px;font-size:11px;flex-wrap:wrap;align-items:center">
    <select onchange="specialFilterSpecies=this.value;openSpecialModal()" style="background:var(--surf2);border:1px solid var(--border);border-radius:4px;padding:3px 6px;color:var(--text);font-size:11px;cursor:pointer">${speciesOpts}</select>
    <span style="color:var(--muted);margin-left:4px">Sort:</span>
    <button onclick="specialSortMode='date';openSpecialModal()" style="${btnStyle(specialSortMode==='date')}">Newest</button>
    <button onclick="specialSortMode='cp';openSpecialModal()" style="${btnStyle(specialSortMode==='cp')}">CP ↓</button>
    <button onclick="specialSortMode='iv';openSpecialModal()" style="${btnStyle(specialSortMode==='iv')}">IV% ↓</button>
  </div>
  <div class="mark-special-date-row">
    <span>From:</span>
    <input type="datetime-local" value="${specialFromDate}" onchange="specialFromDate=this.value;openSpecialModal()">
    <span>To:</span>
    <input type="datetime-local" value="${specialToDate}" onchange="specialToDate=this.value;openSpecialModal()">
    <button onclick="specialFromDate='';specialToDate='';openSpecialModal()" style="${clearBtnStyle}">Clear</button>
    <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text);cursor:pointer;margin-left:8px">
      <input type="checkbox" id="includeMarkedToggle" ${specialIncludeMarked?'checked':''} onchange="specialIncludeMarked=this.checked;openSpecialModal()">
      Include already marked
    </label>
  </div>`;

  const selectAllRow=`<div class="pv-modal-row" style="border-bottom:2px solid var(--border);padding-bottom:6px;margin-bottom:2px">
    <div class="pv-modal-info" style="color:var(--muted);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Select all</div>
    <div class="pv-modal-controls">
      <label class="pv-modal-cb"><input type="checkbox" id="sa-shiny" onchange="selectAllSpecial('shiny',this.checked)"> ✨ Shiny</label>
      <label class="pv-modal-cb"><input type="checkbox" id="sa-gmax" onchange="selectAllSpecial('gmax',this.checked)"> Gmax</label>
      <label class="pv-modal-cb"><input type="checkbox" id="sa-dmax" onchange="selectAllSpecial('dmax',this.checked)"> Dmax</label>
    </div>
  </div>`;

  body.innerHTML=!candidates.length
    ? controls+`<div class="pv-modal-empty">No ${specialIncludeMarked?'':'unmarked '}Pokémon found</div>`
    : controls+selectAllRow+candidates.map(p=>{
        const isCostumable=COSTUME_SPECIES&&COSTUME_SPECIES.has(p.name);
        const displayDate=getSortDate(p)||'no date';
        const specNick=p.nickname||'';
        const specNickEsc=specNick.replace(/"/g,'&quot;');
        return `<div class="pv-modal-row">
          <div class="pv-modal-info">
            <div class="pv-modal-name"><a href="#" data-name="${p.name.replace(/"/g,'&quot;')}" onclick="event.preventDefault();specialNavigate(this.dataset.name)" style="color:inherit;text-decoration:underline;cursor:pointer">${esc(p.name)}</a></div>
            <div class="pv-modal-meta">CP:${p.cp} · ${Math.round(p.ivAvg)}% IV${specNick?` · <span style="font-family:monospace;color:var(--green);cursor:pointer" data-nick="${specNickEsc}" onclick="copyNick(this,this.dataset.nick)" title="Click to copy nick">${esc(specNick)}</span>`:''} · ${displayDate}</div>
          </div>
          <div class="pv-modal-controls">
            <label class="pv-modal-cb"><input type="checkbox" class="special-cb-shiny" data-key="${p.stableKey}" ${p.isShiny?'checked':''} onchange="setOverride('${p.stableKey}','is_shiny',this.checked);allPokemon.find(x=>x.stableKey==='${p.stableKey}').isShiny=this.checked;updateSelectAllHeader('shiny')"> ✨ Shiny</label>
            <label class="pv-modal-cb"><input type="checkbox" class="special-cb-gmax" data-key="${p.stableKey}" ${p.isGigantamax?'checked':''} onchange="setOverride('${p.stableKey}','is_gigantamax',this.checked);allPokemon.find(x=>x.stableKey==='${p.stableKey}').isGigantamax=this.checked;updateSelectAllHeader('gmax')"> Gmax</label>
            <label class="pv-modal-cb"><input type="checkbox" class="special-cb-dmax" data-key="${p.stableKey}" ${p.isDynamax?'checked':''} onchange="setOverride('${p.stableKey}','is_dynamax',this.checked);allPokemon.find(x=>x.stableKey==='${p.stableKey}').isDynamax=this.checked;updateSelectAllHeader('dmax')"> Dmax</label>
            ${isCostumable?`<label class="pv-modal-cb"><input type="checkbox" ${p.isCostumed?'checked':''} onchange="setOverride('${p.stableKey}','is_costumed',this.checked);allPokemon.find(x=>x.stableKey==='${p.stableKey}').isCostumed=this.checked;"> 🎃 Costume</label>`:''}
          </div>
        </div>`;
      }).join('');
  modal.classList.add('open');
}

function closeSpecialModal(){document.getElementById('special-modal').classList.remove('open');}

function specialNavigate(name){
  closeSpecialModal();
  const box=document.getElementById('searchBox');
  if(box) box.value=name;
  searchTerm=name.toLowerCase();
  applyFilters();
  document.getElementById('searchClear')?.classList.add('visible');
}

// ═══════════════════════════════════════════════
// COPY SUGGESTED NICKS
// ═══════════════════════════════════════════════

function processCloudRows(rows) {
  // #41 — row→CSV reconstruction lives in supabase.js (cloudRowToCsvRow) so it is a pure,
  // unit-testable function and stays co-located with the inverse save mapping. It now also
  // restores Form (G/U/L) from evolved_form_* (previously hardcoded '' here, which dropped
  // the #39 form-aware nick on every cloud load).
  const csvRows = rows.map((r, i) => cloudRowToCsvRow(r, i));
  // Task 3: count verification — warn if loaded count is much lower than last save
  const lastCount = parseInt(localStorage.getItem('pokevault_last_cloud_save_count') || '0', 10);
  if (lastCount && rows.length < lastCount * 0.9) {
    showToast(`⚠ Only ${rows.length.toLocaleString()} Pokémon loaded — expected ~${lastCount.toLocaleString()}. Your last save may be incomplete.`, 8000);
  }

  document.getElementById('upload-section').style.display='none';
  document.getElementById('loading-section').style.display='block';
  setProgress('ANALYSING CLOUD DATA...', 45);
  setTimeout(()=>{
    try {
      const result = analyse(csvRows);
      allPokemon = result.pokemon;
      families = result.families;
      filteredFamilies = families.slice();
      mergeCandidateKeys = new Set(findMergeCandidates(families).flatMap(c=>c.members.map(m=>m.stableKey)));
      if(currentNickConvention!=='pvpvault') allPokemon.forEach(p=>{p.nickname=buildNickname(p,getNickSlot(p),currentNickConvention);});
      setProgress('BUILDING DISPLAY...', 88);
      setTimeout(()=>{
        setLoadInProgress(false);
        document.getElementById('loading-section').style.display='none';
        document.getElementById('dashboard').style.display='block';
        renderSummary(allPokemon); applyFilters();
        trackEvent('cloud_load', { pokemon_count: allPokemon.length });
        if (initialHash && initialHash !== '#' && initialHash !== '') {
          history.replaceState(null, '', initialHash);
          initialHash = '';
        }
        applyHashState();
        // F3: cloud loads have no filename of their own — restore the last persisted
        // CSV name as the collection's provenance (null → label stays hidden).
        setCsvFilename(localStorage.getItem('pokevault_last_csv'));
        document.getElementById('searchBox').addEventListener('input',ev=>{searchTerm=ev.target.value.toLowerCase();applyFilters();trackSearchDebounced(searchTerm);document.getElementById('searchClear')?.classList.toggle('visible',ev.target.value.length>0);});
        document.getElementById('evoToggle').addEventListener('change',()=>applyFilters());
        loadOverrides();
        clearIncompleteWarningIfHealthy(rows.length);
      },50);
    } catch(err) {
      setLoadInProgress(false);
      showError('Cloud load failed', err.message);
    }
  },80);
}

async function handleCloudLoad() {
  setLoadInProgress(true);
  const btn = document.getElementById('cloudLoadBtn');
  const status = document.getElementById('cloud-load-status');
  if (btn) { btn.disabled=true; btn.textContent='Loading...'; }
  const rows = await loadCollectionFromCloud();
  if (!rows) {
    setLoadInProgress(false);
    if (status) status.textContent = 'No cloud data found. Import a CSV first.';
    if (btn) { btn.disabled=false; btn.textContent='☁ Load last collection from cloud'; }
    return;
  }
  processCloudRows(rows);
}

async function autoLoadFromCloud() {
  setLoadInProgress(true);
  const status = document.getElementById('cloud-load-status');
  if (status) status.textContent = 'Checking for latest collection...';
  const rows = await loadCollectionFromCloud();
  if (!rows) {
    setLoadInProgress(false);
    if (status) status.textContent = '';
    return;
  }
  processCloudRows(rows);
  // Show the "try with your own CSV" bar for visitors who aren't signed in
  const userId = await getCurrentUserId();
  if (!userId) {
    const bar = document.getElementById('anon-import-bar');
    if (bar) bar.style.display = 'flex';
  }
}

function toggleOverride(idx) {
  const row = document.getElementById('ov-'+idx);
  if (row) row.style.display = row.style.display === 'none' ? '' : 'none';
  else console.warn('toggleOverride: no row found for', idx);
}

function setOverride(idx, field, value) {
  const p = allPokemon.find(x => x.stableKey === idx);
  if (!p) { console.warn('setOverride: no pokemon found for stableKey', idx); return; }
  // Update local
  const fieldMap = {is_shiny:'isShiny',is_dynamax:'isDynamax',is_gigantamax:'isGigantamax',
    is_costumed:'isCostumed',vivillon_pattern:'vivillonPattern',special_form:'specialForm',manual_decision:'manualDecision',notes:'notes'};
  if (fieldMap[field]) p[fieldMap[field]] = value;
  // If manual decision, update display
  if (field === 'manual_decision' && value) {
    p.decision = value;
    const tr = document.querySelector(`tr[data-idx="${p.idx}"]`);
    if (tr) { tr.className = `row-${value}${p.isHundo?' row-hundo':''}`; }
  }
  // If shiny, update star
  if (field === 'is_shiny') {
    p.suggestStar = p.suggestStar || value;
  }
  // Recalculate suggestStar since shiny/decision may have changed
  if (field === 'is_shiny' || field === 'manual_decision') {
    p.suggestStar = (
      (p.decision==='keep' && (
        (p.slots||[]).some(s=>['L','G','U','M'].includes(s)) ||
        (p.slots||[]).includes('lucky') ||
        p.isShiny ||
        (p.slots||[]).includes('nundo') ||
        (p.slots||[]).includes('shadow') ||
        (p.slots||[]).includes('purified')
      )) ||
      (p.decision==='protected') ||
      p.isLucky
    );
  }
  // Rebuild nick when shiny/dynamax/gigantamax/form fields change
  const NICK_FIELDS = new Set(['is_shiny','is_dynamax','is_gigantamax','special_form','vivillon_pattern']);
  if (NICK_FIELDS.has(field)) {
    if (field === 'is_shiny' && value && !(p.slots||[]).includes('shiny')) p.slots.push('shiny');
    const slots = p.slots || [];
    const lgSlots = slots.filter(s => ['L','G','U','M'].includes(s));
    let ns;
    if (slots.includes('nundo')) ns = 'nundo';
    else if (lgSlots.length > 0) {
      const capped = lgSlots.filter(s => s !== 'M');
      ns = capped.length > 0 ? capped.sort((a,b)=>(p['rankPct'+b]||0)-(p['rankPct'+a]||0))[0] : 'M';
    } else if (slots.includes('shiny') || slots.includes('shiny_lower')) ns = 'shiny';
    else if (slots.includes('lucky')) { const ll=['U','G','L','M'].find(l=>(p['rankPct'+l]||0)>=90); ns=ll||'M'; }
    else ns = 'review';
    const suggested = buildNickname(p, ns);
    // Re-apply any nick override on top of the recomputed suggested nick so toggling
    // shiny/dmax/etc. doesn't silently discard a user's custom nick.
    const ovNick = (typeof overridesCache !== 'undefined') ? overridesCache[p.stableKey] : null;
    if (typeof applyNickOverride === 'function') applyNickOverride(p, ovNick, suggested);
    else p.nickname = suggested;
  }
  // Re-render this row so star colour, nick, and decision badge update immediately
  const tr = document.querySelector(`tr[data-idx="${p.idx}"]`);
  if (tr) {
    const iv = Math.round(p.ivAvg||0);
    // Update star cell
    const starTd = tr.querySelector('td:first-child');
    if (starTd) starTd.innerHTML = starCell(p);
    // Update decision class on row
    tr.className = `row-${p.decision}${p.isHundo?' row-hundo':''}`;
    // Update decision badge
    const decTd = tr.cells[13];
    if (decTd) decTd.innerHTML = decBadge(p.decision);
    // Update variant tags (shiny badge)
    const nameTd = tr.cells[1];
    if (nameTd) {
      const vt = nameTd.querySelector('.poke-variants');
      if (vt) vt.innerHTML = variantTags(p);
    }
    // Update nick cell when nick was rebuilt (re-renders the full cell so the
    // override indicator / reset affordance stay in sync with the new structure).
    if (NICK_FIELDS.has(field)) rerenderNickCell(p);
  }
  // Save to Supabase
  saveOverride(idx, {[field]: value});
  updateSyncStatus('Saving...', 'ok');
  // Update summary counts
  if (allPokemon.length) renderSummary(allPokemon);
}

async function clearOverride(idx) {
  const p = allPokemon.find(x => x.stableKey === idx);
  if (!p) return;
  p.isShiny = false; p.isDynamax = false; p.isGigantamax = false;
  p.vivillonPattern = ''; p.manualDecision = ''; p.notes = '';
  // Clearing all overrides also drops any nick override → restore suggested nick.
  if (p.nickOverridden && typeof applyNickOverride === 'function') {
    applyNickOverride(p, null, p.suggestedNickname);
    if (typeof rerenderNickCell === 'function') rerenderNickCell(p);
  }
  await deleteOverride(idx);
  updateSyncStatus('✓ Cleared', 'ok');
  if (allPokemon.length) renderSummary(allPokemon);
}

function copyGoSearch(search, btn) {
  const orig=btn.innerHTML;
  const done=()=>{ btn.innerHTML='✓'; btn.style.color='var(--green)'; setTimeout(()=>{ btn.innerHTML=orig; btn.style.color=''; }, 1500); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(search).then(done).catch(()=>fallbackCopy(search,done));
  } else {
    fallbackCopy(search, done);
  }
}
function fallbackCopy(text, cb) {
  const ta=document.createElement('textarea');
  ta.value=text; ta.style.position='fixed'; ta.style.top='0'; ta.style.left='0';
  ta.style.opacity='0'; ta.setAttribute('readonly','');
  document.body.appendChild(ta); ta.focus(); ta.select();
  try { document.execCommand('copy'); } catch(e) {}
  document.body.removeChild(ta);
  if(cb) cb();
}

function copyNick(el, text) {
  navigator.clipboard.writeText(text).catch(()=>{
    const ta=document.createElement('textarea');
    ta.value=text; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
  });
  showToast('Copied!');
  // PII redaction: send only a shape descriptor, never the raw nick.
  trackEvent('nick_copy', buildNickShape(text));
  const orig = el.textContent;
  el.textContent = '✓ Copied!';
  el.style.color = 'var(--green)';
  setTimeout(()=>{ el.textContent=orig; el.style.color=''; }, 1500);
}

// ═══════════════════════════════════════════════
// NICK OVERRIDE — inline editing
// ═══════════════════════════════════════════════
// Pure decision helper for the edit input's keydown: Enter commits, Esc cancels.
// Extracted so the lifecycle is unit-testable without a DOM.
function nickEditKey(key, value) {
  if (key === 'Enter') return { action: 'commit', value };
  if (key === 'Escape' || key === 'Esc') return { action: 'cancel' };
  return { action: 'none' };
}

// Tap the nick → swap the displayed span for a controlled <input>. Enter/blur commits,
// Esc reverts. A controlled input (never contenteditable) keeps user text inert — the
// value is only ever read as a string and re-rendered through esc(), so no XSS path.
function beginNickEdit(stableKey, cellEl) {
  if (!cellEl || cellEl.querySelector('.nick-edit-input')) return; // already editing
  const p = allPokemon.find(x => x.stableKey === stableKey);
  if (!p) return;
  const span = cellEl.querySelector('.main-nick');
  const current = (p.nickname != null) ? p.nickname : '';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'nick-edit-input';
  input.value = current;
  input.maxLength = (typeof MAX_NICK_LENGTH !== 'undefined') ? MAX_NICK_LENGTH : 64;
  let done = false;
  input.addEventListener('keydown', (e) => {
    const r = nickEditKey(e.key, input.value);
    if (r.action === 'commit') { e.preventDefault(); done = true; commitNickEdit(stableKey, r.value); }
    else if (r.action === 'cancel') { e.preventDefault(); done = true; cancelNickEdit(stableKey); }
  });
  input.addEventListener('blur', () => { if (!done) { done = true; commitNickEdit(stableKey, input.value); } });
  if (span) span.replaceWith(input); else cellEl.appendChild(input);
  input.focus();
  input.select();
}

async function commitNickEdit(stableKey, value) {
  // Trim + cap on the client (defense-in-depth; saveNickOverride clamps again at write).
  const clean = (typeof clampNick === 'function') ? clampNick(value) : String(value == null ? '' : value).trim().slice(0, 64);
  const ok = await saveNickOverride(stableKey, clean);
  const p = allPokemon.find(x => x.stableKey === stableKey);
  if (p) rerenderNickCell(p);
  return ok;
}

function cancelNickEdit(stableKey) {
  // No write — just re-render the cell from current state.
  const p = allPokemon.find(x => x.stableKey === stableKey);
  if (p) rerenderNickCell(p);
}

async function resetNick(stableKey) {
  // Clear the override (null), restoring the suggested nick.
  const ok = await saveNickOverride(stableKey, null);
  const p = allPokemon.find(x => x.stableKey === stableKey);
  if (p) rerenderNickCell(p);
  return ok;
}

// Re-render just the nick cell for a Pokémon after an edit. Null-safe (no-op when
// the row isn't in the DOM, e.g. in tests).
function rerenderNickCell(p) {
  if (typeof document === 'undefined') return;
  const tr = document.querySelector(`tr[data-idx="${p.idx}"]`);
  if (!tr || typeof buildRow !== 'function') return;
  const tmp = document.createElement('tbody');
  tmp.innerHTML = buildRow(p);
  const newTr = tmp.children[0];
  const newNick = newTr && newTr.cells ? newTr.cells[3] : null;
  if (newNick && tr.cells && tr.cells[3]) tr.cells[3].replaceWith(newNick);
}

function copyNicks(famKey, btnEl) {
  const fam = families.find(f => f.key === famKey);
  if (!fam) return;
  const starred = fam.members.filter(p => p.suggestStar && !p.hidden);
  if (!starred.length) { btnEl.textContent = 'None starred'; return; }
  const lines = starred.map(p => p.name+' '+(p.cp||'?')+'\n'+p.nickname).join('\n\n');
  navigator.clipboard.writeText(lines).then(() => {
    btnEl.textContent = '✓ Copied!';
    btnEl.classList.add('copied');
    setTimeout(() => { btnEl.textContent = '⎘ Copy nicks'; btnEl.classList.remove('copied'); }, 2000);
  }).catch(() => {
    // Fallback for browsers that block clipboard
    const ta = document.createElement('textarea');
    ta.value = lines; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    btnEl.textContent = '✓ Copied!'; btnEl.classList.add('copied');
    setTimeout(() => { btnEl.textContent = '⎘ Copy nicks'; btnEl.classList.remove('copied'); }, 2000);
  });
}

// ═══════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════
function exportCSV(){
  trackEvent('export_click');
  const h=['Family','Name','Form','CP','SuggestedNickname','Decision','Reason','Slots','TargetEvo',
    'IV%','Atk/Def/Sta','Level','LittleRank%','GreatRank%','UltraRank%','MasterIV%',
    'DustCost','QuickMove','ChargeMove1','ChargeMove2','TMNotes',
    'Lucky','Shadow','Purified','Shiny','Favorite','PvPTag','CatchDate','PokeType'];
  const rows=[];
  filteredFamilies.forEach(fam=>fam.members.forEach(p=>rows.push([
    fam.primaryName,p.name,p.form,p.cp,p.nickname,p.decision,p.reason,p.slots.join('|'),p.targetEvo,
    Math.round(p.ivAvg||0),`${p.atkIV}/${p.defIV}/${p.staIV}`,p.level,
    p.rankPctL||'',p.rankPctG||'',p.rankPctU||'',Math.round(p.rankPctM||0),
    p.dustCostBest||'',p.quickMove,p.chargeMove1,p.chargeMove2,
    (p.moveNotes||[]).join(' | '),
    p.isLucky?1:0,p.isShadow?1:0,p.isPurified?1:0,p.isShiny?1:0,p.isFavorite?1:0,
    p.pvpTag,p.catchDate,p.pokeType||''
  ])));
  const csv=[h,...rows].map(r=>r.map(v=>`"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download='pokevault_v3_analysis.csv';a.click();
}

// ═══════════════════════════════════════════════
// CSV PARSER
// ═══════════════════════════════════════════════
function parseCSV(text){
  const lines=text.split(/\r?\n/);
  const headers=parseLine(lines[0]);
  // Strip UTF-8 BOM from first header — iOS Safari FileReader prepends
  // which makes the first column key unreadable (e.g. "﻿Index" not "Index")
  headers[0]=headers[0].replace(/^﻿/,'');
  const out=[];
  for(let i=1;i<lines.length;i++){
    if(!lines[i].trim()) continue;
    const vals=parseLine(lines[i]);
    const obj={};
    headers.forEach((h,idx)=>obj[h.trim()]=(vals[idx]||'').trim());
    out.push(obj);
  }
  return out;
}
function parseLine(line){
  const r=[];let cur='',inQ=false;
  for(let i=0;i<line.length;i++){
    if(line[i]==='"')inQ=!inQ;
    else if(line[i]===','&&!inQ){r.push(cur);cur='';}
    else cur+=line[i];
  }
  r.push(cur);return r;
}

// ═══════════════════════════════════════════════
// FILE HANDLING
// ═══════════════════════════════════════════════
function showError(msg,detail){
  document.getElementById('loading-section').style.display='none';
  document.getElementById('error-section').style.display='block';
  document.getElementById('error-msg').textContent=msg;
  document.getElementById('error-detail').textContent=detail||'';
}
function setProgress(msg,pct){
  const m=document.getElementById('loading-msg'),b=document.getElementById('progress-fill');
  if(m)m.textContent=msg;if(b)b.style.width=pct+'%';
}

function handleFile(file){
  if(loadInProgress){showToast('Still loading your collection — please wait a moment.');return;}
  setLoadInProgress(true);
  if(!file.name.toLowerCase().endsWith('.csv')){setLoadInProgress(false);showError('Wrong file type',`Expected .csv, got: ${file.name}`);return;}
  const MAX_MB=10;
  if(file.size>MAX_MB*1024*1024){setLoadInProgress(false);showToast(`File too large (${(file.size/1024/1024).toFixed(1)}MB) — max ${MAX_MB}MB. Pokégenie exports are typically under 5MB.`);return;}
  document.getElementById('upload-section').style.display='none';
  document.getElementById('loading-section').style.display='block';
  const watchdog=setTimeout(()=>{setLoadInProgress(false);showError('Timed out after 60s','The file may be too large for this device. Try cleaning up Pokégenie first and re-exporting a smaller file.');},60000);
  const reader=new FileReader();
  reader.onerror=()=>{setLoadInProgress(false);showError('Could not read file','FileReader error');};
  reader.onload=e=>{
    setProgress('PARSING CSV...',20);
    setTimeout(()=>{
      try{
        const text=e.target.result;
        if(!text?.trim()) throw new Error('File is empty');
        const rows=parseCSV(text);
        if(!rows.length) throw new Error('No rows found');
        if(!rows[0].hasOwnProperty('IV Avg')) throw new Error('Not a Pokégenie export — missing expected columns');
        setProgress(`ANALYSING ${rows.length.toLocaleString()} POKÉMON...`,45);
        setTimeout(()=>{
          try{
            console.time('analyse'); const result=analyse(rows); console.timeEnd('analyse');
            allPokemon=result.pokemon;families=result.families;filteredFamilies=families.slice();
            mergeCandidateKeys=new Set(findMergeCandidates(families).flatMap(c=>c.members.map(m=>m.stableKey)));
            if(currentNickConvention!=='pvpvault') allPokemon.forEach(p=>{p.nickname=buildNickname(p,getNickSlot(p),currentNickConvention);});
            setProgress('BUILDING DISPLAY...',88);
            setTimeout(()=>{
              clearTimeout(watchdog);
              setLoadInProgress(false);
              document.getElementById('loading-section').style.display='none';
              document.getElementById('dashboard').style.display='block';
              renderSummary(allPokemon);applyFilters();
              trackEvent('csv_upload', { pokemon_count: allPokemon.length });
              if (initialHash && initialHash !== '#' && initialHash !== '') {
                history.replaceState(null, '', initialHash);
                initialHash = '';
              }
              applyHashState();
              setCsvFilename(file.name); // F3: persist + show the loaded CSV name
              loadOverrides();
              handleCloudSave(allPokemon);  // guards on auth internally
              document.getElementById('searchBox').addEventListener('input',ev=>{searchTerm=ev.target.value.toLowerCase();applyFilters();trackSearchDebounced(searchTerm);document.getElementById('searchClear')?.classList.toggle('visible',ev.target.value.length>0);});
              document.getElementById('evoToggle').addEventListener('change',()=>applyFilters());
            },50);
          }catch(err){clearTimeout(watchdog);setLoadInProgress(false);showError('Analysis failed',err.message+'\n'+(err.stack||'').split('\n').slice(0,3).join('\n'));}
        },80);
      }catch(err){clearTimeout(watchdog);setLoadInProgress(false);showError('Could not parse CSV',err.message);}
    },120);
  };
  reader.readAsText(file);
}

// ─── Toast notification ─────────────────────────────
let _toastTimer = null;
function showToast(msg, duration=3500) {
  let el = document.getElementById('pv-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pv-toast';
    el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(8px);background:var(--surf2);border:1px solid var(--border);border-radius:8px;padding:10px 18px;font-size:13px;color:var(--text);z-index:99999;opacity:0;transition:opacity .2s,transform .2s;pointer-events:none;white-space:nowrap;max-width:90vw;text-align:center';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  el.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(8px)';
  }, duration);
}

// ─── Cloud save with blocking overlay ───────────────
async function handleCloudSave(pokemon) {
  const overlay = document.getElementById('saveOverlay');
  if (!overlay) {
    console.error('Save overlay element missing from DOM — continuing save without overlay');
  }
  const fill    = document.getElementById('saveProgressFill');
  const countEl = document.getElementById('saveOverlayCount');
  const textEl  = document.getElementById('saveProgressText');
  const total   = pokemon.length;

  if (overlay) overlay.style.display = 'flex';
  if (countEl) countEl.textContent = '0';
  if (textEl)  textEl.textContent = `of ${total.toLocaleString()} Pokémon`;
  if (fill)    fill.style.width = '0%';

  try {
    await saveCollectionToCloud(pokemon, (saved, tot) => {
      const pct = Math.round((saved / tot) * 100);
      if (fill) fill.style.width = pct + '%';
      if (countEl) countEl.textContent = saved.toLocaleString();
      if (textEl) textEl.textContent = `of ${tot.toLocaleString()} Pokémon`;
    });
    showToast(`✓ Saved ${total.toLocaleString()} Pokémon to cloud`);
    trackEvent('cloud_save', { pokemon_count: total });
  } catch (err) {
    showToast('Save failed — check sync status');
    console.error('handleCloudSave error:', err);
  } finally {
    if (overlay) overlay.style.display = 'none';
  }
}

// ─── Incomplete save detection ───────────────────────
async function checkForIncompleteSave() {
  const userId = await getCurrentUserId();
  if (!userId) return;
  const sessions = await supabaseFetch('GET',
    `sync_sessions?user_id=eq.${userId}&status=in.(in_progress,failed)&order=id.desc&limit=1`);
  if (!sessions?.length) return;
  const s = sessions[0];
  // Guard: ignore if saved_records >= total_records (unlikely but safe)
  if (s.saved_records >= s.total_records) return;
  showIncompleteSaveWarning(s);
}

// Called after a successful cloud load. Removes stale warning banner and patches
// the in_progress session to 'complete' so it doesn't re-appear on next load.
async function clearIncompleteWarningIfHealthy(loadedCount) {
  document.getElementById('incomplete-save-banner')?.remove();
  const userId = await getCurrentUserId();
  if (!userId) return;
  const sessions = await supabaseFetch('GET',
    `sync_sessions?user_id=eq.${userId}&status=eq.in_progress&order=id.desc&limit=1`);
  if (!sessions?.length) return;
  const s = sessions[0];
  const threshold = s.total_records ? Math.floor(s.total_records * 0.9) : 0;
  if (!threshold || loadedCount >= threshold) {
    supabaseFetch('PATCH', `sync_sessions?id=eq.${s.id}`, {
      status: 'complete',
      completed_at: new Date().toISOString(),
      saved_records: loadedCount
    });
  }
}

function showIncompleteSaveWarning(session) {
  if (document.getElementById('incomplete-save-banner')) return;
  const saved = session.saved_records ?? '?';
  const total = session.total_records ?? '?';
  const banner = document.createElement('div');
  banner.id = 'incomplete-save-banner';
  banner.className = 'warning-banner';
  banner.innerHTML = `⚠ Your last cloud save may be incomplete (${Number(saved).toLocaleString()} of ${Number(total).toLocaleString()} Pokémon saved).
    <button onclick="document.getElementById('incomplete-save-banner').remove()">Dismiss</button>
    <button onclick="document.getElementById('incomplete-save-banner').remove();document.getElementById('csvFileInput').click()">Re-import CSV</button>`;
  document.body.prepend(banner);
}

// Initialise auth + evolution chains on page load, then auto-load cloud collection
window.addEventListener('load', async () => {
  await initAuth();  // sets auth state; calls loadOverrides() when logged in
  loadEvolutionChains();
  const sel = document.getElementById('nickConvention');
  if (sel) sel.value = currentNickConvention;
  // Auto-load from cloud for all users (anon read policy allows this).
  // Falls back silently to the CSV import screen if cloud is empty or unavailable.
  if (allPokemon.length === 0) await autoLoadFromCloud();
  checkForIncompleteSave();
  // F3: restore the last-loaded CSV name into the header (no-op if never set).
  setCsvFilename(localStorage.getItem('pokevault_last_csv'));
});

document.getElementById('fileInput').addEventListener('change',e=>{if(e.target.files[0])handleFile(e.target.files[0]);});
document.getElementById('csvFileInput')?.addEventListener('change',e=>{if(e.target.files[0])handleFile(e.target.files[0]);});
document.getElementById('tryOwnInput')?.addEventListener('change',e=>{
  const f=e.target.files[0];
  if(!f) return;
  const bar=document.getElementById('anon-import-bar');
  if(bar) bar.style.display='none';
  handleFile(f);
});
const dz=document.getElementById('dropZone');
dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('drag-over');});
dz.addEventListener('dragleave',()=>dz.classList.remove('drag-over'));
dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('drag-over');if(e.dataTransfer.files[0])handleFile(e.dataTransfer.files[0]);});

window.addEventListener('popstate',()=>{if(allPokemon.length)applyHashState();});