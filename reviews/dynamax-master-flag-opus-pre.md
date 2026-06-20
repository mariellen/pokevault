# Opus Pre-Implementation Review
_Generated: 20 Jun 2026 13:59_

# PokéVault Review — `dynamax-master-flag`

## Root Cause Analysis

The current Dynamax handling has two distinct defects relative to the approved rules:

**1. Dynamax competes with regular Pokémon for capped league slots.**
In the main `['M','U','G','L'].forEach` league pass, there is **no exclusion of Dynamax Pokémon**. A Dynamax row is eligible for G/U/L slots exactly like any regular Pokémon, so it can displace a regular winner — directly violating the approved rule *"Dynamax should NOT compete with regular Pokémon for capped league slots."* The `variantKey` grouping splits shadow/purified/lucky into sub-groups but has **no `|dynamax` branch**, so Dynamax falls into the `''` (regular) bucket and fights regular Pokémon head-on.

**2. There is no best-overall Dynamax "Master" (Ⓜ) concept at all.**
The `dynamax` slot logic picks one keeper per `maxTargetKey` and the nick path (`slot==='dynamax'`) only ever emits a *capped-league* symbol (`G/U/L/M` rank) or `Ⓡ{IV%}`. There is no path that emits `NameⓂ{IV%}Ⓓ` for the best Dynamax. The Ⓜ symbol is currently reserved exclusively for `wonMasterSlot` / purify-M (regular Master winner) — Dynamax never sets that flag, and shouldn't, because that flag drives family-level Master single-keeper reconciliation.

So this is **both** an engine change (slot eligibility separation + a new best-Dynamax selection) **and** a nick-generation change (new Ⓜ-for-Dynamax branch).

---

## Answers to the Four Questions (decisions for Mariellen)

**Q1 — engine or nick only?** Engine + nick. Three engine changes (exclude Dmax from capped competition, run a per-family capped-league competition *among Dmax only*, flag the single best-overall Dmax) plus one nick branch.

**Q2 — reuse `wonMasterSlot` or new flag?** **Use a separate `wonDynamaxMaster` flag.** Reusing `wonMasterSlot` would inject Dynamax into the non-shadow Master single-keeper reconciliation (`masterCmp` block), the ML-placeholder pass, and `best_overall` dedup — all of which assume `wonMasterSlot` means "the family's one regular Master battler." Keep them orthogonal.

**Q3 — should Dmax compete with regulars for capped slots?** **No** (per approved rules). They must be separated. Recommended mechanism: add `|dynamax` to `variantKey` so Dynamax forms an independent sub-group, exactly like shadow/lucky/purified. This gives Dmax-vs-Dmax capped competition *for free* without touching regular winners.

> ⚑ **DECISION NEEDED FROM MARIELLEN:** The example shows `ElectabuⓊ95Ⓓ` winning an Ultra slot *independently*. Confirm Dmax should compete **among themselves** for capped slots (a Dmax Ultra winner coexists with the regular Ultra winner, like shadows do) — **not** that Dmax are excluded from capped slots entirely. The rules text says both "compete for capped league slots" and "NOT compete with regular Pokémon" — the only consistent reading is *separate sub-group competition*. This review assumes that reading.

---

## Risk Assessment

### Scope
- **All Dynamax-flagged Pokémon** (set via `is_dynamax` override only — never CSV).
- **Branching families** (Eevee): `maxTargetKey` keys by final evo, so best-Dmax-Ⓜ must be decided **per max-evo target**, consistent with existing `dmaxCandidates` keying. The Electabuzz example is single-target; Eevee is the real edge case.
- **Interaction with regular winners:** previously a high-IV Dmax could steal a regular GL/UL/LL slot. Fixing this will *change regular slot winners* in any family that contains a Dmax — expect nick churn there (this is correct behaviour, but flag it).

### Security implications
None. No new external input, no injection surface. `is_dynamax` is an authenticated Supabase override already trusted by the engine.

### Regression risk
- **Capped-league winner changes:** any test fixture with a Dmax that currently wins a GL/UL/LL slot will change once Dmax is removed from regular competition. Audit existing Dmax fixtures.
- **`maxTargetKey` / Eevee Dmax test** — must still keep one keeper per evo target; don't collapse into one Ⓜ across both Vaporeon and Flareon targets.
- **Star type:** the best Dmax currently earns a green/gold star via the `dynamax` slot branch in `suggestStar`. The new Ⓜ Dmax must keep `decision='keep'` + green/gold star — do **not** let it fall into the visibility-star (trade) path.
- **`completeness` / `hasDynamaxKeep`** — unaffected (still keys on `isDynamax && decision==='keep'`), but verify the Ⓜ Dmax keeps `decision==='keep'`.

---

## Implementation Guidance

All changes in `pokevault-refactor/js/analyse.js`.

### Change 1 — Separate Dynamax (and Gigantamax) from regular capped competition
In the main league pass, in the `byEvoStage` grouping (`variantKey` computation):

```js
const variantKey = p.isShadow ? '|shadow'
  : p.isPurified ? '|purified'
  : p.isLucky ? '|lucky'
  : (p.isDynamax ? '|dynamax' : p.isGigantamax ? '|gigantamax' : '');
```

