/* Supabase credentials for the site.
 *
 * Both of these are meant to be public - the anon key is a browser key and is
 * safe to commit. The service_role key is NOT: it bypasses row level security,
 * so it must never appear in this folder.
 *
 * Fill these in from Supabase -> Project Settings -> API. Until they are set,
 * the site runs exactly as before and the account button explains what is
 * missing rather than failing silently.
 */
window.SUPABASE_CONFIG = {
  url: "",     // e.g. "https://abcdefghijklm.supabase.co"
  anonKey: ""  // the "anon" / "publishable" key
};
