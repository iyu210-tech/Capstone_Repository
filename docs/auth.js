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

// Pinned to an exact release rather than @2. A floating range means a new
// supabase-js publish - or a compromised CDN answer for "latest 2.x" - runs
// on every signed-in visit without anyone reviewing it. Bump this by hand.
const SUPABASE_JS = "https://esm.sh/@supabase/supabase-js@2.117.2";

const slot = document.getElementById("account");
const dlg = document.getElementById("auth-dialog");
const form = document.getElementById("auth-form");
const emailEl = document.getElementById("auth-email");
const emailLabel = document.querySelector('label[for="auth-email"]');
const passEl = document.getElementById("auth-password");
const submitBtn = document.getElementById("auth-submit");
const googleBtn = document.getElementById("auth-google");
const orRow = document.getElementById("auth-or");
const msgEl = document.getElementById("auth-msg");
const titleEl = document.getElementById("auth-title");
const switchRow = document.getElementById("auth-switch-row");
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
  loading = import(SUPABASE_JS).then(function (mod) {
    supabase = mod.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    // Fires on every sign-in, sign-out and token refresh, so this is the only
    // place the header is painted and it cannot drift from the real session.
    supabase.auth.onAuthStateChange(function (event, session) {
      if (session && session.user) renderSignedIn(session.user);
      else renderSignedOut();
      // A reset link signs the reader in, but they came to choose a new
      // password - closing the dialog here would leave them signed in with
      // the old one forgotten and nowhere to type the new one.
      if (event === "PASSWORD_RECOVERY") { openRecovery(); return; }
      if (session && dlg.open && mode !== "recover") dlg.close();
    });
    window.auth = supabase;
    return supabase;
  }, function (err) {
    // Forget the failed attempt so the next click tries again, instead of
    // replaying the same rejection for the rest of the visit.
    loading = null;
    throw err;
  });
  return loading;
}

let mode = "signin";   // "signin" | "signup" | "recover"
let busy = false;

/* ----------------------------------------------------------------- helpers */

function say(text, kind) {
  msgEl.textContent = text || "";
  msgEl.dataset.kind = kind || "";
  msgEl.hidden = !text;
}

const SUBMIT_LABEL = { signin: "Sign in", signup: "Create account", recover: "Save new password" };

function setBusy(on) {
  busy = on;
  submitBtn.disabled = on;
  googleBtn.disabled = on;
  resetBtn.disabled = on;
  submitBtn.textContent = on ? "Working…" : SUBMIT_LABEL[mode];
}

function setMode(next) {
  mode = next;
  const signin = mode === "signin";
  const recover = mode === "recover";
  titleEl.textContent = recover ? "Choose a new password"
    : signin ? "Sign in" : "Create an account";
  submitBtn.textContent = SUBMIT_LABEL[mode];
  switchTxt.textContent = signin ? "New here?" : "Already have an account?";
  switchBtn.textContent = signin ? "Create an account" : "Sign in";
  passEl.autocomplete = signin ? "current-password" : "new-password";
  resetBtn.hidden = !signin;
  // Recovery is one field. Google, the email box and the sign-up switch
  // would all be ways to wander off from the one thing they came to do.
  googleBtn.hidden = orRow.hidden = switchRow.hidden = recover;
  emailEl.hidden = emailLabel.hidden = recover;
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
  if (/should be different from the old/i.test(m)) return "Pick a password you have not used here before.";
  if (/rate limit|too many/i.test(m)) return "Too many attempts. Wait a minute and try again.";
  // A failed dynamic import: most often a school or office network blocking
  // the CDN the sign-in code comes from. Checked before the generic network
  // case, because Firefox words both as a fetch failure.
  if (/dynamically imported module|importing a module script|module script/i.test(m)) {
    return "Sign-in could not load - your network may be blocking it. Every topic still works without an account.";
  }
  if (/failed to fetch|networkerror|load failed/i.test(m)) return "Could not reach the server. Check your connection.";
  return m;
}

// Every button here awaits the lazily loaded client, and that load can fail.
// Without this, a rejection skipped setBusy(false) and the dialog sat on
// "Working..." for good - so every action goes through the one wrapper.
async function run(action) {
  if (busy) return;
  setBusy(true);
  say("");
  try {
    await action(await client());
  } catch (err) {
    say(friendly(err), "err");
  } finally {
    setBusy(false);
  }
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
    try {
      const { error } = await (await client()).auth.signOut();
      if (error) throw error;
      // Success repaints the header through onAuthStateChange.
    } catch (err) {
      // Left disabled, the button would look as if it had worked.
      out.disabled = false;
      out.textContent = "Sign out failed - retry";
      out.title = friendly(err);
    }
  });

  slot.append(who, out);
}

