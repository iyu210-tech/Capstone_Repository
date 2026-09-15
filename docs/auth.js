/* Sign-in for the site: Google OAuth plus plain email + password, on Supabase.
 *
 * Deliberately self-contained. It owns the header account control and the
 * dialog, and touches nothing the router in app.js renders, so topic pages and
 * demos behave the same whether or not anyone is signed in.
 *
 * Nothing here gates the content. The visualisations stay open to everyone -
 * an account exists so progress can be saved later, not to put a wall in front
 * of a student who is stuck at 11pm.
 */
const cfg = window.SUPABASE_CONFIG || {};
const configured = Boolean(cfg.url && cfg.anonKey);

// The rest of this site makes zero third-party requests, and a reader who
// never signs in should not pay for one. So supabase-js is fetched on demand:
// when the dialog opens, or - checked synchronously below, without loading
// anything - when a stored session says this browser is already signed in.
const STORAGE_KEY = configured
  ? "sb-" + new URL(cfg.url).hostname.split(".")[0] + "-auth-token"
  : "";

function hasStoredSession() {
  try { return Boolean(localStorage.getItem(STORAGE_KEY)); } catch (e) { return false; }
}

const slot = document.getElementById("account");
const dlg = document.getElementById("auth-dialog");
const form = document.getElementById("auth-form");
const emailEl = document.getElementById("auth-email");
const passEl = document.getElementById("auth-password");
const submitBtn = document.getElementById("auth-submit");
const googleBtn = document.getElementById("auth-google");
const msgEl = document.getElementById("auth-msg");
const titleEl = document.getElementById("auth-title");
const switchBtn = document.getElementById("auth-switch");
const switchTxt = document.getElementById("auth-switch-text");
const resetBtn = document.getElementById("auth-reset");
const setupEl = document.getElementById("auth-setup");

let supabase = null;
let loading = null;

// Resolves to a ready client, loading the library at most once.
function client() {
  if (supabase) return Promise.resolve(supabase);
  if (loading) return loading;
  loading = import("https://esm.sh/@supabase/supabase-js@2").then(function (mod) {
    supabase = mod.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    // Fires on every sign-in, sign-out and token refresh, so this is the only
    // place the header is painted and it cannot drift from the real session.
    supabase.auth.onAuthStateChange(function (_event, session) {
      if (session && session.user) renderSignedIn(session.user);
      else renderSignedOut();
      if (session && dlg.open) dlg.close();
    });
    window.auth = supabase;
    return supabase;
  });
  return loading;
}

let mode = "signin";   // "signin" | "signup"
let busy = false;

/* ----------------------------------------------------------------- helpers */

function say(text, kind) {
  msgEl.textContent = text || "";
  msgEl.dataset.kind = kind || "";
  msgEl.hidden = !text;
}

function setBusy(on) {
  busy = on;
  submitBtn.disabled = on;
  googleBtn.disabled = on;
  submitBtn.textContent = on
    ? "Working\u2026"
    : (mode === "signin" ? "Sign in" : "Create account");
}

function setMode(next) {
  mode = next;
  const signin = mode === "signin";
  titleEl.textContent = signin ? "Sign in" : "Create an account";
  submitBtn.textContent = signin ? "Sign in" : "Create account";
  switchTxt.textContent = signin ? "New here?" : "Already have an account?";
  switchBtn.textContent = signin ? "Create an account" : "Sign in";
  passEl.autocomplete = signin ? "current-password" : "new-password";
  resetBtn.hidden = !signin;
  say("");
}

// Supabase error text is written for developers. These are the few a student
// will actually hit, said in a way that tells them what to do next.
function friendly(error) {
  const m = (error && error.message) || "Something went wrong. Try again.";
  if (/invalid login credentials/i.test(m)) return "That email and password do not match an account.";
  if (/email not confirmed/i.test(m)) return "Check your email and click the confirmation link first.";
  if (/user already registered/i.test(m)) return "There is already an account with that email - try signing in.";
  if (/password should be at least/i.test(m)) return "Passwords need to be at least 6 characters.";
  if (/rate limit|too many/i.test(m)) return "Too many attempts. Wait a minute and try again.";
  if (/failed to fetch|networkerror/i.test(m)) return "Could not reach the server. Check your connection.";
  return m;
}

