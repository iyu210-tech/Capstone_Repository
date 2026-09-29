/* Routing, search and the code viewer. */
(function () {
  "use strict";

  var view = document.getElementById("view");
  var TOPICS = window.TOPICS || [];
  var active = null;          // currently mounted demo, so we can stop its loop
  var state = { q: "", subject: "All" };
  var booted = false;         // first paint should not steal focus

  function tpl(id) {
    return document.getElementById(id).content.cloneNode(true);
  }

  /* ------------------------------------------------------------- search */
  // Words that carry no signal in a question like
  // "why does heating speed up a reaction".
  var STOP = ('a an the is are do does did why how what when which of for to in on '
    + 'and or my i it its this that with without you your be can could would should '
    + 'about at as by from if not so up down more less than then there here'
  ).split(' ');

  // A stuck student types their own word for the idea, not ours. Each entry
  // lets a query word also match the phrases listed, so "drag" finds the
  // topic that says "air resistance" and "hot" finds "temperature". Keys are
  // stems, so they are checked after the -ing/-ed/-s strip below too.
  var SYNONYMS = {
    drag: ["air resistance"], air: ["drag"], friction: ["drag", "air resistance"],
    heat: ["temperature"], hot: ["temperature"], warm: ["temperature"], cold: ["temperature"],
    fast: ["speed", "rate"], quick: ["rate"], speed: ["rate", "velocity"],
    velocity: ["speed"], throw: ["projectile", "launch"], thrown: ["projectile"],
    angle: ["launch angle"], polynomial: ["series"], approximat: ["approximation", "series"],
    energy: ["activation energy", "kinetic"], electron: ["orbital", "configuration"],
    shell: ["orbital", "subshell"], configuration: ["aufbau", "orbital"],
    transition: ["d-block", "metal"], exception: ["chromium", "copper"]
  };

  function hit(hay, w) {
    if (hay.indexOf(w) !== -1) return true;
    // match the stem too, so 'heating' finds 'heat' and 'reactions' finds 'reaction'
    var stem = w.replace(/(ing|ed|es|s)$/, "");
    if (stem.length > 3 && hay.indexOf(stem) !== -1) return true;
    var alts = SYNONYMS[w] || SYNONYMS[stem] || [];
    for (var i = 0; i < alts.length; i++) if (hay.indexOf(alts[i]) !== -1) return true;
    return false;
  }

  function score(topic, q) {
    if (!q) return 1;
    var hay = [
      topic.title, topic.subject, topic.syllabus,
      topic.hard_bit, topic.shows, topic.tags.join(" ")
    ].join(" ").toLowerCase();

    // Rank by how many meaningful words hit, rather than demanding all of
    // them - a typed-out question should still find the right topic.
    var words = q.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
      .filter(function (w) { return w && STOP.indexOf(w) === -1; });
    if (!words.length) return 1;

    var hits = 0;
    for (var i = 0; i < words.length; i++) if (hit(hay, words[i])) hits++;
    return hits;
  }

  function matches() {
    return TOPICS.filter(function (t) {
      if (state.subject !== "All" && t.subject !== state.subject) return false;
      return score(t, state.q) > 0;
    }).sort(function (a, b) {
      return score(b, state.q) - score(a, state.q);
    });
  }

  /* ------------------------------------------------------------ subject */
  // Subjects are free text in topics.json; the colour system has three
  // accents (see --maths / --physics / --chem in style.css). Anything else
  // gets the neutral ink rather than borrowing another subject's colour.
  function subjectKey(s) {
    s = String(s || "");
    if (/math/i.test(s)) return "maths";
    if (/phys/i.test(s)) return "physics";
    if (/chem/i.test(s)) return "chem";
    return "other";
  }

  // "No. 03": the collection is a notebook, and topics.json is in the order
  // the entries were written.
  function entryNo(t) {
    var n = TOPICS.indexOf(t) + 1;
    return "No. " + (n < 10 ? "0" : "") + n;
  }

  // Demos that are a walkthrough rather than one plot, so the card can say so.
  var LONG_FORM = { orbitals: "Walkthrough · 4 parts" };

  function kindOf(t) {
    if (!window.hasDemo || !window.hasDemo(t.demo)) return "Code and notes";
    return LONG_FORM[t.demo] || "Interactive";
  }

  // progress.js owns the marks; the cards only read them, to show a badge.
  function readMarks() {
    try { return JSON.parse(localStorage.getItem("progress-marks") || "{}") || {}; }
    catch (e) { return {}; }
  }

  /* -------------------------------------------------------------- thumb */
  // Every card preview comes from one renderer in one frame - same grid,
  // same margins, same stroke weights, the subject's colour - drawing a
  // small sketch per demo in unit coordinates. A new demo only needs a
  // sketch here to get a matching preview; a topic without one gets a
  // neutral card (grid, subject glyph, syllabus code) instead of wearing
  // another topic's picture.
  //
  // Cards are rebuilt on every keystroke and the collection is meant to reach
  // dozens of topics, so previews are drawn once and reused, and redrawn
  // only when the theme flips (canvas bakes its colours in).
  var thumbCache = {};
  var TW = 560, TH = 280, TP = 22;

  function css(name, fallback) {
    var v = getComputedStyle(document.body).getPropertyValue(name).trim();
    return v || fallback;
  }

  function mbSketch(u) {
    var x = u * 3.1;
    return 0.06 + x * x * Math.exp(-x * x / 1.05) * 1.02;
  }

  // Each layer: fn(u) -> v, both 0..1. ref = grey reference curve, dash =
  // dashed, to = stop early (a trajectory that lands short), fillFrom =
  // shade under the curve from u onwards.
  var SKETCHES = {
    taylor: [
      { ref: true, fn: function (u) { return 0.5 + 0.3 * Math.sin(u * 12 - 6); } },
      { fn: function (u) {
        var x = u * 12 - 6, y = x - Math.pow(x, 3) / 6 + Math.pow(x, 5) / 120;
        return 0.5 + 0.3 * Math.max(-1.75, Math.min(1.75, y));
      } }
    ],
    projectile: [
      { ref: true, dash: true, fn: function (u) { return 0.06 + 3.3 * u * (1 - u); } },
      { to: 0.78, fn: function (u) {
        var s = u / 0.78;
        return 0.06 + 1.66 * s * (1 - Math.pow(s, 1.6));
      } }
    ],
    boltzmann: [{ fillFrom: 0.56, fn: mbSketch }, { fn: mbSketch }],
    orbitals: "orbitals"
  };

  var GLYPHS = { maths: "∫", physics: "λ", chem: "⇌", other: "?" };

  function buildThumb(t) {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var c = document.createElement("canvas");
    c.className = "thumb";
    c.width = Math.round(TW * dpr); c.height = Math.round(TH * dpr);
    c.setAttribute("aria-hidden", "true");
    var g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    var key = subjectKey(t.subject);
    var acc = key === "other" ? css("--ink-soft", "#555") : css("--" + key, "#555");
    var fill = key === "other" ? css("--plot-grid-strong", "#ccc") : css("--" + key + "-fill", "rgba(0,0,0,.2)");
    var ref = css("--plot-ref", "#999");
    var W = TW - 2 * TP, H = TH - 2 * TP, i;
    function X(u) { return TP + u * W; }
    function Y(v) { return TP + H - Math.max(-0.02, Math.min(1.02, v)) * H; }

    g.fillStyle = css("--plot-bg", "#fff");
    g.fillRect(0, 0, TW, TH);
    g.lineWidth = 1;
    g.strokeStyle = css("--plot-grid", "#eee");
    g.beginPath();
    for (i = 0; i <= 8; i++) { g.moveTo(X(i / 8), TP); g.lineTo(X(i / 8), TP + H); }
    for (i = 0; i <= 4; i++) { g.moveTo(TP, Y(i / 4)); g.lineTo(TP + W, Y(i / 4)); }
    g.stroke();
    g.strokeStyle = css("--plot-grid-strong", "#ccc");
    g.beginPath(); g.moveTo(TP, TP); g.lineTo(TP, TP + H); g.lineTo(TP + W, TP + H); g.stroke();

    var sketch = t.demo && SKETCHES[t.demo];
    g.lineJoin = "round"; g.lineCap = "round";

    if (sketch === "orbitals") {
      var cy = TP + H / 2, r = H * 0.34;
      g.fillStyle = fill; g.strokeStyle = acc; g.lineWidth = 3;
      g.beginPath(); g.arc(X(0.27), cy, r, 0, Math.PI * 2); g.fill(); g.stroke();
      [1, -1].forEach(function (side) {
        g.beginPath();
        for (var a = -1.3; a <= 1.3001; a += 0.05) {
          var rr = r * 1.3 * Math.pow(Math.cos(a), 2);
          var px = X(0.68) + side * rr * Math.cos(a), py = cy + rr * Math.sin(a) * 0.8;
          if (a === -1.3) g.moveTo(X(0.68), cy); else g.lineTo(px, py);
        }
        g.closePath(); g.fill(); g.stroke();
      });
    } else if (sketch) {
      sketch.forEach(function (L) {
        var n = 120, to = L.to || 1, j, u;
        if (L.fillFrom !== undefined) {
          g.beginPath(); g.moveTo(X(L.fillFrom), Y(0));
          for (j = 0; j <= n; j++) { u = L.fillFrom + (1 - L.fillFrom) * j / n; g.lineTo(X(u), Y(L.fn(u))); }
          g.lineTo(X(1), Y(0)); g.closePath();
          g.fillStyle = fill; g.fill();
          return;
        }
        g.save();
        g.beginPath(); g.rect(TP, TP - 4, W, H + 8); g.clip();
        g.beginPath();
        for (j = 0; j <= n; j++) {
          u = to * j / n;
          if (j === 0) g.moveTo(X(u), Y(L.fn(u))); else g.lineTo(X(u), Y(L.fn(u)));
        }
        g.strokeStyle = L.ref ? ref : acc;
        g.lineWidth = L.ref ? 2 : 3.5;
        g.setLineDash(L.dash ? [8, 7] : []);
        g.stroke();
        g.restore();
      });
    } else {
      // Neutral: no picture to promise, so say what it is instead.
      g.fillStyle = acc;
      g.globalAlpha = 0.55;
      g.font = "italic 600 112px " + css("--font-prose", "Georgia, serif");
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(GLYPHS[key], TW / 2, TH / 2 + 4);
      g.globalAlpha = 1;
      g.fillStyle = css("--plot-label", "#666");
      g.font = "600 17px " + css("--font-ui", "sans-serif");
      g.textAlign = "left"; g.textBaseline = "alphabetic";
      g.fillText(t.syllabus || t.subject || "", TP + 10, TP + H - 12);
    }
    return c;
  }

  function thumb(topic) {
    if (!thumbCache[topic.id]) thumbCache[topic.id] = buildThumb(topic);
    return thumbCache[topic.id];
  }

  // Previews bake in the theme colours, so redraw them when the theme flips -
  // from the OS, or from the toggle (theme.js fires "themechange").
  function onScheme() {
    thumbCache = {};
    if (document.getElementById("cards")) renderCards();
  }
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", onScheme);
    else if (mq.addListener) mq.addListener(onScheme);
  }
  window.addEventListener("themechange", onScheme);
  // The previews name the font in their fallback card; redraw once it lands.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(onScheme);

  /* --------------------------------------------------------------- home */
  // The search lives in the query string (?q=...&subject=...) as well as in
  // memory, so a reload, a shared link or Back from a topic all come back to
  // the same filtered list rather than to an empty box.
  function readSearchFromUrl() {
    var params = new URLSearchParams(location.search);
    if (params.has("q")) state.q = params.get("q");
    if (params.has("subject")) state.subject = params.get("subject");
  }

  var urlTimer = null;
  function writeSearchToUrl() {
    clearTimeout(urlTimer);
    urlTimer = setTimeout(function () {
      if (!document.getElementById("cards")) return;   // left home meanwhile
      var params = new URLSearchParams(location.search);
      if (state.q) params.set("q", state.q); else params.delete("q");
      if (state.subject !== "All") params.set("subject", state.subject);
      else params.delete("subject");
      var qs = params.toString();
      history.replaceState(history.state, "",
        location.pathname + (qs ? "?" + qs : "") + location.hash);
    }, 300);
  }

  function subjectsInOrder() {
    return TOPICS.map(function (t) { return t.subject; })
      .filter(function (s, i, a) { return a.indexOf(s) === i; });
  }

  function syncChips() {
    var filters = document.getElementById("filters");
    if (!filters) return;
    filters.querySelectorAll(".chip").forEach(function (c) {
      c.setAttribute("aria-pressed", String(c.dataset.value === state.subject));
    });
  }

  // Tags are written as the questions a stuck student types, so the ones
  // phrased as a question make honest examples for the empty search box.
  function suggestions() {
    var out = [];
    TOPICS.forEach(function (t) {
      var q = t.tags.filter(function (g) { return /^(why|how|what|when|is|does)\b/i.test(g); })[0];
      if (q && out.indexOf(q) === -1) out.push(q);
    });
    return out.slice(0, 3);
  }

  function renderHome() {
    view.innerHTML = "";
    view.appendChild(tpl("tpl-home"));
    readSearchFromUrl();

    var search = document.getElementById("search");
    var filters = document.getElementById("filters");

    ["All"].concat(subjectsInOrder()).forEach(function (s) {
      var b = document.createElement("button");
      b.className = "chip";
      b.type = "button";
      b.dataset.value = s;
      if (s !== "All") {
        b.dataset.key = subjectKey(s);
        var dot = document.createElement("span");
        dot.className = "dot";
        dot.setAttribute("aria-hidden", "true");
        b.appendChild(dot);
      }
      b.appendChild(document.createTextNode(s === "All" ? "All topics" : s));
      var n = document.createElement("span");
      n.className = "n";
      n.textContent = s === "All" ? TOPICS.length
        : TOPICS.filter(function (t) { return t.subject === s; }).length;
      b.appendChild(n);
      b.setAttribute("aria-pressed", String(s === state.subject));
      b.addEventListener("click", function () {
        state.subject = s;
        syncChips();
        renderCards();
      });
      filters.appendChild(b);
    });

    var suggest = view.querySelector("[data-suggest]");
    var qs = suggestions();
    if (suggest && qs.length) {
      qs.forEach(function (q) {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = q;
        b.addEventListener("click", function () {
          search.value = q;
          state.q = q;
          renderCards();
          search.focus();
        });
        suggest.appendChild(b);
      });
      suggest.hidden = false;
    }

    // The whole box is the target, not just the text field inside it.
    var box = view.querySelector(".search-box");
    if (box) box.addEventListener("click", function (e) { if (e.target !== search) search.focus(); });

    search.value = state.q;
    search.addEventListener("input", function () {
      state.q = search.value.trim();
      renderCards();
    });

    renderCards();
  }

  function clearAll() {
    state.q = ""; state.subject = "All";
    var search = document.getElementById("search");
    if (search) search.value = "";
    syncChips();
    renderCards();
  }

  function card(t, marks) {
    var key = subjectKey(t.subject);
    var a = document.createElement("a");
    a.className = "card";
    a.href = "#/" + t.id;
    a.dataset.key = key;
    a.appendChild(thumb(t));

    var no = document.createElement("span");
    no.className = "card-no";
    no.setAttribute("aria-hidden", "true");
    no.textContent = entryNo(t);
    a.appendChild(no);

    var m = marks[t.id];
    if (m && (m.status === "understood" || m.status === "stuck")) {
      var badge = document.createElement("span");
      badge.className = "card-badge " + (m.status === "understood" ? "got" : "stuck");
      badge.textContent = m.status === "understood" ? "✓ Got it" : "Still stuck";
      a.appendChild(badge);
    }

    var body = document.createElement("div");
    body.className = "card-body";
    var meta = document.createElement("span");
    meta.className = "card-meta";
    var code = document.createElement("span");
    code.className = "syl";
    code.textContent = t.syllabus;
    var kind = document.createElement("span");
    kind.className = "kind";
    kind.textContent = kindOf(t);
    meta.append(code, kind);
    var h = document.createElement("h3");
    h.textContent = t.title;
    var p = document.createElement("p");
    p.textContent = t.hard_bit;
    body.append(meta, h, p);
    a.appendChild(body);
    return a;
  }

  function renderCards() {
    var host = document.getElementById("cards");
    var empty = document.getElementById("empty");
    var count = document.getElementById("count");
    if (!host) return;
    host.innerHTML = "";

    var found = matches();
    var filtered = state.q || state.subject !== "All";
    var marks = readMarks();
    writeSearchToUrl();

    // Say how many matched. Without this the grid just silently changes
    // length and there is nothing for a screen reader to announce.
    if (count) {
      count.textContent = !filtered
        ? TOPICS.length + (TOPICS.length === 1 ? " topic" : " topics")
        : found.length + " of " + TOPICS.length + " topics";
    }

    empty.hidden = found.length > 0;
    if (!found.length) {
      empty.textContent = "No topic matches that yet — the collection grows each week. ";
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Clear search and filters";
      btn.addEventListener("click", clearAll);
      empty.appendChild(btn);
    }

    // Browsing: one shelf per subject, so dozens of topics stay scannable.
    // Searching: one list, best match first - grouping would bury it.
    if (state.q) {
      host.className = "cards flat";
      found.forEach(function (t) { host.appendChild(card(t, marks)); });
      return;
    }
    host.className = "cards";
    subjectsInOrder().forEach(function (s) {
      var list = found.filter(function (t) { return t.subject === s; });
      if (!list.length) return;
      var sec = document.createElement("section");
      sec.className = "subject-group";
      sec.dataset.key = subjectKey(s);
      var head = document.createElement("header");
      var h = document.createElement("h2");
      h.textContent = s;
      var n = document.createElement("span");
      n.textContent = list.length + (list.length === 1 ? " topic" : " topics");
      head.append(h, n);
      var grid = document.createElement("div");
      grid.className = "card-grid";
      list.forEach(function (t) { grid.appendChild(card(t, marks)); });
      sec.append(head, grid);
      host.appendChild(sec);
    });
  }

  /* -------------------------------------------------------------- topic */
  var KEYWORDS = /\b(def|return|import|from|for|while|if|elif|else|in|and|or|not|None|True|False|as|with|lambda|class|raise)\b/g;
  var STR_OR_COMMENT = /"""[\s\S]*?"""|'''[\s\S]*?'''|"[^"\n]*"|'[^'\n]*'|#[^\n]*/g;

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function highlight(src) {
    // Walk the source once, splitting it into "code" and "string/comment"
    // pieces. Only the code pieces get keyword and number markup, so nothing
    // inside a docstring or comment can be mangled.
    var out = "", last = 0, m;
    STR_OR_COMMENT.lastIndex = 0;

    function code(chunk) {
      return esc(chunk)
        .replace(KEYWORDS, '<span class="tok-kw">$1</span>')
        .replace(/\b(\d+\.?\d*(?:e-?\d+)?)\b/g, '<span class="tok-num">$1</span>');
    }

    while ((m = STR_OR_COMMENT.exec(src)) !== null) {
      out += code(src.slice(last, m.index));
      var cls = m[0].charAt(0) === "#" ? "tok-com" : "tok-str";
      out += '<span class="' + cls + '">' + esc(m[0]) + "</span>";
      last = m.index + m[0].length;
    }
    out += code(src.slice(last));
    return out;
  }

  /* Where to go next. Previous/next follow the collection's order (the
     order topics were written in), and "related" ranks by shared tags - a
     cheap signal, but the tags are written as the questions a stuck student
     asks, so topics that share them tend to share the confusion too. */
  function related(t, n) {
    var mine = {};
    t.tags.forEach(function (tag) { mine[tag.toLowerCase()] = true; });
    return TOPICS.filter(function (x) { return x.id !== t.id; })
      .map(function (x) {
        var shared = x.tags.filter(function (tag) { return mine[tag.toLowerCase()]; }).length;
        return { t: x, score: shared + (x.subject === t.subject ? 0.5 : 0) };
      })
      .filter(function (r) { return r.score >= 1; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, n)
      .map(function (r) { return r.t; });
  }

  function topicLink(x, cls, lead) {
    var a = document.createElement("a");
    a.className = cls;
    a.href = "#/" + x.id;
    if (lead) {
      var small = document.createElement("small");
      small.textContent = lead;
      a.appendChild(small);
    }
    var strong = document.createElement("span");
    strong.textContent = x.title;
    a.appendChild(strong);
    return a;
  }

  function topicNav(t) {
    var nav = document.createElement("nav");
    nav.className = "topic-nav";
    nav.setAttribute("aria-label", "More topics");

    var i = TOPICS.indexOf(t);
    var pn = document.createElement("div");
    pn.className = "prev-next";
    if (i > 0) pn.appendChild(topicLink(TOPICS[i - 1], "prev", "← Previous"));
    if (i < TOPICS.length - 1) pn.appendChild(topicLink(TOPICS[i + 1], "next", "Next →"));
    nav.appendChild(pn);

    var rel = related(t, 3);
    if (rel.length) {
      var h = document.createElement("h2");
      h.textContent = "Related topics";
      var ul = document.createElement("ul");
      ul.className = "related";
      rel.forEach(function (x) {
        var li = document.createElement("li");
        li.appendChild(topicLink(x, "related-link", x.subject));
        ul.appendChild(li);
      });
      nav.append(h, ul);
    }
    return nav;
  }

  function renderMissing(id) {
    document.body.dataset.page = "missing";
    view.innerHTML = "";
    view.appendChild(tpl("tpl-missing"));
    view.querySelector("[data-wanted]").textContent = "#/" + id;
    document.title = "Topic not found — IB HL Visualisations";
  }

  function renderTopic(id) {
    var t = TOPICS.filter(function (x) { return x.id === id; })[0];
    if (!t) { renderMissing(id); return; }

    view.innerHTML = "";
    view.appendChild(tpl("tpl-topic"));

    view.querySelector("[data-subject]").textContent = t.subject;
    view.querySelector("[data-title]").textContent = t.title;
    view.querySelector("[data-syllabus]").textContent = t.syllabus + " · " + t.folder;
    view.querySelector("[data-hard]").textContent = t.hard_bit;
    view.querySelector("[data-shows]").textContent = t.shows;
    view.querySelector("[data-notebook]").href = t.notebook_url;
    view.querySelector("[data-colab]").href = t.colab_url;

    document.getElementById("source").innerHTML = highlight(t.source);
    document.title = t.title + " — IB HL Visualisations";
    document.body.dataset.accent = subjectKey(t.subject);
    view.querySelector("[data-entry]").textContent = entryNo(t);
    view.querySelector("[data-script]").textContent = t.script;

    var copyBtn = document.getElementById("copy-btn");
    var copyStatus = document.getElementById("copy-status");
    copyBtn.addEventListener("click", function () {
      // navigator.clipboard only exists in a secure context, so over plain
      // http it is undefined and .writeText threw before the fallback below
      // could run. Rejecting instead routes that case to the same fallback.
      var write = navigator.clipboard && navigator.clipboard.writeText
        ? navigator.clipboard.writeText(t.source)
        : Promise.reject(new Error("no clipboard"));
      write.then(function () {
        copyBtn.textContent = "Copied ✓";
        copyStatus.textContent = "Source copied to clipboard.";
        setTimeout(function () { copyBtn.textContent = "Copy"; copyStatus.textContent = ""; }, 1600);
      }, function () {
        // clipboard blocked (some browsers over file://) - select it instead
        var r = document.createRange();
        r.selectNodeContents(document.getElementById("source"));
        var sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(r);
        copyBtn.textContent = "Selected — press Ctrl+C";
        copyStatus.textContent = "Clipboard unavailable. The source is selected; press Control C to copy.";
        setTimeout(function () { copyBtn.textContent = "Copy"; copyStatus.textContent = ""; }, 2600);
      });
    });

    document.getElementById("dl-btn").addEventListener("click", function () {
      var blob = new Blob([t.source], { type: "text/x-python" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = t.script;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });

    view.querySelector(".topic").appendChild(topicNav(t));
    renderIndex(view.querySelector("[data-index]"), t);
    renderExtras(t);

    // A topic without a browser port still gets a page - but it gets it
    // without an empty canvas sitting under a "Try it" heading.
    var demoOk = window.hasDemo && window.hasDemo(t.demo);
    if (!demoOk) {
      var panel = document.getElementById("demo-panel");
      if (panel) panel.remove();
    }
    numberSections();
    if (!demoOk) return;

    active = window.mountDemo(
      t.demo,
      document.getElementById("stage"),
      document.getElementById("demo-controls"),
      document.getElementById("demo-readout")
    );

    var long = view.querySelector(".demo.orb-demo");
    var cap = view.querySelector("[data-caption]");
    if (long) {
      orbitalsToc(long);
    } else if (cap) {
      var b = document.createElement("b");
      b.textContent = "Figure " + (TOPICS.indexOf(t) + 1) + ".";
      cap.append(b, " A browser port of " + t.script
        + ", with the same maths as the Python below.");
    }
  }

  /* --------------------------------------------------- topic: sections */
  // Sections are numbered 01, 02... in the order they appear, counting
  // only the ones this topic actually has.
  function numberSections() {
    var n = 0;
    view.querySelectorAll(".topic > .block:not([hidden]) > .kicker .n").forEach(function (el) {
      n++;
      el.textContent = (n < 10 ? "0" : "") + n;
    });
  }

  // topics.json marks code the README way, with `backticks`. Built from text
  // nodes, never innerHTML, so nothing in the file can inject markup.
  function inline(el, text) {
    String(text).split("`").forEach(function (part, i) {
      if (!part) return;
      if (i % 2) {
        var c = document.createElement("code");
        c.textContent = part;
        el.appendChild(c);
      } else {
        el.appendChild(document.createTextNode(part));
      }
    });
    return el;
  }

  // try_changing, equations and questions are optional in topics.json.
  // Each section stays hidden until a topic has something to put in it.
  function renderExtras(t) {
    var eqs = Array.isArray(t.equations) ? t.equations : [];
    if (eqs.length) {
      var host = view.querySelector("[data-equations]");
      eqs.forEach(function (e) {
        var fig = document.createElement("figure");
        fig.className = "eq";
        var tex = document.createElement("span");
        // Until KaTeX arrives (or if it never does) the source is readable.
        tex.className = "eq-tex raw";
        tex.textContent = e.tex;
        tex.dataset.tex = e.tex;
        var cap = document.createElement("figcaption");
        inline(cap, e.caption);
        fig.append(tex, cap);
        host.appendChild(fig);
      });
      view.querySelector('[data-block="equations"]').hidden = false;
      typeset(host);
    }

    var tries = Array.isArray(t.try_changing) ? t.try_changing : [];
    if (tries.length) {
      var ul = view.querySelector("[data-try]");
      tries.forEach(function (x) {
        var li = document.createElement("li");
        inline(li, x);
        ul.appendChild(li);
      });
      view.querySelector('[data-block="try"]').hidden = false;
    }

    var qs = Array.isArray(t.questions) ? t.questions : [];
    if (qs.length) {
      var quiz = view.querySelector("[data-questions]");
      qs.forEach(function (q, i) {
        var d = document.createElement("details");
        var s = document.createElement("summary");
        var num = document.createElement("span");
        num.className = "qn";
        num.textContent = "Q" + (i + 1);
        var text = document.createElement("span");
        inline(text, q.q);
        var reveal = document.createElement("span");
        reveal.className = "reveal";
        reveal.setAttribute("aria-hidden", "true");
        reveal.textContent = "Show answer";
        s.append(num, text, reveal);
        var a = document.createElement("p");
        a.className = "answer";
        inline(a, q.a);
        d.append(s, a);
        d.addEventListener("toggle", function () {
          reveal.textContent = d.open ? "Hide" : "Show answer";
        });
        quiz.appendChild(d);
      });
      view.querySelector('[data-block="questions"]').hidden = false;
    }
  }

  // KaTeX is self-hosted in vendor/katex/ (no CDN at runtime) and only
  // fetched by a page that has an equation, so the home page and every
  // topic without maths never pay its ~300 KB.
  var katexLoading = null;
  function loadKatex() {
    if (window.katex) return Promise.resolve(window.katex);
    if (katexLoading) return katexLoading;
    katexLoading = new Promise(function (resolve, reject) {
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = BASE + "vendor/katex/katex.min.css";
      document.head.appendChild(link);
      var s = document.createElement("script");
      s.src = BASE + "vendor/katex/katex.min.js";
      s.onload = function () { resolve(window.katex); };
      s.onerror = function () { katexLoading = null; reject(new Error("katex")); };
      document.head.appendChild(s);
    });
    return katexLoading;
  }

  function typeset(host) {
    loadKatex().then(function (katex) {
      host.querySelectorAll(".eq-tex[data-tex]").forEach(function (el) {
        try {
          katex.render(el.dataset.tex, el, { displayMode: true, throwOnError: false, output: "htmlAndMathml" });
          el.classList.remove("raw");
        } catch (e) { /* leave the TeX source showing */ }
      });
    }, function () { /* offline or blocked: the TeX source stays readable */ });
  }

  // Every topic, grouped by subject, for the sidebar on wide screens.
  function renderIndex(host, current) {
    if (!host) return;
    subjectsInOrder().forEach(function (s) {
      var group = document.createElement("div");
      group.dataset.key = subjectKey(s);
      var h = document.createElement("h3");
      h.textContent = s;
      var ul = document.createElement("ul");
      TOPICS.filter(function (x) { return x.subject === s; }).forEach(function (x) {
        var li = document.createElement("li");
        var a = document.createElement("a");
        a.href = "#/" + x.id;
        a.textContent = x.title;
        var small = document.createElement("small");
        small.textContent = x.syllabus;
        a.appendChild(small);
        if (x === current) a.setAttribute("aria-current", "page");
        li.appendChild(a);
        ul.appendChild(li);
      });
      group.append(h, ul);
      host.appendChild(group);
    });
  }

  // The orbitals walkthrough is four sections long, so it gets a row of
  // jump links above it. Scrolled by script, not by #fragment, because the
  // hash is the router's: on file:// it holds the route itself.
  function orbitalsToc(demo) {
    var secs = demo.querySelectorAll(".orb-section");
    if (secs.length < 2) return;
    var ol = document.createElement("ol");
    ol.className = "orb-toc";
    ol.setAttribute("aria-label", "Parts of this walkthrough");
    secs.forEach(function (sec, i) {
      var h = sec.querySelector("h3");
      if (!h) return;
      h.tabIndex = -1;
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = "#";
      var b = document.createElement("b");
      b.textContent = String(i + 1);
      a.append(b, h.textContent.replace(/^\d+\.\s*/, ""));
      a.addEventListener("click", function (e) {
        e.preventDefault();
        sec.scrollIntoView({ block: "start" });
        h.focus({ preventScroll: true });
      });
      li.appendChild(a);
      ol.appendChild(li);
    });
    demo.parentNode.insertBefore(ol, demo);
  }

  /* ------------------------------------------------------------- router */
  // Every topic has a real page at t/<id>/, written by build_site.py, so a
  // link can be shared, crawled and reloaded on any static host with no
  // rewrite rules. app.js always sits at the site root, so its own URL says
  // where that is - "/" on Vercel and Render, "/Capstone_Repository/" on
  // GitHub Pages - without hard-coding either.
  var BASE = new URL(".", (document.currentScript || {}).src || location.href).pathname;
  var shown = null;           // route on screen, so #view alone does not rebuild it

  function known(id) { return TOPICS.some(function (t) { return t.id === id; }); }
  function dec(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }

  // The topic the path names (…/t/<id>/), or "" for home.
  function pathRoute() {
    var rest = location.pathname.indexOf(BASE) === 0 ? location.pathname.slice(BASE.length) : "";
    var m = /^t\/([^/]+)\/?(?:index\.html)?$/.exec(rest);
    return m ? dec(m[1]) : "";
  }

  // The #/<id> an old shared link or an in-page link carries, or null.
  // Supabase returns from Google, a confirmation email or a reset link with
  // tokens in the fragment; those are auth.js's to read, not topic ids.
  function hashRoute() {
    var h = location.hash;
    if (/access_token=|refresh_token=|error_description=/.test(h)
        || (/error=/.test(h) && /type=/.test(h))) return null;
    return /^#\//.test(h) ? dec(h.slice(2)).replace(/\/$/, "") : null;
  }

  // Put the real URL for a route in the address bar. false if the browser
  // refuses (file:// will not rewrite a path), so the caller keeps the hash.
  function go(id, replace) {
    var url = BASE + (id ? "t/" + encodeURIComponent(id) + "/" : "") + (replace ? location.search : "");
    try { history[replace ? "replaceState" : "pushState"](null, "", url); return true; }
    catch (e) { return false; }
  }

  function route() {
    var id = hashRoute();
    if (id === null) {
      id = pathRoute();
    } else if (!id || known(id)) {
      // An old #/<id> link becomes the page's own URL, so the next copy of
      // it is the good one. An unknown id keeps its hash for "not here".
      // Not until the parser is done, though: the scripts after this one
      // resolve their relative src against the address bar, and would 404.
      var fix = function () { go(id, true); };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fix);
      else fix();
    }
    if (id === shown) return;
    shown = id;

    if (active && active.destroy) { active.destroy(); active = null; }
    window.scrollTo(0, 0);
    // body carries which page this is and whose colours it wears; the
    // stylesheet keys the header search and the accent off these.
    document.body.removeAttribute("data-accent");
    document.body.dataset.page = id ? "topic" : "home";
    if (!id) {
      document.title = "IB HL Visualisations";
      renderHome();
    } else {
      renderTopic(id);
    }

    // Move focus to the new heading so the view change is announced instead
    // of leaving a keyboard user stranded at the top of the document.
    if (booted) {
      var h = view.querySelector("h1[tabindex]");
      if (h) h.focus();
    }
    booted = true;

    // pushState navigations fire no event of their own, so anything outside
    // the router that cares which page is showing (nav.js's current tab)
    // hears it from here instead of guessing from hashchange.
    window.dispatchEvent(new CustomEvent("routechange", { detail: { id: id } }));
  }

  // "/" jumps to the search box, the way most doc sites behave.
  document.addEventListener("keydown", function (e) {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
    var el = document.activeElement, tag = el && el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || (el && el.isContentEditable)) return;
    var search = document.getElementById("search");
    if (!search) return;
    e.preventDefault();
    search.focus();
    search.select();
  });

  // The in-page links still say #/<id> (cards, back link, brand). Catch them
  // before the browser adds a #/ history entry and push the real URL instead,
  // so Back and Forward step between pages rather than fragments. Modified
  // clicks fall through: a new tab opens at #/<id>, and route() redirects it.
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href^="#/"]');
    if (!a) return;
    var id = dec(a.getAttribute("href").slice(2)).replace(/\/$/, "");
    if (id && !known(id)) return;
    if (id === shown && !location.hash) { e.preventDefault(); window.scrollTo(0, 0); return; }
    if (go(id, false)) { e.preventDefault(); route(); }
  });

  // popstate covers Back/Forward; hashchange covers a #/<id> typed or set by
  // script (nav.js does). Both fire for one fragment change - shown dedupes.
  window.addEventListener("popstate", route);
  window.addEventListener("hashchange", route);
  route();
})();
