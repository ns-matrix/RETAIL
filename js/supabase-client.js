// supabase-client.js — Shared Supabase client instance
// Loaded via CDN (supabase-js UMD) in index.html / admin.html

let supabaseClient = null;

function getSupabase() {
  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(
      window.APP_CONFIG.SUPABASE_URL,
      window.APP_CONFIG.SUPABASE_ANON_KEY
    );
  }
  return supabaseClient;
}