/* ---------------------------------------------------------------- dialog */

// Supabase hands the session back in the URL fragment. A hash route sitting
// in front of it would read as a topic id, so the return URL carries no hash
// and the route rides along in sessionStorage instead.
const RETURN_KEY = "auth-return-hash";

function returnUrl() {
  try {
    if (location.hash) sessionStorage.setItem(RETURN_KEY, location.hash);
  } catch (e) { /* private mode: they land on the page, just not the topic */ }
  return location.origin + location.pathname + location.search;
}

function restoreRoute() {
  let hash = "";
  try {
    hash = sessionStorage.getItem(RETURN_KEY) || "";
    sessionStorage.removeItem(RETURN_KEY);
  } catch (e) { return; }
  // Only once supabase-js has cleared its tokens from the fragment.
  if (hash && !location.hash) location.hash = hash;
}

function open() {
  setMode("signin");
  // The real controls are always shown, so what the page will look like once
  // the keys are in is never a surprise - they are just inert until then.
  if (configured) client().catch(function () {});   // warm it; errors surface on use
  setupEl.hidden = configured;
  submitBtn.disabled = !configured;
  googleBtn.disabled = !configured;
  emailEl.disabled = passEl.disabled = resetBtn.disabled = !configured;
  emailEl.value = "";
  passEl.value = "";
  if (!dlg.open) dlg.showModal();
  if (configured) emailEl.focus();
}

function openRecovery() {
  open();
  setMode("recover");
  passEl.focus();
}

switchBtn.addEventListener("click", () => setMode(mode === "signin" ? "signup" : "signin"));

googleBtn.addEventListener("click", () => run(async (sb) => {
  const { error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: returnUrl() }
  });
  // On success the browser navigates away, so reaching here means it failed.
  if (error) throw error;
}));

form.addEventListener("submit", (e) => {
  e.preventDefault();

  const email = emailEl.value.trim();
  const password = passEl.value;

  if (mode === "recover") {
    if (password.length < 6) { say("Passwords need to be at least 6 characters.", "err"); return; }
    run(async (sb) => {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
      passEl.value = "";
      setMode("signin");
      dlg.close();
    });
    return;
  }

  if (!email || !password) { say("Enter an email and a password.", "err"); return; }

  run(async (sb) => {
    if (mode === "signin") {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      dlg.close();                     // onAuthStateChange repaints the header
      return;
    }
    const { data, error } = await sb.auth.signUp({
      email, password, options: { emailRedirectTo: returnUrl() }
    });
    if (error) throw error;
    // With email confirmation on, there is no session yet - saying "done"
    // here would be a lie, and the student would sit waiting on a blank page.
    if (data.session) dlg.close();
    else say("Account created. Check " + email + " for a confirmation link, then sign in.", "ok");
  });
});

resetBtn.addEventListener("click", () => {
  const email = emailEl.value.trim();
  if (!email) { say("Type your email above first, then press this.", "err"); emailEl.focus(); return; }
  run(async (sb) => {
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: returnUrl() });
    if (error) throw error;
    say("Password reset link sent to " + email + ".", "ok");
  });
});

/* ----------------------------------------------------------------- start */

renderSignedOut();

// Two reasons to load the client immediately: a session is already stored, or
// we have just come back from Supabase with a session or an error in the URL.
const returning = /[?&#](code|access_token|error)=/.test(location.search + location.hash);
// Read before supabase-js tidies the URL. An expired confirmation or reset
// link comes back as an error in the fragment, and saying nothing leaves
// the student wondering why the link "did nothing".
const linkError = (location.hash.match(/error_description=([^&]+)/) || [])[1];
if (configured && (hasStoredSession() || returning)) {
  client().then((sb) => sb.auth.getSession()).then(({ data }) => {
    if (data.session) renderSignedIn(data.session.user);
    if (returning) restoreRoute();
    if (linkError && !data.session) {
      const text = decodeURIComponent(linkError.replace(/\+/g, " "));
      open();
      say(/expired|invalid/i.test(text)
        ? "That link has expired or was already used. Ask for a new one below."
        : friendly({ message: text }), "err");
    }
  }, function (err) {
    // Only worth interrupting for if they were mid-way through signing in.
    if (returning) { open(); say(friendly(err), "err"); }
  });
}
