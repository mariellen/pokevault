// ═══════════════════════════════════════════════
// PokéVault — App Controller
// UI rendering, filters, sorting, event handlers
// Depends on: config.js, supabase.js, analyse.js, render.js
// ═══════════════════════════════════════════════
'use strict';

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
      const starRank = p => {
        if (p.suggestStar && p.isFavorite) return 0;           // gold ★ correct
        if (p.suggestStar && !p.isFavorite) return 1;          // green ★ action needed
        if (p.suggestStarCheaper) return 2;                    // cyan ★ cheaper alt
        if (p.suggestStarExpensive) return 3;                  // blue ★ costly
        if (p.isFavorite && !p.suggestStar && !p.suggestStarExpensive && !p.suggestStarCheaper) return 4; // red ★ unstar
        return 5;                                               // · none
      };
      va=starRank(a);vb=starRank(b);
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

  const tbody=card.querySelector('tbody');
  if(tbody) tbody.innerHTML=fam.members.map(p=>buildRow(p)).join('');
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
  const {key,members,keepCount,tradeCount,reviewCount,primaryName}=fam;
  const isEevee=members.some(p=>p.name==='Eevee');
  const eeveeTip=isEevee?`<div class="eevee-tip">💡 Eevee family: best evolutions for Great = Umbreon / Sylveon, Ultra = Glaceon / Espeon. Check existing eeveelutions below.</div>`:'';

  const famForms=[...new Set(members.map(p=>p.form).filter(x=>x&&x!=='Normal'))];
  const famFormStr=famForms.length===1?`<span style="color:var(--cyan);font-size:11px">${famForms[0]}</span>`:'';
  const goSearchStr=buildGoSearchStr(primaryName,members);
  const famAllNames=[...new Set(members.map(p=>p.name))];
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

  const rows=members.map(p=>buildRow(p)).join('');

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
    <th data-col="catchDate" onclick="sortFamilyBy(this,'catchDate')">Catch Date</th>
    <th>Moves / TM</th>
    <th></th>
  </tr></thead>`;

  return `<div class="family-card ${isOpen?'open':''}" id="fam-${key}">
    <div class="family-header" onclick="toggleFamily('fam-${key}')">
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;flex:1;min-width:0">
        <span class="fam-count ${members.length>countThreshold?'fam-count-large':''}">${primaryName}${famFormStr?' '+famFormStr:''} <span style="color:var(--dim);font-size:11px">(${members.length})</span></span>
        <button class="copy-search-btn" data-copy="${goSearchEsc}" onclick="event.stopPropagation();copyGoSearch(this.dataset.copy,this)" title="Copy GO search — this form only">🔍 Me</button>
        ${famAllNames.length>1?`<button class="copy-search-btn" data-copy="${famSearchEsc}" onclick="event.stopPropagation();copyGoSearch(this.dataset.copy,this)" title="Copy GO search — whole family">🔍 + Fam</button>`:''}
        ${keepCount?`<span class="fam-badge fb-keep">${keepCount} keep</span>`:''}
        ${reviewCount?`<span class="fam-badge fb-review">${reviewCount} review</span>`:''}
        ${tradeCount?`<span class="fam-badge fb-trade">${tradeCount} trade</span>`:''}
      </div>
      <div style="display:flex;gap:6px;align-items:center;margin-left:auto;flex-shrink:0">
        <button class="copy-nicks-btn" onclick="event.stopPropagation();copyNicks('${key}',this)" title="Copy starred nicknames">⎘ nicks</button>
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
    tr=pokemon.filter(p=>p.decision==='trade').length,
    r=pokemon.filter(p=>p.decision==='review').length,
    pr=pokemon.filter(p=>p.decision==='protected').length;
  document.getElementById('hdr-stats').innerHTML=
    `<span>Total <strong>${t.toLocaleString()}</strong></span>
     <span style="color:var(--green)">Keep <strong>${k.toLocaleString()}</strong></span>
     <span style="color:var(--red)">Trade <strong>${tr.toLocaleString()}</strong></span>
     <span style="color:var(--great)">Review <strong>${r.toLocaleString()}</strong></span>`;
  document.getElementById('summary-strip').innerHTML=`
    <div class="sum-card s-total" onclick="setDecFilter('all',null)"><div class="sum-label">Total</div><div class="sum-val">${t.toLocaleString()}</div></div>
    <div class="sum-card s-keep" onclick="setDecFilter('keep',null)"><div class="sum-label">Keep</div><div class="sum-val">${k.toLocaleString()}</div></div>
    <div class="sum-card s-trade" onclick="setDecFilter('trade',null)"><div class="sum-label">Trade</div><div class="sum-val">${tr.toLocaleString()}</div></div>
    <div class="sum-card s-review" onclick="setDecFilter('review',null)"><div class="sum-label">Review</div><div class="sum-val">${r.toLocaleString()}</div></div>
    <div class="sum-card s-protected" onclick="setDecFilter('protected',null)"><div class="sum-label">Protected</div><div class="sum-val">${pr.toLocaleString()}</div></div>`;
}

