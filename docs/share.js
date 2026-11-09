/* Shareable demo setups: the slider positions live in the URL.
 *
 * "Try 70 m/s at 30 degrees" is something a student says to a friend, and a
 * link that opens the demo already set up is the useful way to say it. This
 * reads the controls generically - every range input, select and aria-pressed
 * toggle inside #demo-controls, keyed by its visible label - so a new demo
 * gets shareable links without writing any code for it.
 *
 * The setup rides in the query string, not the hash, because the hash is the
 * router's. `setup=<topic id>` scopes it, so a link made on one topic never
 * pushes values into the sliders of another.
 */
(function () {
  "use strict";

  var view = document.getElementById("view");
  if (!view) return;

  // Both URL shapes the router has used: #/<id> and /t/<id>/.
  function topicId() {
    var h = location.hash.match(/^#\/?([a-z0-9-]+)$/i);
    if (h) return h[1];
    var p = location.pathname.match(/\/t\/([a-z0-9-]+)\/?$/i);
    return p ? p[1] : "";
  }

  function slug(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  // Every control worth sharing, with a stable key. Range inputs and selects
  // are named by their <label>; toggles by their own text.
  function controls() {
    var host = document.getElementById("demo-controls");
    if (!host) return [];
    var out = [];
    host.querySelectorAll("label.ctl, label").forEach(function (lab) {
      var input = lab.querySelector("input[type=range], select");
      var name = lab.querySelector("span");
      if (input && name) out.push({ key: slug(name.textContent), el: input, kind: "value" });
    });
    host.querySelectorAll("button[aria-pressed]").forEach(function (b) {
      out.push({ key: slug(b.textContent), el: b, kind: "toggle" });
    });
    return out;
  }

  function read() {
    var params = {};
    controls().forEach(function (c) {
      params[c.key] = c.kind === "toggle"
        ? (c.el.getAttribute("aria-pressed") === "true" ? "on" : "off")
        : c.el.value;
    });
    return params;
  }

  // Set each control through the same event a person would fire, so the
  // demo's own onInput/onClick runs and nothing here knows any demo's maths.
  function apply(params) {
    // Toggles first: picking a function or an axis can reset the sliders
    // (a new function starting again from one term), so the slider values
    // only stick if they land after the choice they belong to.
    var all = controls();
    var ordered = all.filter(function (c) { return c.kind === "toggle"; })
      .concat(all.filter(function (c) { return c.kind !== "toggle"; }));
    ordered.forEach(function (c) {
      if (!(c.key in params)) return;
      var want = params[c.key];
      if (c.kind === "toggle") {
        var on = c.el.getAttribute("aria-pressed") === "true";
        if ((want === "on") !== on) c.el.click();
        return;
      }
      if (c.el.value === want) return;
      c.el.value = want;
      c.el.dispatchEvent(new Event(c.el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
    });
  }

  function linkFor(id, params) {
    var q = new URLSearchParams();
    q.set("setup", id);
    Object.keys(params).forEach(function (k) { q.set(k, params[k]); });
    return location.origin + location.pathname + "?" + q.toString() + location.hash;
  }

  function paramsFromUrl(id) {
    var q = new URLSearchParams(location.search);
    if (q.get("setup") !== id) return null;
    var p = {};
    q.forEach(function (v, k) { if (k !== "setup") p[k] = v; });
    return p;
  }

  // Drop a setup that no longer applies, leaving anything else in the query
  // alone - the home page keeps its search there (?q=...&subject=...).
  function clearUrl() {
    var q = new URLSearchParams(location.search);
    if (!q.has("setup")) return;
    var keep = new URLSearchParams();
    ["q", "subject"].forEach(function (k) { if (q.has(k)) keep.set(k, q.get(k)); });
    var qs = keep.toString();
    history.replaceState(history.state, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
  }

  // Keep the address bar in step with the sliders, so copying it from the
  // browser works as well as the button does. Debounced: dragging a slider
  // fires dozens of input events a second.
  var syncTimer = null;
  function scheduleSync(id) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () {
      if (topicId() !== id) return;
      var url = linkFor(id, read());
      history.replaceState(history.state, "", url.slice(location.origin.length));
    }, 250);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return Promise.reject(new Error("no clipboard"));
  }

  function mount() {
    var id = topicId();
    var panel = document.getElementById("demo-panel");
    if (!id || !panel) { clearUrl(); return; }
    if (!controls().length) return;          // e.g. the orbitals walkthrough

    var saved = paramsFromUrl(id);
    if (saved) apply(saved);
    else clearUrl();

    var host = document.getElementById("demo-controls");
    host.addEventListener("input", function () { scheduleSync(id); });
    host.addEventListener("change", function () { scheduleSync(id); });
    host.addEventListener("click", function (e) {
      if (e.target.closest("button[aria-pressed]")) scheduleSync(id);
    });

    var row = document.createElement("div");
    row.className = "ctl-row share-row";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn";
    btn.id = "share-setup";
    btn.textContent = "Copy link to this setup";
    var status = document.createElement("span");
    status.className = "share-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    btn.addEventListener("click", function () {
      var url = linkFor(id, read());
      copyText(url).then(function () {
        status.textContent = "Link copied - it opens with these exact settings.";
      }, function () {
        // No clipboard: put the link where it can be selected by hand.
        history.replaceState(history.state, "", url.slice(location.origin.length));
        status.textContent = "Copy the address bar - it now holds this setup.";
      });
      setTimeout(function () { status.textContent = ""; }, 3500);
    });
    row.append(btn, status);
    host.parentNode.insertBefore(row, host.nextSibling);

    window.dispatchEvent(new CustomEvent("share:ready", { detail: { id: id, row: row } }));
  }

  // The router swaps #view's children on every navigation; each swap is a
  // new page to wire up. Microtask-deferred so the demo has mounted first.
  new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      // Elements only, and never progress.js's strip (a direct child of
      // #view too): anything else here would be a feedback loop waiting.
      var added = [].filter.call(records[i].addedNodes, function (n) {
        return n.nodeType === 1 && n.id !== "progress-strip";
      });
      if (records[i].target === view && added.length) {
        Promise.resolve().then(mount);
        return;
      }
    }
  }).observe(view, { childList: true });
  mount();

  window.demoSetup = { read: read, apply: apply, linkFor: linkFor, topicId: topicId };
}());
