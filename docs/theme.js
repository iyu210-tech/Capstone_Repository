/* Light / dark / system theme.
 *
 * Loaded as a plain blocking <script> in <head>, before the stylesheet has
 * painted anything, so a reader who chose dark never sees a white flash on
 * every page load. It is a file rather than an inline script because the
 * Content-Security-Policy only lets inline scripts run by hash, and this one
 * would need re-hashing every time it changed.
 *
 * "system" is the default and is not stored: it means "follow the OS", which
 * the stylesheet already does through prefers-color-scheme. Only an explicit
 * choice sets data-theme on <html>. Storage can throw (private windows,
 * blocked site data), so every access is guarded and the page works without.
 */
(function () {
  "use strict";

  var KEY = "theme";
  var root = document.documentElement;

  function stored() {
    try {
      var v = localStorage.getItem(KEY);
      return v === "light" || v === "dark" ? v : "system";
    } catch (e) { return "system"; }
  }

  function apply(choice) {
    if (choice === "light" || choice === "dark") root.setAttribute("data-theme", choice);
    else root.removeAttribute("data-theme");
  }

  // Kept in memory too, so the toggle still tells the truth when storage
  // refused the write.
  var current = stored();
  apply(current);

  function sync() {
    var choice = current;
    document.querySelectorAll("[data-theme-choice]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-theme-choice") === choice));
    });
  }

  // Canvases bake colours in when they draw, so anything painted on one
  // listens for this and repaints (demos.js, and the cards in app.js).
  function announce() {
    window.dispatchEvent(new CustomEvent("themechange", { detail: { theme: current } }));
  }

  window.setTheme = function (choice) {
    try {
      if (choice === "light" || choice === "dark") localStorage.setItem(KEY, choice);
      else localStorage.removeItem(KEY);
    } catch (e) { /* the choice still applies for this page view */ }
    current = choice === "light" || choice === "dark" ? choice : "system";
    apply(current);
    sync();
    announce();
  };

  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-theme-choice]");
    if (b) window.setTheme(b.getAttribute("data-theme-choice"));
  });

  // Another tab changed it: follow along rather than disagreeing.
  window.addEventListener("storage", function (e) {
    if (e.key !== KEY) return;
    current = stored();
    apply(current);
    sync();
    announce();
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sync);
  else sync();
}());
