/* Bottom navigation for phones.
 *
 * On a phone the header was the worst-value part of the page: the brand wrapped
 * onto three lines and the two buttons stacked beside it, so roughly a fifth of
 * the first screen was chrome before any topic appeared. The bar below moves
 * those actions to the bottom - within thumb reach, fixed, so they are reachable
 * from halfway down a long topic page instead of only after scrolling back up.
 *
 * It is display:none above 720px, where the header has room to do its job.
 */
(function () {
  "use strict";

  var nav = document.querySelector(".mobile-nav");
  if (!nav) return;

  var links = nav.querySelectorAll("[data-route]");

  // A tab is current when the route it points at is the route being shown.
  function sync() {
    var home = !location.hash.replace(/^#\/?/, "");
    links.forEach(function (el) {
      var on = (el.dataset.route === "home") === home;
      el.classList.toggle("is-on", on);
      if (on) el.setAttribute("aria-current", "page");
      else el.removeAttribute("aria-current");
    });
  }

  // Search lives on the home view, so from a topic page this has to go home
  // first and wait for the router to rebuild before the box exists to focus.
  document.getElementById("mnav-search").addEventListener("click", function () {
    var box = document.getElementById("search");
    if (box) {
      box.scrollIntoView({ block: "center" });
      box.focus();
      return;
    }
    location.hash = "#/";
    setTimeout(function () {
      var el = document.getElementById("search");
      if (el) { el.scrollIntoView({ block: "center" }); el.focus(); }
    }, 60);
  });

  // The header button is the one auth.js owns; clicking it here keeps a single
  // implementation rather than a second copy of the sign-in logic.
  document.getElementById("mnav-account").addEventListener("click", function () {
    var btn = document.querySelector("#account button");
    if (btn) btn.click();
  });

  window.addEventListener("hashchange", sync);
  sync();
}());