Apply the **same change** to every other `variantKey`/`vk` derivation:
- the `slotWinners` recording loop,
- the diff-evo conflict-resolution `vk`,
- the duplicate-slot dedup `vk`,
- the `nextBest` `m_vk` matching.

This makes Dmax compete only against Dmax for capped slots and never displace regulars. **Verify all five sites are updated** or you'll get split-brain grouping (one site treats a Dmax as regular, another as `|dynamax`).

> Note: Lucky+Dynamax and Shadow+Dynamax combos exist. Decide precedence: keep shadow/purified/lucky **ahead** of dynamax in the ternary (as written above) so a Lucky-Dmax stays in the `|lucky` group. Flag to Mariellen — see Watch Points.

### Change 2 — Flag the best-overall Dynamax with `wonDynamaxMaster`
In the special-slots section, **after** the existing `dmaxCandidates` block that assigns the `dynamax` slot, add a best-overall pass keyed the same way:

```js
// Best-overall Dynamax per max-evo target → Master power-up candidate (Ⓜ).
// Fires even if another Dmax (or this one) holds a capped league slot.
Object.values(dmaxCandidates).forEach(cands => {
  // cands already sorted by ivAvg desc, isFavorite tiebreak (from the block above)
  const best = cands[0];
  if (best) best.wonDynamaxMaster = true;
});
```

Do the equivalent for `gmaxCandidates` (`wonGigantamaxMaster`) **only if Mariellen confirms Gmax parity** — the brief is Dynamax-only. See Watch Points.

Initialise `wonDynamaxMaster:false` in the parsed-object literal alongside `isDynamax`.

### Change 3 — Nick generation: emit Ⓜ for the best Dynamax
In `buildNickname`, the `slot==='dynamax'` branch currently is:

```js
} else if (slot==='dynamax') {
  const best=['G','U','L','M'].find(l=>(p['rankPct'+l]||0)>=RULES.keepThreshold);
  if (best) { ... mid=LC[best]+pv; }
  else { mid=LC.R+String(iv); }
  return fitName(base, mid, nickSuf, 12);
}
```

Change to give the best-overall Dmax `Ⓜ{IV%}` regardless of capped slot:

```js
} else if (slot==='dynamax') {
  if (p.wonDynamaxMaster) {
    mid = LC.M + String(iv);             // NameⓂ{IV%}Ⓓ — Master power-up candidate
  } else {
    const best=['G','U','L','M'].find(l=>(p['rankPct'+l]||0)>=RULES.keepThreshold);
    if (best) { const pv=Math.round(p['rankPct'+best]||0); mid=LC[best]+(pv===100?PERFECT:String(pv)); }
    else { mid=LC.R+String(iv); }
  }
  return fitName(base, mid, nickSuf, 12);
}
```

**Critical:** the best-overall Dmax may NOT be routed through the `dynamax` slot if it *also* won a capped Dmax slot, because the decision block checks `p.slots.includes('dynamax')`. You must ensure the best-overall Dmax is **routed to the dynamax nick branch even when it holds a capped Dmax league slot**, OR add the Ⓜ logic into the capped-league nick path. See Change 4.

### Change 4 — Decision/routing for the Ⓜ Dmax
The cleanest approach: in the decision block, **before** the `hasLeagueSlot` branch, add:

```js
} else if (p.wonDynamaxMaster) {
  p.decision='keep'; p.reason='Best Dynamax — power up to Master';
  p.nickname=buildNickname(p,'dynamax');   // emits NameⓂ{IV%}Ⓓ
```

This guarantees the best Dmax always renders Ⓜ even if it independently won a capped Dmax slot. The *other* Dmax that won a capped slot still flows through `hasLeagueSlot` → `ElectabuⓊ95Ⓓ`. The slot-less Dmax flow through the existing `dynamax` slot → `ElectabuⓇ87Ⓓ`.

Confirm `hasLeagueSlot` does **not** swallow the Ⓜ Dmax first — place the `wonDynamaxMaster` branch **above** it.

### Change 5 — RULES.md
Update §3 Special slots `dynamax` row, §4 Dynamax/Gigantamax section, and the Appendix to document: separate Dmax capped competition, `wonDynamaxMaster` flag, and the `NameⓂ{IV%}Ⓓ` best-overall nick. Note Ⓜ is now valid for *both* the regular Master winner **and** the best Dmax (different mechanisms).

---

## Required Tests

New file `analyse.dynamax_master.test.js`:

1. **Electabuzz golden case** — three Dmax Electabuzz (96/89/87%), CPs as in brief:
   - 96% → `ElectabuⓂ96Ⓓ`
   - 89% (wins Ultra among Dmax) → `ElectabuⓊ…Ⓓ` (Ⓤ, not Ⓜ, not Ⓡ)
   - 87% (no slot) → `ElectabuⓇ87Ⓓ`
2. **Best Dmax also wins a capped slot** — best-IV Dmax that *also* qualifies for an Ultra slot still renders `Ⓜ`, not `Ⓤ`. (Asserts Change 4 ordering.)
3. **Dmax does not displace regular winner** — a family with one 98% regular UL Pokémon and one 99% Dmax: the **regular** Pokémon keeps the `Ⓤ` slot; the Dmax gets `Ⓜ` (best Dm