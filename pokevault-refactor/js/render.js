// ═══════════════════════════════════════════════
// PokéVault — Rendering Helpers
// HTML generation for table cells, badges, rows
// Depends on: config.js, analyse.js
// ═══════════════════════════════════════════════
'use strict';

// ═══════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════
let allPokemon=[], families=[], filteredFamilies=[];
let decFilter='all', leagueFilters=new Set(), searchTerm='', page=1, sortByCount=false, countThreshold=100;
const PER_PAGE=40;
const familySortState={};

// ═══════════════════════════════════════════════
// RENDER HELPERS
// ═══════════════════════════════════════════════
function lrHTML(pct,num,dust,isLucky){
  if(!pct) return '<span class="lr-low">—</span>';
  const cls=pct>=90?'lr-90':pct>=70?'lr-70':'lr-low';
  let dustStr='';
  if(dust&&dust>0){
    const eff=isLucky?Math.round(dust/2):dust;
    const dc=eff>=200000?'var(--red)':eff>=150000?'var(--gold)':'var(--muted)';
    const dk=eff>=1000?(eff/1000).toFixed(0)+'k':String(eff);
    const ds=eff>=200000?'$$$':eff>=150000?'$$':eff>=100000?'$':'';
    dustStr=`<span style="color:${dc};font-size:9px;display:block">${dk}${ds}</span>`;
  }
  return `<span class="lrank"><span class="${cls}">${pct.toFixed(1)}%</span>${num?`<span class="lr-num">#${num}</span>`:''  }${dustStr}</span>`;
}

function dustHTML(dust,iv){
  if(!dust) return '<span style="color:var(--dim)">—</span>';
  const thr=iv>=99?RULES.dustWarnPerfect:RULES.dustWarnNormal;
  const cls=dust<=thr?'dust-ok':dust<=thr*1.5?'dust-warn':'dust-over';
  const d=dust>=RULES.dustTier3?'$$$':dust>=RULES.dustTier2?'$$':dust>=RULES.dustTier1?'$':'';
  return `<span class="${cls}">${(dust/1000).toFixed(0)}k${d}</span>`;
}

function moveHTML(p){
  if(!p.quickMove&&!p.chargeMove1) return '<span class="move-unknown">Not scanned</span>';
  const f=p.quickMove||'—',c1=p.chargeMove1||'—',c2=p.chargeMove2||'';
  const fc=p.bestFast?(f===p.bestFast?'move-good':'move-bad'):'';
  const c1c=p.bestC1?((c1===p.bestC1||c1===p.bestC2)?'move-good':'move-bad'):'';
  const c2c=p.bestC2?((c2===p.bestC2||c2===p.bestC1)?'move-good':'move-bad'):'';
  let h=`<div class="${fc}">${f}</div><div class="${c1c}">${c1}</div>`;
  if(c2) h+=`<div class="${c2c}">${c2}</div>`;
  (p.moveNotes||[]).forEach(n=>h+=`<div class="move-tm">⚡ ${n}</div>`);
  return h;
}

function slotBadges(p){
  const slots = p.slots || [];
  const m={L:['sl-L','Little'],G:['sl-G','Great'],U:['sl-U','Ultra'],M:['sl-M','Master'],
    L_affordable:['sl-L','Little (affordable)'],G_affordable:['sl-G','Great (affordable)'],
    U_affordable:['sl-U','Ultra (affordable)'],M_affordable:['sl-M','Master (affordable)'],
    shiny:['sl-shiny','Best Shiny'],shiny_lower:['sl-shiny','Shiny'],
    shadow:['sl-shadow','Best Shadow'],purified:['sl-purified','Best Purified'],
    lucky:['sl-lucky','Lucky'],nundo:['sl-nundo','Nundo']};
  let html = slots.map(s=>`<span class="slot ${(m[s]||['sl-G',s])[0]}">${(m[s]||['',s])[1]}</span>`).join('');
  if (p.overBudget100) html += '<span class="slot" style="background:rgba(248,81,73,.15);color:var(--red)">$$$⚠</span>';
  return html;
}

function decBadge(d){
  const m={keep:'dec-keep',trade:'dec-trade',review:'dec-review',protected:'dec-protected'};
  const l={keep:'✓ Keep',trade:'↗ Trade',review:'⚠ Review',protected:'🛡 Protected'};
  return `<span class="dec ${m[d]||'dec-review'}">${l[d]||d}</span>`;
}