function applyFilters(){
  page=1;
  const term=searchTerm.toLowerCase();
  const incEvos=document.getElementById('evoToggle')?.checked;
  const rankMap={L:'rankPctL',G:'rankPctG',U:'rankPctU',M:'rankPctM'};

  filteredFamilies=families.filter(fam=>{
    if(term){
      const nm=fam.primaryName.toLowerCase().includes(term);
      // Always check evo targets — so searching "Sylveon" finds Eevees recommended for Sylveon
      const evoMatch=fam.members.some(p=>
        (p.evolvedNameG||'').toLowerCase().includes(term)||
        (p.evolvedNameU||'').toLowerCase().includes(term)||
        (p.evolvedNameL||'').toLowerCase().includes(term));
      // incEvos also matches by member name (e.g. "Eevee" shows Sylveon family)
      const em=incEvos&&fam.members.some(p=>p.name.toLowerCase().includes(term));
      if(!nm&&!evoMatch&&!em) return false;
    }
    if(decFilter==='hundo'&&!fam.members.some(p=>p.isHundo)) return false;
    else if(decFilter==='canEvolve'&&!fam.members.some(p=>p.canEvolve)) return false;
    else if(decFilter==='neverEvolved'&&!fam.members.some(p=>p.neverEvolved)) return false;
    else if(!['all','hundo','canEvolve','neverEvolved'].includes(decFilter)&&!fam.members.some(p=>p.decision===decFilter)) return false;
    if(leagueFilters.size>0){
      // Row-level: does any member qualify for ALL selected leagues
      const ok=[...leagueFilters].some(lg=>fam.members.some(p=>(p[rankMap[lg]]||0)>=RULES.keepThreshold));
      if(!ok) return false;
    }
    return true;
  });

  if(sortByCount){filteredFamilies.sort((a,b)=>b.members.length-a.members.length);}
  else{filteredFamilies.sort((a,b)=>a.primaryName.localeCompare(b.primaryName));}
  renderPage();
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
          if(decFilter==='hundo') qualifies=qualifies&&p.isHundo;
          if(decFilter==='canEvolve') qualifies=qualifies&&p.canEvolve;
          if(decFilter==='neverEvolved') qualifies=qualifies&&p.neverEvolved;
          p._leagueFiltered=!qualifies;
        });
      } else {
        f.members.forEach(p=>p._leagueFiltered=false);
      }
      // Auto-open if league filter active and family has qualifying rows
      const hasQualifying=activeLeagueArr.length===0||f.members.some(p=>!p._leagueFiltered&&!p.hidden);
      const open=(autoOpen&&i===0)||activeLeagueArr.length>0;
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

