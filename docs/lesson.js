/* The topic page: a full lesson in the standard format where one exists,
   otherwise an overview with the topic's connections and any questions. */
(function () {
  "use strict";

  var Slime = window.Slime;
  var D = Slime.data, S = Slime.store, U = Slime.ui, h = U.h;
  var views = Slime.views = Slime.views || {};

  /* ---------------------------------------------- python highlighting */
  var KEYWORDS = /\b(def|return|import|from|for|while|if|elif|else|in|and|or|not|None|True|False|as|with|lambda|class|raise)\b/g;
  var STR_OR_COMMENT = /"""[\s\S]*?"""|'''[\s\S]*?'''|"[^"\n]*"|'[^'\n]*'|#[^\n]*/g;

  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  // Only the code pieces get keyword and number markup, so nothing inside a
  // docstring or comment can be mangled.
  function highlight(src) {
    var out = "", last = 0, m;
    STR_OR_COMMENT.lastIndex = 0;
    function code(chunk) {
      return esc(chunk)
        .replace(KEYWORDS, '<span class="tok-kw">$1</span>')
        .replace(/\b(\d+\.?\d*(?:e-?\d+)?)\b/g, '<span class="tok-num">$1</span>');
    }
    while ((m = STR_OR_COMMENT.exec(src)) !== null) {
      out += code(src.slice(last, m.index));
      out += '<span class="' + (m[0].charAt(0) === "#" ? "tok-com" : "tok-str") + '">' + esc(m[0]) + "</span>";
      last = m.index + m[0].length;
    }
    return out + code(src.slice(last));
  }

  function pythonPanel(topicId) {
    var t = (window.TOPICS || []).filter(function (x) { return x.id === topicId; })[0];
    if (!t) return null;
    var code = h("code", { html: highlight(t.source) });
    var status = h("p.sr-only", { role: "status", "aria-live": "polite" });
    var copy = h("button.btn", { type: "button" }, "Copy");
    var dl = h("button.btn.primary", { type: "button" }, "Download .py");
    copy.addEventListener("click", function () {
      navigator.clipboard.writeText(t.source).then(function () {
        copy.textContent = "Copied ✓"; status.textContent = "Source copied to clipboard.";
        setTimeout(function () { copy.textContent = "Copy"; status.textContent = ""; }, 1600);
      }, function () {
        var r = document.createRange(); r.selectNodeContents(code);
        var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
        copy.textContent = "Selected. Press Ctrl+C";
      });
    });
    dl.addEventListener("click", function () {
      var url = URL.createObjectURL(new Blob([t.source], { type: "text/x-python" }));
      var a = h("a", { href: url, download: t.script });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
    return h("details.panel.python",
      h("summary", h("span.panel-kicker", "Extension"), " Run it yourself in Python"),
      h("p.hint", "The real file from the repository. Run it with ", h("code", "pip install -r requirements.txt"),
        " and you get the same figures as the simulation above."),
      h("div.actions", copy, dl),
      h("pre.code", { tabindex: "0" }, code),
      h("p.hint", "Prefer a notebook? ", h("a", { href: t.notebook_url, target: "_blank", rel: "noopener" }, "View on GitHub"),
        " · ", h("a", { href: t.colab_url, target: "_blank", rel: "noopener" }, "Open in Colab"), "."),
      status
    );
  }

  /* ------------------------------------------------------- confidence */
  var CONF = ["", "Not at all", "A little", "Somewhat", "Fairly", "Very"];

  function confidence(node) {
    var group = h("div.conf-scale", { role: "radiogroup", "aria-label": "How confident do you feel about " + node.title + "?" });
    var note = h("p.conf-note", { "aria-live": "polite" });
    function paint() {
      var v = S.node(node.id).confidence, st = S.stage(node.id);
      group.querySelectorAll("button").forEach(function (b) {
        b.setAttribute("aria-checked", String(Number(b.value) === v));
      });
      note.textContent = !v ? "Self-reported, and kept separate from the progress the questions measure." :
        v >= 4 && st.index <= 2 ? "You feel confident, but the questions haven't shown it yet. A quick practice set would confirm it." :
        v <= 2 && st.index >= 3 ? "You're doing better than you feel: you've answered several questions correctly without help." :
        "Thanks. You can change this at any time.";
    }
    for (var i = 1; i <= 5; i++) {
      var b = h("button.conf-btn", { type: "button", role: "radio", value: i, "aria-label": i + ": " + CONF[i] }, String(i));
      b.addEventListener("click", function (e) { S.setConfidence(node.id, Number(e.currentTarget.value)); paint(); });
      group.appendChild(b);
    }
    paint();
    return h("div.conf",
      h("span.conf-q", "How confident do you feel?"),
      h("div.conf-row", h("span.conf-end", "Not at all"), group, h("span.conf-end", "Very")),
      note);
  }

  /* ---------------------------------------------------- worked example */
  function example(ex, i) {
    var steps = h("ol.ex-steps");
    var answer = h("p.ex-answer", { hidden: true }, h("b", "Answer: "), h("span", { html: ex.answer }));
    var shown = 0;
    var next = h("button.btn.primary", { type: "button" }, "Show the first step");
    var all = h("button.btn.ghost", { type: "button" }, "Show all steps");
    function reveal(n) {
      while (shown < n && shown < ex.steps.length) {
        var s = ex.steps[shown];
        steps.appendChild(h("li", h("div.ex-do", { html: s.do }), s.why ? h("div.ex-why", { html: s.why }) : null));
        shown++;
      }
      if (shown >= ex.steps.length) { answer.hidden = false; next.hidden = true; all.hidden = true; }
      else next.textContent = "Show step " + (shown + 1) + " of " + ex.steps.length;
    }
    next.addEventListener("click", function () { reveal(shown + 1); });
    all.addEventListener("click", function () { reveal(ex.steps.length); });
    return h("div.example",
      h("h3", "Example " + (i + 1) + " · " + ex.title),
      h("div.ex-problem", { html: ex.problem }),
      h("p.ex-tip", "Try it on paper first, then reveal the solution one step at a time."),
      steps, answer, h("div.actions", next, all));
  }

  /* ------------------------------------------------------- the page */
  views.topic = function (view, id) {
    var node = D.node(id);
    if (!node) return views.missing(view, "#/topic/" + id);
    var lesson = D.lesson(id), subj = D.subject(node.subject);
    var active = null;
    S.visit(id);
    document.title = (lesson ? lesson.title : node.title) + " · SlimeIB";

    view.appendChild(h("nav.crumbs", { "aria-label": "Breadcrumb" },
      h("a", { href: "#/map/" + node.subject + "?node=" + id }, "← " + subj.short + " map"),
      h("span", " / " + D.cluster(node.subject, node.cluster).name)));

    var stageSlot = h("span");
    function paintStage() { stageSlot.innerHTML = ""; stageSlot.appendChild(U.stageMeter(S.stage(id))); }
    paintStage();

    view.appendChild(h("header.topic-head",
      h("div.np-tags", U.subjectPill(node.subject), U.levelBadge(node.level), U.specBadge(node.spec)),
      h("h1", { tabindex: "-1" }, lesson ? lesson.title : node.title),
      h("p.syllabus", node.syllabus + " · " + subj.name + (lesson ? " · about " + lesson.minutes + " minutes" : "")),
      h("div.topic-status", stageSlot, S.node(id).lessonDone ? h("span.done-badge", "✓ Lesson complete") : null),
      confidence(node)
    ));

    if (!lesson) {
      view.appendChild(h("section.panel",
        h("h2", "Overview"), h("p", node.summary),
        h("p.muted", "The full lesson for this topic is still being written. In the meantime its connections show what it builds on and where it leads.")));
      var qs = D.questionsFor(id);
      if (qs.length) {
        var host = h("div.practice-list");
        qs.forEach(function (q) { host.appendChild(Slime.quiz.render(q, { onAttempt: paintStage })); });
        view.appendChild(h("section.panel", h("h2", "Practice"), host));
      }
      view.appendChild(h("section.panel.conn-panel", Slime.map.panel(node, function (o) { location.hash = "#/topic/" + o; })));
      return {};
    }

    /* section nav: buttons, not #anchors, because the hash is the route */
    var sections = [];
    function section(key, title) {
      var kids = Array.prototype.slice.call(arguments, 2);
      var el = h("section.panel.lesson-part", { id: "part-" + key, "aria-labelledby": "h-" + key },
        h("h2", { id: "h-" + key }, h("span.panel-kicker", String(sections.length + 1)), " " + title), kids);
      sections.push({ key: key, title: title, el: el });
      return el;
    }

    var parts = [];
    parts.push(section("objectives", "Objectives",
      h("ul.objectives", lesson.objectives.map(function (o) { return h("li", { html: o }); }))));

    parts.push(section("explain", "Explanation", lesson.explanation.map(function (s) {
      return h("div.explain", h("h3", s.heading), s.body.map(function (b) {
        return /^<(p|ul|ol)[ >]/.test(b) ? h("div", { html: b }) : h("p", { html: b });
      }));
    })));

    var demoWrap = null;
    if (lesson.demo && window.hasDemo(lesson.demo.id)) {
      var canvas = h("canvas", { width: 900, height: 480, role: "img", "aria-label": "Interactive simulation" });
      var controls = h("div.demo-controls");
      var readout = h("p.readout", { "aria-live": "off" });
      demoWrap = h("div.demo", canvas, controls, readout);
      parts.push(section("demo", "Interactive demonstration",
        h("p", { html: lesson.demo.intro }), demoWrap,
        lesson.demo.notice ? h("div.notice", h("h3", "Things to notice"),
          h("ul", lesson.demo.notice.map(function (n) { return h("li", { html: n }); }))) : null));
    }

    parts.push(section("examples", "Worked examples", lesson.examples.map(example)));

    var qs2 = D.questionsFor(id);
    var tried = h("p.practice-count", { role: "status" });
    function paintTried() {
      var n = qs2.filter(function (q) { return S.lastAttempt(q.id); }).length;
      tried.textContent = n + " of " + qs2.length + " attempted. Each answer moves your progress ring. Hints and revealed solutions count for less.";
    }
    paintTried();
    var plist = h("div.practice-list");
    qs2.forEach(function (q) {
      plist.appendChild(Slime.quiz.render(q, { onAttempt: function () { paintTried(); paintStage(); } }));
    });
    parts.push(section("practice", "Independent practice",
      h("p", "Questions get harder as you go down. Use hints when you're stuck. Each one you don't need is stronger evidence that you've got it."),
      tried, plist));

    parts.push(section("summary", "Key takeaways",
      h("ul.takeaways", lesson.takeaways.map(function (t) { return h("li", { html: t }); }))));

    var nav = h("nav.lesson-nav", { "aria-label": "Lesson sections" });
    sections.forEach(function (s, i) {
      var b = h("button", { type: "button" }, h("span.n", String(i + 1)), " " + s.title);
      b.addEventListener("click", function () {
        s.el.scrollIntoView({ behavior: "smooth", block: "start" });
        s.el.querySelector("h2").setAttribute("tabindex", "-1");
        s.el.querySelector("h2").focus({ preventScroll: true });
      });
      nav.appendChild(b);
    });
    view.appendChild(nav);
    parts.forEach(function (p) { view.appendChild(p); });

    /* completion */
    var finish = h("section.panel.finish");
    function paintFinish() {
      finish.innerHTML = "";
      var done = S.node(id).lessonDone;
      if (!done) {
        var attempted = qs2.some(function (q) { return S.lastAttempt(q.id); });
        var btn = h("button.btn.primary.big", { type: "button" }, "Mark lesson complete");
        btn.addEventListener("click", function () {
          S.completeLesson(id);
          paintFinish(); paintStage();
          finish.querySelector("h2").focus();
        });
        finish.append(h("h2", { tabindex: "-1" }, "Finished?"),
          h("p", attempted ? "Marking the lesson complete unlocks it for daily review and highlights where it leads on the map." :
            "You haven't tried the practice questions yet. You can still mark the lesson complete, but your progress ring only moves when you answer questions."),
          btn);
      } else {
        var nexts = S.nextUp().filter(function (n) {
          return D.links(id).some(function (l) { return l.other === n; });
        });
        finish.append(h("h2", { tabindex: "-1" }, "✓ Lesson complete"),
          h("p", "These questions will now come back in daily practice, spaced out further each time you get them right."),
          nexts.length ? h("div", h("h3", "Where this leads"), h("ul.next-list", nexts.map(function (n) {
            var o = D.node(n);
            return h("li", h("a", { href: "#/topic/" + n }, U.glyph(o.subject, 11), " " + o.title),
              h("span.muted", " · " + D.subject(o.subject).short));
          }))) : null,
          h("div.actions",
            h("a.btn.primary", { href: "#/map/" + node.subject + "?node=" + id + "&done=1" }, "See its connections on the map"),
            h("a.btn", { href: "#/practice" }, "Daily Practice")));
      }
    }
    paintFinish();
    view.appendChild(finish);

    var py = lesson.topic ? pythonPanel(lesson.topic) : null;
    if (py) view.appendChild(py);

    /* feedback */
    var rated = S.get().ratings[id];
    var stars = h("div.rating", { role: "radiogroup", "aria-label": "How clear was this lesson?" });
    var thanks = h("span.muted", { "aria-live": "polite" }, rated ? "Thanks for rating." : "");
    ["Very unclear", "Unclear", "OK", "Clear", "Very clear"].forEach(function (label, i) {
      var b = h("button.chip", { type: "button", role: "radio", "aria-checked": String(rated === i + 1) }, label);
      b.addEventListener("click", function () {
        S.rateLesson(id, i + 1);
        stars.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-checked", String(x === b)); });
        thanks.textContent = "Thanks. That helps decide which lessons to rewrite first.";
      });
      stars.appendChild(b);
    });
    view.appendChild(h("section.panel.feedback",
      h("h2", "How was this lesson?"), stars, thanks,
      h("p.small", "Spotted an error, or something that could be explained better? ",
        h("a", { href: U.reportLink(lesson.title), target: "_blank", rel: "noopener" }, "Report it on GitHub ↗"))));

    view.appendChild(h("section.panel.conn-panel", Slime.map.panel(node, function (o) { location.hash = "#/topic/" + o; })));

    if (demoWrap) {
      active = window.mountDemo(lesson.demo.id, demoWrap.querySelector("canvas"),
        demoWrap.querySelector(".demo-controls"), demoWrap.querySelector(".readout"));
    }
    function onTheme() { if (active && active.redraw) active.redraw(); }
    window.addEventListener("slime:theme", onTheme);

    return {
      destroy: function () {
        window.removeEventListener("slime:theme", onTheme);
        if (active) active.destroy();
      }
    };
  };
})();