function starCell(p){
  const type=p.pokeType||'';
  const tc={Legendary:'st-legendary',Mythical:'st-mythical','Ultra Beast':'st-ub',Mega:'st-mega'}[type]||'';
  let si;
  if(p.suggestStar&&p.isFavorite) si='<span class="star-yellow" title="Starred correctly ✓">★</span>';
  else if(p.suggestStar&&!p.isFavorite) si='<span class="star-green" title="Should be starred — action needed">★</span>';
  else if(p.suggestStarExpensive&&p.isFavorite) si='<span class="star-yellow" title="Starred correctly ✓ (costly pick)">★</span>';
  else if(p.suggestStarExpensive&&!p.isFavorite) si='<span class="star-blue" title="Recommended but costly — over affordable threshold">★</span>';
  else if(p.suggestStarCheaper&&!p.isFavorite) si='<span class="star-cyan" title="Cheaper alternative at same rank — check if your starred one is already levelled before acting">★</span>';
  else if(!p.suggestStar&&!p.suggestStarExpensive&&!p.suggestStarCheaper&&p.isFavorite) si='<span class="star-red" title="Currently starred — may not be needed">★</span>';
  else si='<span class="star-none">·</span>';
  return `<div class="star-cell">
    <div class="star-icon">${si}</div>
    ${p.isHundo&&p.level?`<div style="font-size:9px;color:var(--gold);margin-top:2px">${p.dustToL40===0?'L40 done':'to L40: '+formatDust(p.dustToL40)}</div>`:''}
    ${type?`<div class="star-type ${tc}">${type}</div>`:''}
  </div>`;
}

function variantTags(p){
  let t='';
  if(p.isShiny) t+='<span class="vtag vt-shiny">✨ Shiny</span>';
  if(p.isLucky) t+='<span class="vtag vt-lucky">★ Lucky</span>';
  if(p.isShadow) t+='<span class="vtag vt-shadow">Shadow</span>';
  if(p.isPurified) t+='<span class="vtag vt-purified">Purified</span>';
  if(p.isDynamax) t+='<span class="vtag" style="background:rgba(88,166,255,.2);color:var(--great)">Dmax</span>';
  if(p.isGigantamax) t+='<span class="vtag" style="background:rgba(168,85,247,.2);color:var(--ultra)">Gmax</span>';
  if(p.vivillonPattern) t+='<span class="vtag" style="background:rgba(255,166,87,.2);color:var(--master)">'+p.vivillonPattern+'</span>';
  if(p.manualDecision) t+='<span class="vtag" style="background:rgba(255,215,0,.15);color:var(--gold)">Manual</span>';
  if(p.isFavorite) t+='<span class="vt-fav">★</span>';
  return t;
}

