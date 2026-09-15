# Parked: Supabase sign-in

> **Already restored - this folder is a historical copy, not the live code.**
> The sign-in now lives in `docs/auth.js`, `docs/auth-config.js`, `docs/index.html`
> and `docs/style.css`, and `docs/auth.js` has since diverged from the copy here:
> supabase-js is loaded on demand rather than imported at the top of the module,
> which is the fix the "Why it was parked" note below asks for. Read `docs/` for
> the current behaviour; nothing in this folder is served or executed.

This is the Supabase auth work that was added to `docs/` on 2026-09-15, moved
out of the way so the design/UX pass could land on its own. Nothing here was
changed - the two .js files are byte-for-byte as they were, and the markup and
CSS below are the exact text removed from `docs/index.html` and
`docs/style.css`.

## Why it was parked

As wired, `auth.js` imported the Supabase client at module top level, so every
page load fetched 17 modules from `esm.sh` even with empty credentials - on a
site that otherwise makes zero third-party requests. The header also rendered a
`Sign in` button that could not work until `url` and `anonKey` were filled in.
Both are worth fixing before this goes back in: load the client lazily inside
the dialog's open handler, and hide the button while the config is empty.

## To restore

1. Move `auth.js` and `auth-config.js` back into `docs/`.
2. Put the three snippets below back into `docs/index.html`.
3. Append the CSS block below to `docs/style.css`.

### docs/index.html - header (replaces the plain GitHub link)

```html
  <nav class="head-actions">
    <a class="ghost-btn" href="https://github.com/iyu210-tech/Capstone_Repository" target="_blank" rel="noopener">GitHub &#8599;</a>
    <!-- Filled by auth.js: a "Sign in" button, or the account name plus "Sign out". -->
    <div id="account" class="account"></div>
  </nav>
```

### docs/index.html - dialog (before the script tags)

```html
<!-- sign in ---------------------------------------------------------------
     One dialog for both routes. Google is offered first because it is one
     click and needs no new password; email and password is there for anyone
     who would rather not link a Google account. -->
<dialog id="auth-dialog" class="auth-dialog" aria-labelledby="auth-title">
  <form method="dialog" class="auth-close-form">
    <button class="auth-close" aria-label="Close">&#10005;</button>
  </form>

  <h2 id="auth-title">Sign in</h2>
  <p class="auth-lede">Every topic stays free to read and run either way &mdash;
     an account just remembers you between visits.</p>

  <p id="auth-setup" class="auth-setup" hidden>
    Sign-in is not switched on yet: add the project URL and anon key to
    <code>auth-config.js</code>, from Supabase &rarr; Project Settings &rarr; API.
  </p>

  <button type="button" id="auth-google" class="google-btn">
    <svg class="google-mark" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
    </svg>
    Continue with Google
  </button>

  <div class="auth-or" id="auth-or"><span>or</span></div>

  <form id="auth-form" class="auth-form" novalidate>
    <label for="auth-email">Email</label>
    <input id="auth-email" type="email" autocomplete="email" required>

    <label for="auth-password">Password</label>
    <input id="auth-password" type="password" autocomplete="current-password" required minlength="6">

    <button type="submit" id="auth-submit" class="btn primary auth-submit">Sign in</button>
    <button type="button" id="auth-reset" class="linkish">Forgot your password?</button>
  </form>

  <p id="auth-msg" class="auth-msg" role="status" aria-live="polite" hidden></p>

  <p class="auth-switch" id="auth-switch-row">
    <span id="auth-switch-text">New here?</span>
    <button type="button" id="auth-switch" class="linkish">Create an account</button>
  </p>
</dialog>
```

### docs/index.html - scripts (after app.js)

```html
<script src="auth-config.js"></script>
<script type="module" src="auth.js"></script>
```

### docs/style.css - append

```css
/* sign in --------------------------------------------------------------- */
.head-actions { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; }
.account { display: flex; align-items: center; gap: .6rem; }
.account-who {
  font-size: .85rem; color: var(--ink-soft);
  max-width: 11rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.auth-dialog {
  width: min(24rem, calc(100vw - 2rem));
  border: 1px solid var(--border); border-radius: var(--radius);
  background: var(--surface); color: var(--ink);
  padding: 1.5rem; position: relative;
}
.auth-dialog::backdrop { background: rgba(0, 0, 0, .45); }
.auth-dialog h2 { margin: 0 0 .35rem; font-size: 1.25rem; }
.auth-lede { margin: 0 0 1.1rem; color: var(--ink-soft); font-size: .85rem; }

.auth-close-form { margin: 0; }
.auth-close {
  position: absolute; top: .6rem; right: .6rem;
  border: 0; background: none; color: var(--ink-soft);
  font-size: 1rem; line-height: 1; padding: .4rem; cursor: pointer;
}
.auth-close:hover { color: var(--accent); }

.auth-setup {
  margin: 0 0 1rem; padding: .75rem .9rem;
  border: 1px solid var(--border); border-radius: 8px;
  background: var(--accent-soft); color: var(--ink-soft); font-size: .8rem;
}
.auth-setup code { font-size: .78rem; }

.google-btn {
  display: flex; align-items: center; justify-content: center; gap: .6rem;
  width: 100%; padding: .7rem 1rem;
  border: 1px solid var(--border); border-radius: 8px;
  background: var(--surface); color: var(--ink);
  font: inherit; font-size: .9rem; font-weight: 500; cursor: pointer;
}
.google-btn:hover:not(:disabled) { border-color: var(--accent); }
.google-btn:disabled { opacity: .55; cursor: default; }
.google-mark { flex: none; }

.auth-or {
  display: flex; align-items: center; gap: .75rem;
  margin: 1rem 0; color: var(--ink-soft); font-size: .78rem;
}
.auth-or::before, .auth-or::after {
  content: ""; flex: 1; height: 1px; background: var(--border);
}

.auth-form { display: flex; flex-direction: column; }
.auth-form label { font-size: .8rem; color: var(--ink-soft); margin-bottom: .3rem; }
.auth-form input {
  padding: .6rem .75rem; margin-bottom: .9rem;
  border: 1px solid var(--border); border-radius: 8px;
  background: var(--bg); color: var(--ink); font: inherit; font-size: .9rem;
}
.auth-submit { width: 100%; padding: .7rem 1rem; font-size: .9rem; }
.auth-submit:disabled { opacity: .55; cursor: default; }

.linkish {
  border: 0; background: none; padding: 0; cursor: pointer;
  color: var(--accent); font: inherit; font-size: .8rem; text-decoration: underline;
}
#auth-reset { align-self: flex-start; margin-top: .7rem; }

.auth-msg {
  margin: 1rem 0 0; padding: .6rem .75rem;
  border-radius: 8px; font-size: .82rem;
  border: 1px solid var(--border); background: var(--bg); color: var(--ink);
}
.auth-msg[data-kind="err"] { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }

.auth-switch {
  margin: 1.1rem 0 0; color: var(--ink-soft); font-size: .8rem;
  display: flex; gap: .4rem; flex-wrap: wrap;
}
```
