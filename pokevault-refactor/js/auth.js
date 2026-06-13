// ═══════════════════════════════════════════════
// PokéVault — Auth (Supabase JS SDK)
// Uses SDK only for session management.
// All data operations stay in supabase.js via supabaseFetch().
// ═══════════════════════════════════════════════
'use strict';

// Assign to window so supabase.js can reach it across script boundaries.
// (const at the top level of a classic script is NOT a window property.)
window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Cached session JWT — updated on every auth state change so supabaseFetch
// can read it synchronously without a second async getSession() call.
let _accessToken = null;

// Used by supabaseFetch in supabase.js for the Authorization header.
function getAccessToken() {
  return _accessToken || SUPABASE_KEY;
}

async function initAuth() {
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  _accessToken = session?.access_token || null;
  if (session) setLoggedIn(session.user);
  else setLoggedOut();

  window.supabaseClient.auth.onAuthStateChange((event, session) => {
    _accessToken = session?.access_token || null;  // keep cache current
    if (session) {
      setLoggedIn(session.user);
      if (event === 'SIGNED_IN') {
        closeLoginModal();
        // GA4: Google OAuth completed. Guarded — trackEvent lives in app.js.
        if (typeof trackEvent === 'function') trackEvent('sign_in');
      }
    } else {
      setLoggedOut();
    }
  });
}

async function signInWithGoogle() {
  await window.supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
}

async function sendMagicLink() {
  const email = document.getElementById('magicLinkEmail').value.trim();
  if (!email) return;
  const btn = document.getElementById('magicLinkBtn');
  if (btn) btn.disabled = true;
  const { error } = await window.supabaseClient.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + window.location.pathname }
  });
  if (error) {
    updateSyncStatus('⚠ ' + error.message, 'warn');
    if (btn) btn.disabled = false;
  } else {
    document.getElementById('magicLinkSent').style.display = 'block';
  }
}

async function signOut() {
  // Fire BEFORE signOut() — a subsequent state-clear/reload can kill an
  // in-flight GA beacon. Guarded — trackEvent lives in app.js.
  if (typeof trackEvent === 'function') trackEvent('sign_out');
  await window.supabaseClient.auth.signOut();
}

function setLoggedIn(user) {
  const emailEl    = document.getElementById('userEmail');
  const loginBtn   = document.getElementById('loginBtn');
  const logoutBtn  = document.getElementById('logoutBtn');
  const loadCsvBtn = document.getElementById('loadNewCsvBtn');
  if (emailEl)    { emailEl.textContent = user.email; emailEl.style.display = 'inline'; }
  if (loginBtn)   loginBtn.style.display   = 'none';
  if (logoutBtn)  logoutBtn.style.display  = 'inline';
  if (loadCsvBtn) loadCsvBtn.style.display = 'inline';
  enableCloudButtons();
  loadOverrides();  // reload with auth JWT so user sees their overrides
}

function setLoggedOut() {
  // Clear any loaded collection so a subsequent sign-in doesn't briefly show the previous user's data
  if (typeof overridesCache !== 'undefined') overridesCache = {};
  if (typeof allPokemon !== 'undefined' && allPokemon.length > 0) {
    allPokemon = []; filteredFamilies = []; families = [];
    const mc = document.getElementById('main-content');
    if (mc) mc.innerHTML = '';
    if (typeof renderSummary === 'function') renderSummary([]);
  }

  const emailEl    = document.getElementById('userEmail');
  const loginBtn   = document.getElementById('loginBtn');
  const logoutBtn  = document.getElementById('logoutBtn');
  const loadCsvBtn = document.getElementById('loadNewCsvBtn');
  if (emailEl)    emailEl.style.display    = 'none';
  if (loginBtn)   loginBtn.style.display   = 'inline';
  if (logoutBtn)  logoutBtn.style.display  = 'none';
  if (loadCsvBtn) loadCsvBtn.style.display = 'none';
  disableCloudButtons();
  updateSyncStatus('Sign in to enable cloud sync', 'warn');
}

function showLoginModal() {
  const m = document.getElementById('loginModal');
  if (m) m.style.display = 'flex';
}

function closeLoginModal() {
  const m = document.getElementById('loginModal');
  if (m) m.style.display = 'none';
}

async function getCurrentUserId() {
  if (!window.supabaseClient) return null;
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  return session?.user?.id || null;
}

function enableCloudButtons() {
  document.querySelectorAll('.cloud-btn').forEach(btn => {
    btn.disabled = false;
    btn.title = '';
  });
}

function disableCloudButtons() {
  document.querySelectorAll('.cloud-btn').forEach(btn => {
    btn.disabled = true;
    btn.title = 'Sign in to save your collection';
  });
}