function renderFamilyFiltered(fam,isOpen,activeLeagues,rankMap){
  const {key,members,keepCount,tradeCount,reviewCount,primaryName}=fam;
  const isEevee=members.some(p=>p.name==='Eevee');
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
      ? ` &nbsp;·&nbsp; <strong>Top pick:</strong> <span style="font-family:monospace;color:var(--cyan);cursor:pointer" onclick="navigator.clipboard.writeText('${topNickEsc}')" title="Click to copy">${topNick}</span> CP:${slotWinner.cp} ${Math.round(slotWinner[primaryRankField]||0)}% ${primaryLeagueName}`
      : '';
    evoSearchBanner = `<div style="background:rgba(0,212,255,0.08);border-left:3px solid var(--cyan);padding:8px 14px;font-size:11px;color:var(--muted);margin-bottom:4px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      🔍 <strong style="color:var(--text)">${term.charAt(0).toUpperCase()+term.slice(1)}</strong>: ${parts.join(' · ')}${topStr}
    </div>`;
  }

  const memberMatchesTerm = p => {
    if (!term || !termMatchesViaEvo) return true;
    if (p.name.toLowerCase().includes(term)) return true;
    if ((p.targetEvo||'').toLowerCase().includes(term)) return true;
    return (p.evolvedNameG||'').toLowerCase().includes(term) ||
           (p.evolvedNameU||'').toLowerCase().includes(term);
  };

  const visible=members.filter(p=>!p._leagueFiltered&&!p.hidden&&memberMatchesTerm(p));
  const hidden=members.filter(p=>p._leagueFiltered||p.hidden||!memberMatchesTerm(p));
  const filteredNote=activeLeagues.length>0&&hidden.length>0?
    `<div style="padding:5px 12px;font-size:10px;color:var(--dim)">${hidden.length} row${hidden.length!==1?'s':''} hidden by league filter</div>`:'';

  const famForms=[...new Set(members.map(p=>p.form).filter(x=>x&&x!=='Normal'))];
  const famFormStr=famForms.length===1?`<span style="color:var(--cyan);font-size:11px">${famForms[0]}</span>`:'';
  const goSearchStr=buildGoSearchStr(primaryName,members);
  const famAllNames=[...new Set(members.map(p=>p.name))];
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

  // Evo-target reason tags: show G→Umbreon in league colour in nick cell
  // when the row is visible because of an evo-target search match (not a name match)
  if (termMatchesViaEvo && term) {
    visible.forEach(p => {
      if (p.name.toLowerCase().includes(term)) { p._evoSearchTag = ''; return; }
      const tags = [];
      if ((p.evolvedNameG||'').toLowerCase().includes(term))
        tags.push(`<span style="color:var(--great);font-size:9px">G→${p.evolvedNameG}</span>`);
      if ((p.evolvedNameU||'').toLowerCase().includes(term))
        tags.push(`<span style="color:var(--ultra);font-size:9px">U→${p.evolvedNameU}</span>`);
      if ((p.evolvedNameL||'').toLowerCase().includes(term))
        tags.push(`<span style="color:var(--little);font-size:9px">L→${p.evolvedNameL}</span>`);
      p._evoSearchTag = tags.join(' ');
    });
  } else {
    visible.forEach(p => { p._evoSearchTag = ''; });
  }

  const rows=visible.map(p=>buildRow(p)).join('');
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
    <th data-col="catchDate" onclick="sortFamilyBy(this,'catchDate')">Catch Date</th>
    <th>Moves / TM</th>
    <th></th>
  </tr></thead>`;

  return `<div class="family-card ${isOpen?'open':''}" id="fam-${key}">
    <div class="family-header" onclick="toggleFamily('fam-${key}')">
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;flex:1;min-width:0">
        <span class="fam-count ${members.length>countThreshold?'fam-count-large':''}">${primaryName}${famFormStr?' '+famFormStr:''}${collBadge} <span style="color:var(--dim);font-size:11px">(${members.length})${activeLeagues.length>0?' · '+visible.length+' shown':''}</span></span>
        <button class="copy-search-btn" data-copy="${goSearchEsc}" onclick="event.stopPropagation();copyGoSearch(this.dataset.copy,this)" title="Copy GO search — this form only">🔍 Me</button>
        ${famAllNames.length>1?`<button class="copy-search-btn" data-copy="${famSearchEsc}" onclick="event.stopPropagation();copyGoSearch(this.dataset.copy,this)" title="Copy GO search — whole family">🔍 + Fam</button>`:''}
        ${keepCount?`<span class="fam-badge fb-keep">${keepCount} keep</span>`:''}
        ${reviewCount?`<span class="fam-badge fb-review">${reviewCount} review</span>`:''}
        ${tradeCount?`<span class="fam-badge fb-trade">${tradeCount} trade</span>`:''}
      </div>
      <div style="display:flex;gap:6px;align-items:center;margin-left:auto;flex-shrink:0">
        <button class="copy-nicks-btn" onclick="event.stopPropagation();copyNicks('${key}',this)" title="Copy starred nicknames">⎘ nicks</button>
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

function toggleFamily(id){const el=document.getElementById(id);if(el)el.classList.toggle('open');}
function goPage(p){page=p;renderPage();window.scrollTo(0,180);}

function clearSearch(){
  const box=document.getElementById('searchBox');
  if(box){box.value='';box.focus();}
  document.getElementById('searchClear')?.classList.remove('visible');
  searchTerm='';applyFilters();
}

