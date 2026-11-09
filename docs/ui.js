/* Small DOM helpers and the components every view shares. */
(function () {
  "use strict";

  var Slime = window.Slime = window.Slime || {};
  var SVGNS = "http://www.w3.org/2000/svg";

  // h("div.card", { onclick: fn, "aria-label": "x" }, child, "text", [more])
  function h(sel, props) {
    var m = sel.split(/(?=[.#])/);
    var el = document.createElement(m[0] || "div");
    for (var i = 1; i < m.length; i++) {
      if (m[i][0] === ".") el.classList.add(m[i].slice(1));
      else el.id = m[i].slice(1);
    }
    var start = 1;
    if (props && typeof props === "object" && !(props instanceof Node) && !Array.isArray(props)) {
      start = 2;
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v === undefined || v === null || v === false) return;
        if (k === "html") el.innerHTML = v;
        else if (k === "text") el.textContent = v;
        else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
        else if (k === "class") el.className += " " + v;
        else el.setAttribute(k, v === true ? "" : v);
      });
    }
    append(el, Array.prototype.slice.call(arguments, start));
    return el;
  }

  function append(el, kids) {
    kids.forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) append(el, c);
      else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    });
    return el;
  }

  function svg(tag, attrs) {
    var el = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }

  /* ----------------------------------------------------------- shapes */
  // Subjects are colored circles. On the map, sides encode difficulty:
  // circle → triangle → square → pentagon → …
  function shapePath(sides, r) {
    if (!sides || sides < 3) {
      return "M" + (-r) + ",0A" + r + "," + r + " 0 1,0 " + r + ",0A" + r + "," + r + " 0 1,0 " + (-r) + ",0Z";
    }
    // Squares start rotated so the sides stay axis-aligned (not diamond).
    var p = [], i, a0 = sides === 4 ? -Math.PI / 4 : -Math.PI / 2;
    for (i = 0; i < sides; i++) {
      var a = a0 + i * 2 * Math.PI / sides;
      p.push((i ? "L" : "M") + (r * Math.cos(a)).toFixed(2) + "," + (r * Math.sin(a)).toFixed(2));
    }
    return p.join("") + "Z";
  }

  function difficultySides(d) {
    // 1 → circle, 2 → triangle, 3 → square, 4 → pentagon, …
    return d <= 1 ? 0 : d + 1;
  }

  function glyph(subject, size) {
    var s = size || 12;
    var el = svg("svg", { viewBox: "-10 -10 20 20", width: s, height: s, "aria-hidden": "true", class: "glyph" });
    el.appendChild(svg("path", { d: shapePath(0, 8), fill: "currentColor" }));
    return el;
  }

  function subjectPill(subjectId, text) {
    var s = Slime.data.subject(subjectId);
    return h("span.pill.subj-" + subjectId, glyph(subjectId, 10), " " + (text || s.short));
  }

  /* ----------------------------------------------------- stage meter */
  // Four segments, filled left to right: the count carries the meaning, the
  // color only reinforces it.
  function stageMeter(st, opts) {
    opts = opts || {};
    var wrap = h("span.stage.stage-" + st.key, { title: st.blurb });
    var bar = h("span.stage-bar", { "aria-hidden": "true" });
    for (var i = 1; i <= 4; i++) bar.appendChild(h("i" + (i <= st.index ? ".on" : "")));
    wrap.appendChild(bar);
    if (!opts.compact) wrap.appendChild(h("span.stage-label", st.label));
    else wrap.appendChild(h("span.sr-only", st.label));
    return wrap;
  }

  function diffDots(d) {
    var label = Slime.data.DIFFICULTY[d] || ("Level " + d);
    var dots = "";
    for (var i = 1; i <= 4; i++) dots += i <= d ? "●" : "○";
    return h("span.diff.diff-" + d, h("span", { "aria-hidden": "true" }, dots), " " + label);
  }

  function specBadge(spec) {
    if (!spec || spec === "current") return null;
    var text = spec === "extension" ? "Extension: beyond the syllabus" : "Older specification";
    return h("span.badge.badge-" + spec, text);
  }

  function levelBadge(level) {
    return h("span.badge.badge-level", level === "AHL" ? "HL only" : "SL & HL");
  }

  /* ------------------------------------------------------------ misc */
  function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }

  function relTime(t) {
    var d = Math.round((Slime.store.DAY && (t - Date.now()) / Slime.store.DAY) || 0);
    if (d <= 0) return "today";
    if (d === 1) return "tomorrow";
    return "in " + d + " days";
  }

  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 3200);
  }

  /* ------------------------------------------------------------ theme */
  var media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function themePref() { return (Slime.store && Slime.store.setting("theme")) || "system"; }

  function applyTheme() {
    var p = themePref();
    var dark = p === "dark" || (p === "system" && media && media.matches);
    var next = dark ? "dark" : "light";
    if (document.documentElement.dataset.theme !== next) {
      document.documentElement.dataset.theme = next;
      window.dispatchEvent(new CustomEvent("slime:theme"));
    }
    var btn = document.getElementById("theme-btn");
    if (btn) {
      var label = { system: "Theme: match system", light: "Theme: light", dark: "Theme: dark" }[p];
      btn.setAttribute("aria-label", label);
      btn.title = label;
      btn.dataset.pref = p;
    }
  }

  function cycleTheme() {
    var order = ["system", "light", "dark"];
    var next = order[(order.indexOf(themePref()) + 1) % order.length];
    Slime.store.setting("theme", next);
    applyTheme();
    toast({ system: "Theme follows your system setting", light: "Light theme", dark: "Dark theme" }[next]);
  }

  if (media) {
    var onChange = function () { if (themePref() === "system") applyTheme(); };
    if (media.addEventListener) media.addEventListener("change", onChange);
    else if (media.addListener) media.addListener(onChange);
  }

  function reportLink(what) {
    var title = "Content issue: " + what;
    var body = "Page: " + location.href + "\n\nWhat is wrong or unclear?\n\n";
    return "https://github.com/iyu210-tech/Capstone_Repository/issues/new?title=" +
      encodeURIComponent(title) + "&body=" + encodeURIComponent(body);
  }

  Slime.ui = {
    h: h, svg: svg, append: append, shapePath: shapePath, difficultySides: difficultySides, glyph: glyph,
    subjectPill: subjectPill, stageMeter: stageMeter, diffDots: diffDots,
    specBadge: specBadge, levelBadge: levelBadge, plural: plural, relTime: relTime,
    toast: toast, applyTheme: applyTheme, cycleTheme: cycleTheme, reportLink: reportLink
  };
})();
