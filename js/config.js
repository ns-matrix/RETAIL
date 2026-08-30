// config.js — Supabase connection configuration
// IMPORTANT: Only the anon (publishable) key goes here.
// NEVER put the secret (service_role) key in any file shipped to the browser.

const CONFIG = {
  staging: {
    SUPABASE_URL: 'https://yczusrizcfifplvcbmjv.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_5eKJskGKNU6YUVg6Brzo4A_RYov00YZ',
  },
  production: {
    SUPABASE_URL: 'https://yczusrizcfifplvcbmjv.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_5eKJskGKNU6YUVg6Brzo4A_RYov00YZ',
  },
};

// Toggle based on deployment target
const ENV = window.location.hostname.includes('localhost') ? 'staging' : 'production';
const currentConfig = CONFIG[ENV];

window.APP_CONFIG = currentConfig;