function toggleSortByCount(btn){
  sortByCount=!sortByCount; btn.classList.toggle('active',sortByCount); applyFilters();
}
function setDecFilter(f,btn){
  // Toggle off if clicking the already-active filter
  if(decFilter===f){ decFilter='all'; document.querySelectorAll('[data-f]').forEach(b=>b.classList.remove('active','act-trade','act-review','act-protected')); applyFilters(); return; }
  decFilter=f;
  document.querySelectorAll('[data-f]').forEach(b=>b.classList.remove('active','act-trade','act-review','act-protected'));
  document.querySelectorAll('.sum-card').forEach(c=>c.classList.remove('active'));
  if(btn){const cls=f==='trade'?'act-trade':f==='review'?'act-review':f==='protected'?'act-protected':'active';btn.classList.add(cls);}
  applyFilters();
}

function toggleLeague(l,btn){
  if(leagueFilters.has(l)){leagueFilters.delete(l);btn.classList.remove('active');}
  else{leagueFilters.add(l);btn.classList.add('active');}
  applyFilters();
}

function filterBestInLeague(btn){
  const active=btn.classList.toggle('active');
  if(active){
    document.getElementById('costlyBtn')?.classList.remove('active');
    filteredFamilies=families.filter(f=>f.members.some(p=>p.suggestStar&&!p.isFavorite));
  } else { applyFilters(); return; }
  renderPage();
}

function filterCostlyWinners(btn){
  const active=btn.classList.toggle('active');
  if(active){
    document.getElementById('bestLeagueBtn')?.classList.remove('active');
    filteredFamilies=families.filter(f=>f.members.some(p=>p.suggestStarExpensive&&!p.isFavorite));
  } else { applyFilters(); return; }
  renderPage();
}

// ═══════════════════════════════════════════════
// MODALS
// ═══════════════════════════════════════════════

// ── Purify modal ──────────────────────────────
let purifySort='rank';       // 'rank' | 'dust' | 'league'
let purifyLeagueFilter='';   // '' | 'L' | 'G' | 'U' | 'M'

const LEAGUE_NAMES_P={L:'Little',G:'Great',U:'Ultra',M:'Master'};
const LEAGUE_COLORS_P={L:'var(--little)',G:'var(--great)',U:'var(--ultra)',M:'var(--master)'};
const LEAGUE_SYMS_P={L:'ⓛ',G:'Ⓖ',U:'Ⓤ',M:'Ⓡ'};

