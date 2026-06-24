'use strict';
// Schema validation: every field the parser produces that is meaningful to the DB
// must have a matching entry in COLLECTION_DB_FIELDS.
// Prevents bugs like the scan_date miss where a field was parsed but never written to the DB.

const path = require('path');
const { loadCSV } = require('./csvParser');

// Load COLLECTION_DB_FIELDS from supabase.js via its CommonJS export shim
const { COLLECTION_DB_FIELDS } = require('../js/supabase.js');

// Mapping of camelCase parsed fields → snake_case DB columns written by saveCollectionToCloud.
// Any parsed field that IS written to the DB must appear here.
// Fields deliberately NOT written (e.g. computed slots, evo indicators) are omitted.
const PARSER_TO_DB = {
  stableKey:      'pokemon_index',
  name:           'name',
  form:           'form',
  pokeNum:        'pokemon_num',
  cp:             'cp',
  atkIV:          'atk_iv',
  defIV:          'def_iv',
  staIV:          'sta_iv',
  ivAvg:          'iv_avg',
  level:          'level',
  rankPctG:       'rank_pct_g',
  rankPctU:       'rank_pct_u',
  rankPctL:       'rank_pct_l',
  rankNumG:       'rank_num_g',
  rankNumU:       'rank_num_u',
  rankNumL:       'rank_num_l',
  dustG:          'dust_g',
  dustU:          'dust_u',
  dustL:          'dust_l',
  quickMove:      'quick_move',
  chargeMove1:    'charge_move1',
  chargeMove2:    'charge_move2',
  isLucky:        'is_lucky',
  isShadow:       'is_shadow',
  isPurified:     'is_purified',
  isFavorite:     'is_favorite',
  catchDate:      'catch_date',
  scanDate:       'scan_date',
  pvpTag:         'pvp_tag',
  evolvedNameG:   'evolved_name_g',
  evolvedNameU:   'evolved_name_u',
  evolvedNameL:   'evolved_name_l',
  evolvedFormG:   'evolved_form_g',
  evolvedFormU:   'evolved_form_u',
  evolvedFormL:   'evolved_form_l',
};

describe('Schema validation — parser fields vs DB columns', () => {
  it('COLLECTION_DB_FIELDS is a non-empty array', () => {
    expect(Array.isArray(COLLECTION_DB_FIELDS)).toBe(true);
    expect(COLLECTION_DB_FIELDS.length).toBeGreaterThan(0);
  });

  it('every PARSER_TO_DB mapping target exists in COLLECTION_DB_FIELDS', () => {
    const missing = Object.entries(PARSER_TO_DB)
      .filter(([, dbCol]) => !COLLECTION_DB_FIELDS.includes(dbCol))
      .map(([parsed, dbCol]) => `${parsed} → ${dbCol}`);
    if (missing.length) {
      console.error('Fields written by parser but missing from COLLECTION_DB_FIELDS:\n', missing.join('\n'));
    }
    expect(missing).toEqual([]);
  });

  it('fixture CSV has Scan Date column with non-empty values', () => {
    const rows = loadCSV(path.join(__dirname, 'poke_genie_fixture.csv'));
    expect(rows.length).toBeGreaterThan(0);
    const headers = Object.keys(rows[0]);
    expect(headers).toContain('Scan Date');
    const withDate = rows.filter(r => r['Scan Date'] && r['Scan Date'].trim());
    expect(withDate.length).toBeGreaterThan(0);
  });

  it('scan_date is in COLLECTION_DB_FIELDS', () => {
    expect(COLLECTION_DB_FIELDS).toContain('scan_date');
  });
});
