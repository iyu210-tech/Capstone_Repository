/* Hash router. Every view is a function that fills #view and may return
   { destroy } so demos and observers are stopped when the route changes. */
(function () {
  "use strict";

  var Slime = window.Slime;
  var V = Slime.views;
  var view = document.getElementById("view");
  var current = null, booted = false;

  // Links shared before the lessons existed went to #/<topic-id>.
  var LEGACY = {};
  Slime.data.lessonIds.forEach(function (id) {
    var t = Slime.data.lesson(id).topic;
    if (t) LEGACY[t] = id;
  });

  function parse() {
    var raw = location.hash.replace(/^#\/?/, "");
    var q = raw.indexOf("?"), path = q === -1 ? raw : raw.slice(0, q);
    var params = {};
    if (q !== -1) {
      raw.slice(q + 1).split("&").forEach(function (kv) {
        var p = kv.split("=");
        if (p[0]) params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || "");
      });
    }
    return { parts: path.split("/").filter(Boolean), params: params };
  }

  function route() {
    if (current && current.destroy) current.destroy();
    current = null;
    var r = parse(), p = r.parts;

    if (p.length === 1 && LEGACY[p[0]]) { location.replace("#/topic/" + LEGACY[p[0]]); return; }
    if (p[0] === "map" && !p[1]) { location.replace("#/map/" + (Slime.store.setting("lastMap") || "all")); return; }

    view.innerHTML = "";
    window.scrollTo(0, 0);
    var name = p[0] || "home";
    if (!p[0] || name === "home") current = V.home(view);
    else if (name === "map") current = V.map(view, p[1], r.params);
    else if (name === "topic" && p[1]) current = V.topic(view, p[1]);
    else if (name === "practice") current = V.practice(view);
    else if (name === "questions") current = V.questions(view, r.params);
    else if (name === "mistakes") current = V.mistakes(view);
    else if (name === "search") current = V.search(view, r.params);
    else if (name === "progress") current = V.progress(view);
    else current = V.missing(view, location.hash);

    document.querySelectorAll("[data-nav]").forEach(function (a) {
      var on = a.dataset.nav === name || (a.dataset.nav === "home" && (!p[0] || name === "home"));
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    var brand = document.querySelector(".brand");
    if (brand) {
      if (!p[0] || name === "home") brand.setAttribute("aria-current", "page");
      else brand.removeAttribute("aria-current");
    }

    // Move focus to the new heading so the change of view is announced,
    // rather than leaving a keyboard user at the top of the document.
    if (booted) {
      var h1 = view.querySelector("h1[tabindex]");
      if (h1) h1.focus({ preventScroll: true });
    }
    booted = true;
  }
  Slime.route = route;

  /* header search */
  var form = document.getElementById("head-search");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var q = form.querySelector("input").value.trim();
      location.hash = "#/search" + (q ? "?q=" + encodeURIComponent(q) : "");
    });
  }

  // "/" jumps to search, the way most documentation sites behave.
  document.addEventListener("keydown", function (e) {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
    var el = document.activeElement, tag = el && el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el && el.isContentEditable)) return;
    e.preventDefault();
    var box = document.querySelector(".big-search") || document.querySelector("#head-search input");
    if (box && box.offsetParent !== null) { box.focus(); box.select(); }
    else location.hash = "#/search";
  });

  var themeBtn = document.getElementById("theme-btn");
  if (themeBtn) themeBtn.addEventListener("click", Slime.ui.cycleTheme);
  Slime.ui.applyTheme();

  window.addEventListener("hashchange", route);
  route();
})();
