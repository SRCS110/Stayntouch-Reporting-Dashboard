/**
 * auth.js — Shared Supabase authentication module
 * Imported by login.html and index.html via <script src="auth.js">
 *
 * Handles:
 *  - Supabase client initialisation
 *  - Session get / watch
 *  - Google OAuth sign-in
 *  - Email + password sign-in / sign-up
 *  - Password reset
 *  - Sign-out
 *  - Route guard (redirect to login if no session)
 */

const SUPABASE_URL     = 'https://kflpqbxavcumqmoicquo.supabase.co';
const SUPABASE_ANON    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmbHBxYnhhdmN1bXFtb2ljcXVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzNzQzNTEsImV4cCI6MjEwMDk1MDM1MX0.2t_OdBvifeFd58ooEHqnPn_lrgPvx1sEOADxOHuD0As';

// Supabase JS v2 loaded via CDN in each HTML file
// window.supabase is set by the CDN script before auth.js runs
let _client = null;

function getClient() {
  if (_client) return _client;
  if (!window.supabase) throw new Error('Supabase CDN not loaded');
  _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: {
      autoRefreshToken: true,
      persistSession:   true,
      detectSessionInUrl: true   // picks up OAuth callback hash
    }
  });
  return _client;
}

/* ── Session ──────────────────────────────────────────────────────── */

async function getSession() {
  const { data } = await getClient().auth.getSession();
  return data.session;
}

function onAuthStateChange(callback) {
  return getClient().auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}

/* ── Sign in ──────────────────────────────────────────────────────── */

async function signInWithGoogle() {
  const { error } = await getClient().auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${location.origin}/index.html`
    }
  });
  if (error) throw error;
}

async function signInWithEmail(email, password) {
  const { data, error } = await getClient().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function signUpWithEmail(email, password, metadata = {}) {
  const { data, error } = await getClient().auth.signUp({
    email,
    password,
    options: { data: metadata }
  });
  if (error) throw error;
  return data;
}

/* ── Password reset ───────────────────────────────────────────────── */

async function sendPasswordReset(email) {
  const { error } = await getClient().auth.resetPasswordForEmail(email, {
    redirectTo: `${location.origin}/login.html?mode=reset`
  });
  if (error) throw error;
}

async function updatePassword(newPassword) {
  const { error } = await getClient().auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/* ── Sign out ─────────────────────────────────────────────────────── */

async function signOut() {
  await getClient().auth.signOut();
  location.href = 'login.html';
}

/* ── Route guard — call at top of index.html ──────────────────────── */

async function requireAuth() {
  const session = await getSession();
  if (!session) {
    location.href = 'login.html';
    return null;
  }
  return session;
}

/* ── User helpers ─────────────────────────────────────────────────── */

async function getCurrentUser() {
  const { data } = await getClient().auth.getUser();
  return data.user;
}

function getUserDisplayName(user) {
  if (!user) return '';
  return (
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split('@')[0] ||
    'User'
  );
}

function getUserAvatar(user) {
  return user?.user_metadata?.avatar_url || null;
}

/* ── Export ───────────────────────────────────────────────────────── */

window.Auth = {
  getClient,
  getSession,
  onAuthStateChange,
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  sendPasswordReset,
  updatePassword,
  signOut,
  requireAuth,
  getCurrentUser,
  getUserDisplayName,
  getUserAvatar
};
