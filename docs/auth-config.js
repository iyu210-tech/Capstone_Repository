/* Supabase credentials for the site.
 *
 * Both of these are meant to be public - the anon key is a browser key and is
 * safe to commit. The service_role key is NOT: it bypasses row level security,
 * so it must never appear in this folder.
 *
 * Fill these in from Supabase -> Project Settings -> API. Until they are set,
 * the site runs exactly as before and the account button explains what is
 * missing rather than failing silently.
 *
 * This file is the source of truth on any host that serves docs/ as plain
 * files - Vercel and GitHub Pages both do. Only server.py, for Render, can
 * override it from SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY, because only
 * there is a process running to generate a response.
 */
window.SUPABASE_CONFIG = {
  url: "https://vilvxunldjqawkknphip.supabase.co",
  anonKey: "sb_publishable_IkSgQHAHlIHHi543pt9KVg_HWUzHJxF"
};
