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
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      // match the stem too, so 'heating' finds 'heat' and 'reactions' finds 'reaction'
      var stem = w.replace(/(ing|ed|es|s)$/, "");
      if (hay.indexOf(w) !== -1 || (stem.length > 3 && hay.indexOf(stem) !== -1)) hits++;
    }
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

  /* -------------------------------------------------------------- thumb */
  // Cards are rebuilt on every keystroke. Drawing three canvases is cheap
  // now, but the collection is meant to reach dozens of topics, so the
  // previews are drawn once and reused.
  var thumbCache = {};

  var TW = 560, TH = 192, TP = 10;   // inset, so curves never touch the edge
  function tx(u) { return TP + u * (TW - 2 * TP); }
  function ty(v) { return TH - TP - Math.max(0, Math.min(1, v)) * (TH - 2 * TP); }

  function buildThumb(topic) {
    var dpr = window.devicePixelRatio || 1;
    var c = document.createElement("canvas");
    c.className = "thumb";
    c.width = Math.round(TW * dpr); c.height = Math.round(TH * dpr);
    c.setAttribute("aria-hidden", "true");
    var g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    var accent = getComputedStyle(document.body).getPropertyValue("--accent").trim() || "#b4341f";
    var soft = getComputedStyle(document.body).getPropertyValue("--plot-ref").trim() || "#999";
    g.lineWidth = 3; g.lineJoin = "round";

    function curve(fn, color, dash) {
      g.beginPath(); g.strokeStyle = color; g.setLineDash(dash || []);
      for (var i = 0; i <= 120; i++) {
        var u = i / 120;
        var p = fn(u);
        if (i === 0) g.moveTo(tx(p[0]), ty(p[1]));
        else g.lineTo(tx(p[0]), ty(p[1]));
      }
      g.stroke(); g.setLineDash([]);
    }

    if (topic.demo === "taylor") {
      curve(function (u) { return [u, 0.5 + 0.32 * Math.sin(u * 12 - 6)]; }, soft);
      curve(function (u) {
        var x = u * 12 - 6, y = x - Math.pow(x, 3) / 6 + Math.pow(x, 5) / 120;
        return [u, 0.5 + 0.32 * Math.max(-1.5, Math.min(1.5, y))];
      }, accent);
    } else if (topic.demo === "projectile") {
      curve(function (u) { return [u, 3.4 * u * (1 - u)]; }, soft, [7, 6]);
      curve(function (u) { return [u * 0.78, 3.4 * (u * 0.78) * (1 - u * 0.92) * 0.86]; }, accent);
    } else {
      var mb = function (u) {
        var x = u * 3.2;
        return Math.min(0.92, x * x * Math.exp(-x * x / 1.1) * 0.95);
      };
      g.fillStyle = getComputedStyle(document.body).getPropertyValue("--plot-fill").trim()
        || "rgba(180,52,31,.3)";
      g.beginPath(); g.moveTo(tx(0.52), ty(0));
      for (var i = 62; i <= 120; i++) g.lineTo(tx(i / 120), ty(mb(i / 120)));
      g.lineTo(tx(1), ty(0)); g.closePath(); g.fill();
      curve(function (u) { return [u, mb(u)]; }, accent);
    }
    return c;
  }

  function thumb(topic) {
    if (!thumbCache[topic.id]) thumbCache[topic.id] = buildThumb(topic);
    return thumbCache[topic.id];
  }

  // Previews bake in the theme colours, so redraw them when the theme flips.
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var onScheme = function () {
      thumbCache = {};
      if (document.getElementById("cards")) renderCards();
    };
    if (mq.addEventListener) mq.addEventListener("change", onScheme);
    else if (mq.addListener) mq.addListener(onScheme);
  }

  /* --------------------------------------------------------------- home */
  function renderHome() {
    view.innerHTML = "";
    view.appendChild(tpl("tpl-home"));

    var subjects = ["All"].concat(TOPICS.map(function (t) { return t.subject; })
      .filter(function (s, i, a) { return a.indexOf(s) === i; }));

    var filters = document.getElementById("filters");
    subjects.forEach(function (s) {
      var b = document.createElement("button");
      b.className = "chip";
      b.type = "button";
      b.textContent = s;
      b.setAttribute("aria-pressed", String(s === state.subject));
      b.addEventListener("click", function () {
        state.subject = s;
        renderCards();
        filters.querySelectorAll(".chip").forEach(function (c) {
          c.setAttribute("aria-pressed", String(c.textContent === s));
        });
      });
      filters.appendChild(b);
    });

    var search = document.getElementById("search");
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
    var filters = document.getElementById("filters");
    if (filters) {
      filters.querySelectorAll(".chip").forEach(function (c) {
        c.setAttribute("aria-pressed", String(c.textContent === "All"));
      });
    }
    renderCards();
  }

  function renderCards() {
    var host = document.getElementById("cards");
    var empty = document.getElementById("empty");
    var count = document.getElementById("count");
    if (!host) return;
    host.innerHTML = "";

    var found = matches();
    var filtered = state.q || state.subject !== "All";

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

    found.forEach(function (t) {
      var a = document.createElement("a");
      a.className = "card";
      a.href = "#/" + t.id;
      a.appendChild(thumb(t));
      var pill = document.createElement("span");
      pill.className = "pill";
      pill.textContent = t.subject;
      var h = document.createElement("h3");
      h.textContent = t.title;
      var p = document.createElement("p");
      p.textContent = t.hard_bit;
      a.append(pill, h, p);
      host.appendChild(a);
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

  function renderMissing(id) {
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

    var copyBtn = document.getElementById("copy-btn");
    var copyStatus = document.getElementById("copy-status");
    copyBtn.addEventListener("click", function () {
      navigator.clipboard.writeText(t.source).then(function () {
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

    // A topic without a browser port still gets a page - but it gets it
    // without an empty canvas sitting under a "Try it" heading.
    if (!window.hasDemo || !window.hasDemo(t.demo)) {
      var panel = document.getElementById("demo-panel");
      if (panel) panel.remove();
      return;
    }

    active = window.mountDemo(
      t.demo,
      document.getElementById("stage"),
      document.getElementById("demo-controls"),
      document.getElementById("demo-readout")
    );
  }

  /* ------------------------------------------------------------- router */
  function route() {
    if (active && active.destroy) { active.destroy(); active = null; }
    var hash = location.hash.replace(/^#\/?/, "");
    window.scrollTo(0, 0);
    if (!hash) {
      document.title = "IB HL Visualisations";
      renderHome();
    } else {
      renderTopic(hash);
    }

    // Move focus to the new heading so the view change is announced instead
    // of leaving a keyboard user stranded at the top of the document.
    if (booted) {
      var h = view.querySelector("h1[tabindex]");
      if (h) h.focus();
    }
    booted = true;
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

  window.addEventListener("hashchange", route);
  route();
})();