// ═══════════════════════════════════════════════
// BUILD ROW (top-level so sortFamilyBy can use it)
// ═══════════════════════════════════════════════
function buildRow(p){
  if(p.hidden) return `<tr class="row-hidden" data-idx="${p.idx}"></tr>`;
  const iv=Math.round(p.ivAvg||0);
  const ivc=iv>=90?'var(--green)':iv>=70?'var(--cyan)':'var(--muted)';

  // Alt nicks for dual-league candidates
  const altNicks=(()=>{
    const alts=[];
    const mainEvo=p.targetEvo||p.evolvedNameG||'';
    if(p.evolvedNameG&&p.evolvedNameG!==p.name&&p.evolvedNameG!==mainEvo&&p.rankPctG>=90){
      const an=buildNickname(p,'G');
      if(an&&an!==p.nickname) alts.push({nick:an,col:'var(--great)',label:'G'});
    }
    if(p.evolvedNameU&&p.evolvedNameU!==p.name&&p.evolvedNameU!==mainEvo&&p.rankPctU>=90){
      const an=buildNickname(p,'U');
      if(an&&an!==p.nickname) alts.push({nick:an,col:'var(--ultra)',label:'U'});
    }
    return alts.map(a=>`<span style="display:block;font-size:9px;font-family:monospace;color:${a.col};opacity:0.8;cursor:pointer;white-space:nowrap"
      data-nick="${a.nick.replace(/"/g,'&quot;')}"
      onclick="event.stopPropagation();event.preventDefault();navigator.clipboard.writeText(this.dataset.nick).then(()=>{this.style.opacity='1';setTimeout(()=>this.style.opacity='0.8',800)}).catch(()=>{const t=document.createElement('textarea');t.value=this.dataset.nick;document.body.appendChild(t);t.select();document.execCommand('copy');document.body.removeChild(t);this.style.opacity='1';setTimeout(()=>this.style.opacity='0.8',800)})"
      title="Alt: ${a.label} League — click to copy">${a.nick}</span>`).join('');
  })();

  // Per-league evo indicators
  const evoIndicators=(()=>{
    if(p.targetEvo) return `<div class="target-evo">${p.evoIndicator||''}${p.targetEvo}</div>`;
    const seen=new Set();
    const parts=[];
    [[p.evolvedNameG,'var(--great)','G'],[p.evolvedNameU,'var(--ultra)','U'],[p.evolvedNameL,'var(--little)','L']].forEach(([evo,col,lg])=>{
      if(evo&&evo!==p.name&&!seen.has(evo)){
        seen.add(evo);
        parts.push(`<span style="color:${col};font-size:9px;opacity:0.6">${lg}→${evo}</span>`);
      }
    });
    return parts.length?`<div class="target-evo" style="font-style:italic">${parts.join(' ')}</div>`:'';
  })();

  const genderStr=p.gender==='♂'?' <span style="color:#6fa8dc;font-size:10px">♂</span>':p.gender==='♀'?' <span style="color:#ea9999;font-size:10px">♀</span>':'';

  return `<tr class="row-${p.decision}${p.isHundo?' row-hundo':''}" data-idx="${p.idx}">
    <td style="min-width:44px;white-space:nowrap">${starCell(p)}<button class="edit-btn" onclick="toggleOverride('${p.stableKey}')" title="Overrides">✎</button></td>
    <td class="poke-name-cell">
      <div class="poke-variants">${variantTags(p)}</div>
      <div class="poke-name">${p.name}${p.form?` <span class="poke-form">(${p.form})</span>`:''}${genderStr}</div>
      ${evoIndicators}
    </td>
    <td style="font-size:11px;color:var(--muted)">${p.cp||'--'}</td>
    <td class="${p.suggestStar?'nick-starred':'nick-suggested'}" style="cursor:pointer"
        data-nick="${(p.nickname||'').replace(/"/g,'&quot;')}"
        onclick="copyNick(this,this.dataset.nick)" title="Click to copy nickname">
      ${p.nickname}${altNicks}
    </td>
    <td>
      <div class="iv-bar"><div class="iv-fill" style="width:${Math.max(2,iv*0.45)}px;background:${ivc}"></div><span class="iv-num" style="color:${ivc}">${iv}%</span></div>
      <div class="iv-ivs">${p.atkIV}/${p.defIV}/${p.staIV}</div>
    </td>
    <td>${lrHTML(p.rankPctL||null,p.rankNumL,p.dustL,p.isLucky)}</td>
    <td>${lrHTML(p.rankPctG||null,p.rankNumG,p.dustG,p.isLucky)}</td>
    <td>${lrHTML(p.rankPctU||null,p.rankNumU,p.dustU,p.isLucky)}</td>
    <td><span style="color:${iv>=90?'var(--green)':iv>=70?'var(--cyan)':'var(--muted)'};font-size:11px">${Math.round(p.rankPctM||0)}%</span></td>
    <td style="font-size:11px;color:var(--muted);white-space:nowrap">${p.catchDate||'--'}</td>
    <td data-moves-species="${p.name}" data-moves-idx="${p.idx}">${moveHTML(p)}</td>
    <td><button class="hide-btn" onclick="hideRow('${p.idx}')" title="Hide">&#10005;</button></td>
    <tr class="override-row" id="ov-${p.stableKey}" style="display:none">
      <td colspan="12" style="padding:8px 12px;background:var(--surf2)">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:12px">
          <label style="display:flex;align-items:center;gap:4px"><input type="checkbox" onchange="setOverride('${p.stableKey}','is_shiny',this.checked)" ${p.isShiny?'checked':''}> ✨ Shiny</label>
          <label style="display:flex;align-items:center;gap:4px"><input type="checkbox" onchange="setOverride('${p.stableKey}','is_dynamax',this.checked)" ${p.isDynamax?'checked':''}> Dynamax</label>
          <label style="display:flex;align-items:center;gap:4px"><input type="checkbox" onchange="setOverride('${p.stableKey}','is_gigantamax',this.checked)" ${p.isGigantamax?'checked':''}> Gigantamax</label>
          <label style="display:flex;align-items:center;gap:4px">Vivillon:
            <input type="text" value="${p.vivillonPattern||''}" placeholder="e.g. Polar" style="width:80px;background:var(--surf);border:1px solid var(--border);border-radius:4px;padding:2px 6px;color:var(--text);font-size:11px" onchange="setOverride('${p.stableKey}','vivillon_pattern',this.value)">
          </label>
          <label style="display:flex;align-items:center;gap:4px">Override:
            <select onchange="setOverride('${p.stableKey}','manual_decision',this.value)" style="background:var(--surf);border:1px solid var(--border);border-radius:4px;padding:2px 6px;color:var(--text);font-size:11px">
              <option value="" ${!p.manualDecision?'selected':''}>Auto</option>
              <option value="keep" ${p.manualDecision==='keep'?'selected':''}>Keep</option>
              <option value="trade" ${p.manualDecision==='trade'?'selected':''}>Trade</option>
              <option value="review" ${p.manualDecision==='review'?'selected':''}>Review</option>
            </select>
          </label>
          <label style="display:flex;align-items:center;gap:4px">Notes:
            <input type="text" value="${p.notes||''}" placeholder="Optional notes" style="width:140px;background:var(--surf);border:1px solid var(--border);border-radius:4px;padding:2px 6px;color:var(--text);font-size:11px" onchange="setOverride('${p.stableKey}','notes',this.value)">
          </label>
          <button class="btn" style="padding:2px 8px;font-size:10px" onclick="clearOverride('${p.stableKey}')">Clear overrides</button>
          ${!p.catchDate?'<span style="color:var(--gold);font-size:10px">⚠ No catch date — override may not survive re-export</span>':''}
        </div>
      </td>
    </tr>
  </tr>`;
}