/* -------------------------------------------------------------- header UI */

// The phone nav forwards its account tab to the header button, so the label
// has to say which button that is - a tab reading "Sign in" that silently
// signs you out would be the worst kind of surprise.
function mirrorToNav(text) {
  const el = document.getElementById("mnav-account-label");
  if (el) el.textContent = text;
}

function label(user) {
  const name = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || "";
  return name || user.email || "Signed in";
}

function renderSignedOut() {
  mirrorToNav("Sign in");
  slot.innerHTML = "";
  const btn = document.createElement("button");
  btn.className = "ghost-btn";
  btn.id = "open-auth";
  btn.textContent = "Sign in";
  btn.addEventListener("click", open);
  slot.appendChild(btn);
}

function renderSignedIn(user) {
  mirrorToNav("Sign out");
  slot.innerHTML = "";

  const who = document.createElement("span");
  who.className = "account-who";
  who.title = user.email || "";
  who.textContent = label(user);

  const out = document.createElement("button");
  out.className = "ghost-btn";
  out.textContent = "Sign out";
  out.addEventListener("click", async () => {
    out.disabled = true;
    await (await client()).auth.signOut();
  });

  slot.append(who, out);
}

/* ---------------------------------------------------------------- dialog */

function open() {
  setMode("signin");
  // The real controls are always shown, so what the page will look like once
  // the keys are in is never a surprise - they are just inert until then.
  if (configured) client();   // start the fetch while they read the form
  setupEl.hidden = configured;
  submitBtn.disabled = !configured;
  googleBtn.disabled = !configured;
  emailEl.disabled = passEl.disabled = resetBtn.disabled = !configured;
  emailEl.value = "";
  passEl.value = "";
  dlg.showModal();
  if (configured) emailEl.focus();
}

switchBtn.addEventListener("click", () => setMode(mode === "signin" ? "signup" : "signin"));

googleBtn.addEventListener("click", async () => {
  setBusy(true);
  say("");
  const { error } = await (await client()).auth.signInWithOAuth({
    provider: "google",
    // Come back to the exact page they left, hash route included, so signing
    // in from a topic page does not dump them on the home screen.
    options: { redirectTo: location.href }
  });
  // On success the browser navigates away, so reaching here means it failed.
  if (error) { setBusy(false); say(friendly(error), "err"); }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy) return;

  const email = emailEl.value.trim();
  const password = passEl.value;
  if (!email || !password) { say("Enter an email and a password.", "err"); return; }

  setBusy(true);
  say("");

  if (mode === "signin") {
    const { error } = await (await client()).auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { say(friendly(error), "err"); return; }
    dlg.close();                     // onAuthStateChange repaints the header
  } else {
    const { data, error } = await (await client()).auth.signUp({
      email, password, options: { emailRedirectTo: location.href }
    });
    setBusy(false);
    if (error) { say(friendly(error), "err"); return; }
    // With email confirmation on, there is no session yet - saying "done"
    // here would be a lie, and the student would sit waiting on a blank page.
    if (data.session) dlg.close();
    else say("Account created. Check " + email + " for a confirmation link, then sign in.", "ok");
  }
});

resetBtn.addEventListener("click", async () => {
  const email = emailEl.value.trim();
  if (!email) { say("Type your email above first, then press this.", "err"); emailEl.focus(); return; }
  setBusy(true);
  const { error } = await (await client()).auth.resetPasswordForEmail(email, { redirectTo: location.href });
  setBusy(false);
  say(error ? friendly(error) : "Password reset link sent to " + email + ".", error ? "err" : "ok");
});

/* ----------------------------------------------------------------- start */

renderSignedOut();

// Two reasons to load the client immediately: a session is already stored, or
// we have just come back from Google with a code in the URL to exchange.
const returning = /[?&#](code|access_token|error)=/.test(location.search + location.hash);
if (configured && (hasStoredSession() || returning)) {
  client().then((sb) => sb.auth.getSession()).then(({ data }) => {
    if (data.session) renderSignedIn(data.session.user);
  });
}