function openPurifyModal(){
  if(!allPokemon.length){alert('Load your collection first');return;}
  const modal=document.getElementById('purify-modal');
  const body=document.getElementById('purify-modal-body');
  const sub=document.getElementById('purify-modal-sub');

  // 92% threshold (not keepThreshold) to buffer for heuristic approximation
  let candidates=allPokemon.filter(p=>p.isShadow&&p.purifyLeague&&p.purifyRankPct>=92);

  if(purifyLeagueFilter) candidates=candidates.filter(p=>p.purifyLeague===purifyLeagueFilter);

  candidates.sort((a,b)=>{
    if(purifySort==='dust'){
      const da=a['dust'+a.purifyLeague]||0, db=b['dust'+b.purifyLeague]||0;
      return da-db;
    }
    if(purifySort==='league'){
      const order={L:0,G:1,U:2,M:3};
      const lo=(order[a.purifyLeague]||0)-(order[b.purifyLeague]||0);
      if(lo!==0) return lo;
    }
    return (b.purifyRankPct||0)-(a.purifyRankPct||0);
  });

  sub.textContent=candidates.length+' shadow'+(candidates.length===1?'':'s')+' qualify when purified';

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
    const lg=p.purifyLeague;
    const lgName=LEAGUE_NAMES_P[lg]||lg;
    const lgColor=LEAGUE_COLORS_P[lg]||'var(--muted)';
    const lgSym=LEAGUE_SYMS_P[lg]||lg;
    const shadowDust=p['dust'+lg]||0;
    const purifyDust=Math.round(shadowDust/2);
    const purifyBaseName=p.purifyEvo||p.name;
    const purifyNick=fitName(purifyBaseName,lgSym+p.purifyRankPct+(p.purifyHundo?'✪':''),'p',12);
    const ivStr=p.atkIV+'/'+p.defIV+'/'+p.staIV;
    const pAtk=Math.min(15,(p.atkIV||0)+2);
    const pDef=Math.min(15,(p.defIV||0)+2);
    const pSta=Math.min(15,(p.staIV||0)+2);
    const purifiedIvStr=pAtk+'/'+pDef+'/'+pSta;

    return `<div style="display:grid;grid-template-columns:1fr auto auto auto;gap:8px;align-items:center;
        padding:8px 12px;border-bottom:1px solid var(--border);font-size:12px">
      <div>
        <div style="font-weight:700;color:var(--text)">${p.name}${p.purifyEvo&&p.purifyEvo!==p.name?' <span style="color:var(--muted);font-size:11px;font-weight:400">→ '+p.purifyEvo+'</span>':''} <span style="color:var(--muted);font-weight:400">CP:${p.cp}</span>
          ${p.purifyHundo?'<span style="color:var(--gold);font-size:10px"> ★ Hundo after purify</span>':''}
        </div>
        <div style="color:var(--muted);font-size:11px">IVs: ${ivStr} → ${purifiedIvStr} · <span style="color:${lgColor};font-weight:700">${lgName}</span> est. <span style="font-weight:700;color:var(--green)">${p.purifyRankPct}%</span> · dust: <span style="color:var(--cyan)">${purifyDust>0?purifyDust.toLocaleString():'at cap'}</span></div>
      </div>
      <button class="copy-search-btn" onclick="copyGoSearch('${p.name}&cp${p.cp}&shadow',this)" title="Copy name+CP+shadow to find in GO/Pokégenie">🔍</button>
      <button class="copy-search-btn" onclick="copyGoSearch('${ivStr}',this)" title="Copy IVs to search in Pokégenie">IV</button>
      <span onclick="copyGoSearch('${purifyNick}',this)" style="font-family:monospace;color:var(--gold);cursor:pointer;font-size:12px;padding:2px 6px;border:1px solid var(--border);border-radius:4px;white-space:nowrap" title="Click to copy purified nick">${purifyNick}</span>
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

// ── Cleanup / Special modals ──────────────────
let cleanupSortMode='stable';
let specialSortMode='date';
let specialFilterSpecies='';

function openCleanupModal(){
  if(!allPokemon.length){alert('Load your collection first');return;}
  const modal=document.getElementById('cleanup-modal');
  const body=document.getElementById('cleanup-modal-body');
  const sub=document.getElementById('cleanup-modal-sub');

  const NEEDS_FORM=new Set(Object.keys(FORM_DROPDOWNS||{}));
  const needsForm=allPokemon.filter(p=>NEEDS_FORM.has(p.name)&&!p.specialForm&&!p.vivillonPattern)
    .sort((a,b)=>{
      if(cleanupSortMode==='cp') return (b.cp||0)-(a.cp||0);
      if(cleanupSortMode==='iv') return (b.ivAvg||0)-(a.ivAvg||0);
      if(a.catchDate&&!b.catchDate) return -1;
      if(!a.catchDate&&b.catchDate) return 1;
      return a.name.localeCompare(b.name);
    });

  sub.textContent=needsForm.length+' Pokémon need form/pattern set'
    +' ('+needsForm.filter(p=>p.catchDate).length+' with stable IDs)';

  const sortBtns=`<div style="display:flex;gap:6px;margin-bottom:12px;font-size:11px">
    <span style="color:var(--muted)">Sort:</span>
    <button onclick="cleanupSortMode='stable';openCleanupModal()" style="background:${cleanupSortMode==='stable'?'var(--cyan)':'none'};border:1px solid var(--border);border-radius:4px;padding:2px 8px;color:${cleanupSortMode==='stable'?'#000':'var(--muted)'};cursor:pointer;font-size:11px">Stable ID</button>
    <button onclick="cleanupSortMode='cp';openCleanupModal()" style="background:${cleanupSortMode==='cp'?'var(--cyan)':'none'};border:1px solid var(--border);border-radius:4px;padding:2px 8px;color:${cleanupSortMode==='cp'?'#000':'var(--muted)'};cursor:pointer;font-size:11px">CP ↓</button>
    <button onclick="cleanupSortMode='iv';openCleanupModal()" style="background:${cleanupSortMode==='iv'?'var(--cyan)':'none'};border:1px solid var(--border);border-radius:4px;padding:2px 8px;color:${cleanupSortMode==='iv'?'#000':'var(--muted)'};cursor:pointer;font-size:11px">IV% ↓</button>
  </div>`;

  body.innerHTML=!needsForm.length
    ? sortBtns+'<div class="pv-modal-empty">All forms already set! ✓</div>'
    : sortBtns+needsForm.map(p=>{
        const opts=(FORM_DROPDOWNS[p.name]||[]).map(f=>`<option value="${f}" ${p.specialForm===f?'selected':''}>${f}</option>`).join('');
        const stableTag=p.catchDate
          ?`<span style="color:var(--green);font-size:9px">✓ stable ID</span>`
          :`<span style="color:var(--red);font-size:9px">⚠ no catch date</span>`;
        return `<div class="pv-modal-row">
          <div class="pv-modal-info">
            <div class="pv-modal-name">${p.name}</div>
            <div class="pv-modal-meta">CP:${p.cp} · ${p.atkIV}/${p.defIV}/${p.staIV} · ${Math.round(p.ivAvg)}% IV · ${p.catchDate||'no catch date'} · ${stableTag}</div>
          </div>
          <div class="pv-modal-controls">
            <select class="pv-modal-select" onchange="setOverride('${p.stableKey}','special_form',this.value);allPokemon.find(x=>x.stableKey==='${p.stableKey}').specialForm=this.value;">${opts}</select>
          </div>
        </div>`;
      }).join('');
  modal.classList.add('open');
}

function closeCleanupModal(){document.getElementById('cleanup-modal').classList.remove('open');}

function openSpecialModal(){
  if(!allPokemon.length){alert('Load your collection first');return;}
  const modal=document.getElementById('special-modal');
  const body=document.getElementById('special-modal-body');
  const sub=document.getElementById('special-modal-sub');

  const allSpeciesWithCounts={};
  allPokemon.filter(p=>!p.isShiny&&!p.isDynamax&&!p.isGigantamax&&!p.isCostumed)
    .forEach(p=>{allSpeciesWithCounts[p.name]=(allSpeciesWithCounts[p.name]||0)+1;});
  const speciesList=Object.entries(allSpeciesWithCounts).filter(([,c])=>c>=5)
    .sort((a,b)=>b[1]-a[1]).map(([n])=>n);

  const candidates=allPokemon
    .filter(p=>!p.isShiny&&!p.isDynamax&&!p.isGigantamax&&!p.isCostumed
      &&(!specialFilterSpecies||p.name===specialFilterSpecies))
    .sort((a,b)=>{
      if(specialSortMode==='cp') return (b.cp||0)-(a.cp||0);
      if(specialSortMode==='iv') return (b.ivAvg||0)-(a.ivAvg||0);
      if(a.scanDate&&b.scanDate) return b.scanDate.localeCompare(a.scanDate);
      if(a.scanDate) return -1;
      if(b.scanDate) return 1;
      return a.name.localeCompare(b.name);
    }).slice(0,200);

  sub.textContent='Newest 200 unmarked Pokémon — tick any that are Shiny, Gigantamax or Dynamax';
  const speciesOpts=['<option value="">All species</option>',
    ...speciesList.map(n=>`<option value="${n}" ${specialFilterSpecies===n?'selected':''}>${n} (${allSpeciesWithCounts[n]})</option>`)
  ].join('');

  const sortBtns=`<div style="display:flex;gap:6px;margin-bottom:12px;font-size:11px;flex-wrap:wrap;align-items:center">
    <select onchange="specialFilterSpecies=this.value;openSpecialModal()" style="background:var(--surf2);border:1px solid var(--border);border-radius:4px;padding:3px 6px;color:var(--text);font-size:11px;cursor:pointer">${speciesOpts}</select>
    <span style="color:var(--muted);margin-left:4px">Sort:</span>
    <button onclick="specialSortMode='date';openSpecialModal()" style="background:${specialSortMode==='date'?'var(--cyan)':'none'};border:1px solid var(--border);border-radius:4px;padding:2px 8px;color:${specialSortMode==='date'?'#000':'var(--muted)'};cursor:pointer;font-size:11px">Newest</button>
    <button onclick="specialSortMode='cp';openSpecialModal()" style="background:${specialSortMode==='cp'?'var(--cyan)':'none'};border:1px solid var(--border);border-radius:4px;padding:2px 8px;color:${specialSortMode==='cp'?'#000':'var(--muted)'};cursor:pointer;font-size:11px">CP ↓</button>
    <button onclick="specialSortMode='iv';openSpecialModal()" style="background:${specialSortMode==='iv'?'var(--cyan)':'none'};border:1px solid var(--border);border-radius:4px;padding:2px 8px;color:${specialSortMode==='iv'?'#000':'var(--muted)'};cursor:pointer;font-size:11px">IV% ↓</button>
  </div>`;

  body.innerHTML=!candidates.length
    ? sortBtns+'<div class="pv-modal-empty">No unmarked Pokémon found</div>'
    : sortBtns+candidates.map(p=>{
        const isCostumable=COSTUME_SPECIES&&COSTUME_SPECIES.has(p.name);
        return `<div class="pv-modal-row">
          <div class="pv-modal-info">
            <div class="pv-modal-name">${p.name}</div>
            <div class="pv-modal-meta">CP:${p.cp} · ${p.atkIV}/${p.defIV}/${p.staIV} · ${Math.round(p.ivAvg)}% IV · ${p.catchDate||p.scanDate||'no date'}</div>
          </div>
          <div class="pv-modal-controls">
            <label class="pv-modal-cb"><input type="checkbox" ${p.isShiny?'checked':''} onchange="setOverride('${p.stableKey}','is_shiny',this.checked);allPokemon.find(x=>x.stableKey==='${p.stableKey}').isShiny=this.checked;"> ✨ Shiny</label>
            <label class="pv-modal-cb"><input type="checkbox" ${p.isGigantamax?'checked':''} onchange="setOverride('${p.stableKey}','is_gigantamax',this.checked);allPokemon.find(x=>x.stableKey==='${p.stableKey}').isGigantamax=this.checked;"> Gmax</label>
            <label class="pv-modal-cb"><input type="checkbox" ${p.isDynamax?'checked':''} onchange="setOverride('${p.stableKey}','is_dynamax',this.checked);allPokemon.find(x=>x.stableKey==='${p.stableKey}').isDynamax=this.checked;"> Dmax</label>
            ${isCostumable?`<label class="pv-modal-cb"><input type="checkbox" ${p.isCostumed?'checked':''} onchange="setOverride('${p.stableKey}','is_costumed',this.checked);allPokemon.find(x=>x.stableKey==='${p.stableKey}').isCostumed=this.checked;"> 🎃 Costume</label>`:''}
          </div>
        </div>`;
      }).join('');
  modal.classList.add('open');
}

function closeSpecialModal(){document.getElementById('special-modal').classList.remove('open');}

// ═══════════════════════════════════════════════
// COPY SUGGESTED NICKS
// ═══════════════════════════════════════════════

async function handleCloudLoad() {
  const btn = document.getElementById('cloudLoadBtn');
  const status = document.getElementById('cloud-load-status');
  if (btn) { btn.disabled=true; btn.textContent='Loading...'; }
  const rows = await loadCollectionFromCloud();
  if (!rows) {
    if (status) status.textContent = 'No cloud data found. Import a CSV first.';
    if (btn) { btn.disabled=false; btn.textContent='☁ Load last collection from cloud'; }
    return;
  }
  // Convert cloud rows back to CSV-like format for analyse()
  const csvRows = rows.map(r => ({
    'Index': r.pokemon_index,
    'Name': r.name,
    'Form': r.form||'',
    'Pokemon Number': r.pokemon_num||'',
    'CP': String(r.cp||0),
    'HP': '0',
    'Atk IV': String(r.atk_iv||0),
    'Def IV': String(r.def_iv||0),
    'Sta IV': String(r.sta_iv||0),
    'IV Avg': String(r.iv_avg||0),
    'Level Min': String(r.level||0),
    'Level Max': String(r.level||0),
    'Quick Move': r.quick_move||'',
    'Charge Move': r.charge_move1||'',
    'Charge Move 2': r.charge_move2||'',
    'Lucky': r.is_lucky?'1':'0',
    'Shadow/Purified': r.is_shadow?'1':r.is_purified?'2':'0',
    'Favorite': r.is_favorite?'1':'0',
    'Catch Date': r.catch_date||'',
    'Marked for PvP use': r.pvp_tag||'',
    'Rank % (G)': r.rank_pct_g?r.rank_pct_g+'%':'',
    'Rank % (U)': r.rank_pct_u?r.rank_pct_u+'%':'',
    'Rank % (L)': r.rank_pct_l?r.rank_pct_l+'%':'',
    'Rank # (G)': String(r.rank_num_g||''),
    'Rank # (U)': String(r.rank_num_u||''),
    'Rank # (L)': String(r.rank_num_l||''),
    'Dust Cost (G)': String(r.dust_g||''),
    'Dust Cost (U)': String(r.dust_u||''),
    'Dust Cost (L)': String(r.dust_l||''),
    'Name (G)': r.evolved_name_g||'',
    'Name (U)': r.evolved_name_u||'',
    'Name (L)': r.evolved_name_l||'',
    'Form (G)':'','Form (U)':'','Form (L)':'',
    'Sha/Pur (G)':'0','Sha/Pur (U)':'0','Sha/Pur (L)':'0',
    'Stat Prod (G)':'','Stat Prod (U)':'','Stat Prod (L)':'',
    'Rank # (L)': String(r.rank_num_l||''),
    'Dust Cost (L)': String(r.dust_l||''),
    'Candy Cost (G)':'','Candy Cost (U)':'','Candy Cost (L)':'',
    'Original Scan Date':'','Scan Date':'','Catch Date':r.catch_date||'',
    'Weight':'','Height':'','Dust':'0','Gender':'',
    'Pokemon Number': r.pokemon_num||''
  }));
  document.getElementById('upload-section').style.display='none';
  document.getElementById('loading-section').style.display='block';
  setProgress('ANALYSING CLOUD DATA...', 45);
  setTimeout(()=>{
    try {
      const result = analyse(csvRows);
      allPokemon = result.pokemon;
      families = result.families;
      filteredFamilies = families.slice();
      setProgress('BUILDING DISPLAY...', 88);
      setTimeout(()=>{
        document.getElementById('loading-section').style.display='none';
        document.getElementById('dashboard').style.display='block';
        renderSummary(allPokemon); applyFilters();
        document.getElementById('searchBox').addEventListener('input',ev=>{searchTerm=ev.target.value.toLowerCase();applyFilters();document.getElementById('searchClear')?.classList.toggle('visible',ev.target.value.length>0);});
        document.getElementById('evoToggle').addEventListener('change',()=>applyFilters());
        loadOverrides();
      },50);
    } catch(err) {
      showError('Cloud load failed', err.message);
    }
  },80);
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
  // Re-render this row so star colour and decision badge update immediately
  const tr = document.querySelector(`tr[data-idx="${p.idx}"]`);
  if (tr) {
    const iv = Math.round(p.ivAvg||0);
    const ivc = iv>=90?'var(--green)':iv>=70?'var(--cyan)':'var(--muted)';
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
  const orig = el.textContent;
  el.textContent = '✓ Copied!';
  el.style.color = 'var(--green)';
  setTimeout(()=>{ el.textContent=orig; el.style.color=''; }, 1500);
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
  if(!file.name.toLowerCase().endsWith('.csv')){showError('Wrong file type',`Expected .csv, got: ${file.name}`);return;}
  document.getElementById('upload-section').style.display='none';
  document.getElementById('loading-section').style.display='block';
  const watchdog=setTimeout(()=>showError('Timed out after 60s','The file may be too large for this device. Try cleaning up Pokégenie first and re-exporting a smaller file.'),60000);
  const reader=new FileReader();
  reader.onerror=()=>showError('Could not read file','FileReader error');
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
            setProgress('BUILDING DISPLAY...',88);
            setTimeout(()=>{
              clearTimeout(watchdog);
              document.getElementById('loading-section').style.display='none';
              document.getElementById('dashboard').style.display='block';
              renderSummary(allPokemon);applyFilters();
              loadOverrides();
              // Save to cloud after successful import
              if (supabaseConnected) saveCollectionToCloud(allPokemon);
              document.getElementById('searchBox').addEventListener('input',ev=>{searchTerm=ev.target.value.toLowerCase();applyFilters();document.getElementById('searchClear')?.classList.toggle('visible',ev.target.value.length>0);});
              document.getElementById('evoToggle').addEventListener('change',()=>applyFilters());
            },50);
          }catch(err){clearTimeout(watchdog);showError('Analysis failed',err.message+'\n'+(err.stack||'').split('\n').slice(0,3).join('\n'));}
        },80);
      }catch(err){clearTimeout(watchdog);showError('Could not parse CSV',err.message);}
    },120);
  };
  reader.readAsText(file);
}

// Load overrides + check for cloud data on page load
window.addEventListener('load', () => { loadOverrides(); });

document.getElementById('fileInput').addEventListener('change',e=>{if(e.target.files[0])handleFile(e.target.files[0]);});
const dz=document.getElementById('dropZone');
dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('drag-over');});
dz.addEventListener('dragleave',()=>dz.classList.remove('drag-over'));
dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('drag-over');if(e.dataTransfer.files[0])handleFile(e.dataTransfer.files[0]);});