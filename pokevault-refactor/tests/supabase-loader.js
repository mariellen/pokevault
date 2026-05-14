'use strict';
// Loads supabase.js into a Function scope with injectable mocks for supabaseFetch
// and updateSyncStatus, so saveCollectionToCloud can be tested without a real network.
//
// Strategy: rename the function DEFINITIONS so the injected parameter names win.
// Call sites inside saveCollectionToCloud still reference the original names and
// resolve to the injected mocks.

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'supabase.js'), 'utf8');

const stripped = src
  .replace('async function supabaseFetch(', 'async function _realSupabaseFetch(')
  .replace('function updateSyncStatus(', 'function _realUpdateSyncStatus(');

// Shim browser globals referenced by supabase.js at the top level.
// _real* functions use SUPABASE_KEY/URL but are never called in tests.
const SHIMS = `
  const SUPABASE_KEY = 'test';
  const SUPABASE_URL = 'http://test';
  const localStorage = { setItem() {}, getItem() { return null; } };
  const supabaseClient = undefined;
  async function getCurrentUserId() { return 'test-user-id'; }
`;

/**
 * Returns { saveCollectionToCloud } with supabaseFetch and updateSyncStatus replaced
 * by the provided mocks.
 *
 * @param {{ supabaseFetch?: Function, updateSyncStatus?: Function }} opts
 */
module.exports.createEnv = function({ supabaseFetch = async () => ({}), updateSyncStatus = () => {} } = {}) {
  const factory = new Function(
    'supabaseFetch', 'updateSyncStatus',
    SHIMS + stripped + '\nreturn { saveCollectionToCloud, loadCollectionFromCloud, COLLECTION_DB_FIELDS };'
  );
  return factory(supabaseFetch, updateSyncStatus);
};
