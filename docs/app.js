/* Routing, search and the code viewer. */
(function () {
  "use strict";

  var view = document.getElementById("view");
  var TOPICS = window.TOPICS || [];
  var active = null;          // currently mounted demo, so we can stop its loop
  var state = { q: "", subject: "All" };

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
  function thumb(topic) {
    // tiny static preview so the cards are not just text
    var c = document.createElement("canvas");
    c.className = "thumb";
    c.width = 560; c.height = 192;
    var g = c.getContext("2d");
    var accent = getComputedStyle(document.body).getPropertyValue("--accent").trim() || "#b4341f";
    var soft = getComputedStyle(document.body).getPropertyValue("--border").trim() || "#ddd";
    g.lineWidth = 3; g.lineJoin = "round";

    function curve(fn, color, dash) {
      g.beginPath(); g.strokeStyle = color; g.setLineDash(dash || []);
      for (var i = 0; i <= 120; i++) {
        var u = i / 120;
        var p = fn(u);
        if (i === 0) g.moveTo(p[0] * 560, 192 - p[1] * 192);
        else g.lineTo(p[0] * 560, 192 - p[1] * 192);
      }
      g.stroke(); g.setLineDash([]);
    }

    if (topic.demo === "taylor") {
      curve(function (u) { return [u, 0.5 + 0.32 * Math.sin(u * 12 - 6)]; }, soft);
      curve(function (u) {
        var x = u * 12 - 6, y = x - Math.pow(x, 3) / 6 + Math.pow(x, 5) / 120;
        return [u, 0.5 + 0.32 * Math.max(-1.6, Math.min(1.6, y))];
      }, accent);
    } else if (topic.demo === "projectile") {
      curve(function (u) { return [u, 3.4 * u * (1 - u)]; }, soft, [7, 6]);
      curve(function (u) { return [u * 0.78, 3.4 * (u * 0.78) * (1 - u * 0.92) * 0.86]; }, accent);
    } else {
      curve(function (u) {
        var x = u * 3.2;
        return [u, Math.min(0.92, x * x * Math.exp(-x * x / 1.1) * 0.95)];
      }, accent);
      g.fillStyle = accent; g.globalAlpha = 0.18;
      g.beginPath(); g.moveTo(0.52 * 560, 192);
      for (var i = 62; i <= 120; i++) {
        var u = i / 120, x = u * 3.2;
        g.lineTo(u * 560, 192 - Math.min(0.92, x * x * Math.exp(-x * x / 1.1) * 0.95) * 192);
      }
      g.lineTo(560, 192); g.closePath(); g.fill(); g.globalAlpha = 1;
    }
    return c;
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

  function renderCards() {
    var host = document.getElementById("cards");
    var empty = document.getElementById("empty");
    if (!host) return;
    host.innerHTML = "";

    var found = matches();
    empty.hidden = found.length > 0;

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

  function renderTopic(id) {
    var t = TOPICS.filter(function (x) { return x.id === id; })[0];
    if (!t) { location.hash = "#/"; return; }

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
    copyBtn.addEventListener("click", function () {
      navigator.clipboard.writeText(t.source).then(function () {
        copyBtn.textContent = "Copied ✓";
        setTimeout(function () { copyBtn.textContent = "Copy"; }, 1600);
      }, function () {
        // clipboard blocked (some browsers over file://) - select it instead
        var r = document.createRange();
        r.selectNodeContents(document.getElementById("source"));
        var sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(r);
        copyBtn.textContent = "Selected — press Ctrl+C";
        setTimeout(function () { copyBtn.textContent = "Copy"; }, 2600);
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
  }

  window.addEventListener("hashchange", route);
  route();
})();
