/* Daily Practice, the question bank and the Mistake Notebook. */
(function () {
  "use strict";

  var Slime = window.Slime;
  var D = Slime.data, S = Slime.store, U = Slime.ui, h = U.h;
  var views = Slime.views = Slime.views || {};

  var TARGET_MIN = 8, MAX_MIN = 10, MAX_Q = 8;

  /* ----------------------------------------------------- session build */
  // Interleave so consecutive questions come from different topics where
  // possible: switching methods is part of what is being practiced.
  function interleave(qs) {
    var out = [], pool = qs.slice();
    while (pool.length) {
      var prev = out.length ? out[out.length - 1].node : null;
      var i = pool.findIndex(function (q) { return q.node !== prev; });
      out.push(pool.splice(i === -1 ? 0 : i, 1)[0]);
    }
    return out;
  }

  function buildSession(extra) {
    var picked = [], minutes = 0, seen = {};
    function take(q, kind) {
      if (seen[q.id] || picked.length >= MAX_Q || minutes + q.minutes > MAX_MIN) return false;
      seen[q.id] = true; picked.push({ q: q, kind: kind }); minutes += q.minutes;
      return true;
    }
    S.due().forEach(function (id) { if (minutes < TARGET_MIN) take(D.question(id), "review"); });

    // New questions from covered topics, round-robin by topic, easiest first.
    var byNode = S.covered().map(function (nid) {
      return D.questionsFor(nid).filter(function (q) { return !S.card(q.id); });
    }).filter(function (l) { return l.length; });
    var round = 0;
    while (minutes < TARGET_MIN && byNode.some(function (l) { return l[round]; })) {
      byNode.forEach(function (l) { if (l[round] && minutes < TARGET_MIN) take(l[round], "new"); });
      round++;
    }

    // "Practice anyway": pull forward the reviews due soonest.
    if (extra && minutes < TARGET_MIN) {
      Object.keys(S.get().cards).sort(function (a, b) { return S.card(a).due - S.card(b).due; })
        .forEach(function (id) { if (minutes < TARGET_MIN && D.question(id)) take(D.question(id), "early"); });
    }
    var order = interleave(picked.map(function (p) { return p.q; }));
    var kinds = {};
    picked.forEach(function (p) { kinds[p.q.id] = p.kind; });
    return { items: order.map(function (q) { return { q: q, kind: kinds[q.id] }; }), minutes: minutes };
  }

  function weekStrip() {
    var days = S.get().daily, today = new Date(), out = h("ol.week", { "aria-label": "Practice this week" });
    var monday = new Date(today); monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    var count = 0;
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach(function (name, i) {
      var d = new Date(monday); d.setDate(monday.getDate() + i);
      var rec = days[S.dayKey(d.getTime())];
      if (rec) count++;
      var future = d > today;
      out.appendChild(h("li" + (rec ? ".on" : "") + (future ? ".future" : "") +
        (S.dayKey(d.getTime()) === S.dayKey(today.getTime()) ? ".today" : ""),
        { title: rec ? rec.n + " questions" : "" },
        h("span.wk-dot", { "aria-hidden": "true" }, rec ? "✓" : ""),
        h("span.wk-day", name), h("span.sr-only", rec ? ": practiced, " + rec.n + " questions" : ": no practice")));
    });
    return h("div.week-wrap", out, h("p.muted.small",
      count ? "Practiced " + U.plural(count, "day") + " this week."
        : "You haven't practiced this week!"));
  }

  /* ---------------------------------------------------------- daily */
  function mountDaily(host, opts) {
    opts = opts || {};
    function intro(extra) {
      host.innerHTML = "";
      var s = buildSession(extra);
      var due = s.items.filter(function (i) { return i.kind === "review"; }).length;
      var fresh = s.items.filter(function (i) { return i.kind === "new"; }).length;
      var card = h("section.panel.daily-intro");
      if (!s.items.length) {
        var covered = S.covered().length;
        if (!covered) {
          card.append(h("h2", "Nothing to review yet"),
            h("p", "You haven't tried anything yet! Start with a lesson:"),
            recList(), h("a.btn", { href: "#/map/all" }, "Explore the maps"));
        } else {
          var next = S.upcoming(30).findIndex(function (n) { return n > 0; });
          card.append(h("h2", "You're all caught up"),
            h("p", next > 0 ? "Your next reviews are due " + (next === 1 ? "tomorrow" : "in " + next + " days") + "." :
              "Nothing is scheduled yet."),
            h("div.actions",
              buttonTo("Practice anyway", function () { intro(true); }),
              h("a.btn", { href: "#/questions" }, "Create a practice test")));
        }
      } else {
        card.append(
          h("h2", extra ? "Extra practice" : "Today's set"),
          h("p.daily-sum", h("b", U.plural(s.items.length, "question")), " · about ", h("b", s.minutes + " minutes")),
          h("ul.daily-mix",
            due ? h("li", U.plural(due, "review") + " due") : null,
            fresh ? h("li", fresh + " new from topics you've covered") : null,
            s.items.length - due - fresh ? h("li", (s.items.length - due - fresh) + " brought forward early") : null,
            h("li", "Mixed across " + U.plural(new Set(s.items.map(function (i) { return i.q.node; })).size, "topic"))),
          buttonTo("Start", function () { run(s.items); }, "primary big"));
      }
      host.append(card, h("section.panel", h("h2", "This week"), weekStrip()));
    }

    function run(items) {
      runSession(host, items, {
        againLabel: "Another set",
        onAgain: function () { intro(true); },
        homeHref: opts.homeHref || "#/",
        homeLabel: opts.homeLabel || "Back to today"
      });
    }
    intro(false);
  }

  views.practice = function (view) {
    document.title = "Daily Practice · SlimeIB";
    view.appendChild(h("header.page-head",
      h("h1", { tabindex: "-1" }, "Daily Practice"),
      h("p.lede", "A short set from topics you've already met.")));
    var stage = h("div.daily");
    view.appendChild(stage);
    mountDaily(stage);
    return {};
  };

  Slime.practice = { mountDaily: mountDaily };

  function kindLabel(kind) {
    return kind === "review" ? "Review" : kind === "new" ? "New" : kind === "early" ? "Early review" : "Practice";
  }

  function runSession(host, items, opts) {
    opts = opts || {};
    var i = 0, results = [];
    function show() {
      host.innerHTML = "";
      if (i >= items.length) return summary(results);
      var item = items[i];
      var bar = h("div.progress-bar", { role: "progressbar", "aria-valuemin": 0, "aria-valuemax": items.length, "aria-valuenow": i },
        h("span", { style: "width:" + (100 * i / items.length) + "%" }));
      var next = h("button.btn.primary", { type: "button", hidden: true }, i + 1 < items.length ? "Next question →" : "Finish");
      var skip = h("button.btn.ghost", { type: "button" }, "Skip");
      var quiz = Slime.quiz.render(item.q, {
        showNode: true,
        onAttempt: function (r) { results.push(r); next.hidden = false; skip.hidden = true; }
      });
      next.addEventListener("click", function () { i++; show(); });
      skip.addEventListener("click", function () { i++; show(); });
      host.append(
        h("div.session-head", h("span", "Question " + (i + 1) + " of " + items.length),
          h("span.muted", kindLabel(item.kind))),
        bar, h("section.panel", quiz), h("div.actions.session-actions", skip, next));
      quiz.focusFirst();
    }
    function summary(results) {
      var right = results.filter(function (r) { return r.correct && !r.hints; }).length;
      var helped = results.filter(function (r) { return r.correct && r.hints; }).length;
      var missed = results.length - right - helped;
      host.append(h("section.panel.daily-done",
        h("h2", { tabindex: "-1" }, results.length ? "Session complete" : "Session skipped"),
        h("ul.tally",
          h("li", h("b", String(right)), " correct unaided"),
          h("li", h("b", String(helped)), " correct with hints"),
          h("li", h("b", String(missed)), " to revisit")),
        missed ? h("p", "Missed ones are in your ", h("a", { href: "#/mistakes" }, "Mistake Notebook"), ".") :
          results.length ? h("p", "Nice work.") : null,
        h("div.actions",
          h("a.btn.primary", { href: opts.homeHref || "#/questions" }, opts.homeLabel || "Back"),
          opts.onAgain ? buttonTo(opts.againLabel || "Another set", opts.onAgain) : null)));
      host.querySelector("h2").focus();
    }
    show();
  }

  function buttonTo(label, fn, cls) {
    var b = h("button.btn" + (cls ? "." + cls.split(" ").join(".") : ""), { type: "button" }, label);
    b.addEventListener("click", fn);
    return b;
  }

  function recList() {
    return h("ul.rec-list", S.recommend(3).map(function (r) {
      return h("li.subj-" + r.node.subject,
        h("a", { href: "#/topic/" + r.node.id },
          U.glyph(r.node.subject, 11), " ",
          h("strong", r.node.title + ":"), " ",
          h("span.why", r.why)));
    }));
  }
  views.recList = recList;

  /* ---------------------------------------------------- question rows */
  function status(q) {
    var a = S.lastAttempt(q.id);
    if (!a) return { key: "new", label: "Not tried" };
    if (a.correct && !a.revealed && !a.hints) return { key: "right", label: "✓ Correct" };
    if (a.correct && !a.revealed) return { key: "helped", label: "Correct with hints" };
    return { key: "wrong", label: "✗ Missed last time" };
  }

  function questionRow(q, opts) {
    opts = opts || {};
    var n = D.node(q.node), st = status(q);
    var body = h("div.qrow-body", { hidden: true });
    var toggle = h("button.qrow-head", { type: "button", "aria-expanded": "false" },
      h("span.qrow-prompt", D.textOf(q.prompt)),
      h("span.qrow-meta",
        U.subjectPill(n.subject, n.title), U.diffDots(q.difficulty),
        h("span", Slime.quiz.SKILL_LABEL[q.skill]), h("span", "~" + q.minutes + " min"),
        h("span", q.syllabus), h("span.qstatus.qs-" + st.key, st.label)));
    toggle.addEventListener("click", function () {
      var open = body.hidden;
      body.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
      if (open && !body.firstChild) {
        var quiz = Slime.quiz.render(q, { showMeta: false, onAttempt: opts.onAttempt });
        body.appendChild(quiz);
        quiz.focusFirst();
      }
    });
    return h("li.qrow", toggle, body);
  }
  views.questionRow = questionRow;

  /* ----------------------------------------------------------- bank */
  function shuffle(arr) {
    var a = arr.slice(), i, j, t;
    for (i = a.length - 1; i > 0; i--) {
      j = Math.floor(Math.random() * (i + 1));
      t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function poolForTopics(ids) {
    var pool = [], seen = {};
    ids.forEach(function (id) {
      D.questionsFor(id).forEach(function (q) {
        if (!seen[q.id]) { seen[q.id] = true; pool.push(q); }
      });
    });
    return pool;
  }

  views.questions = function (view, params) {
    document.title = "Question Bank · SlimeIB";
    var selected = {};
    var filter = { q: "", subject: "" };
    if (params.node && D.node(params.node)) selected[params.node] = true;
    if (params.subject && D.subject(params.subject)) filter.subject = params.subject;

    view.appendChild(h("header.page-head",
      h("h1", { tabindex: "-1" }, "Question Bank"),
      h("p.lede", "Create your own practice test!")));

    var stage = h("div.bank-stage");
    view.appendChild(stage);
    showBuilder();

    function selectedIds() {
      return Object.keys(selected).filter(function (id) { return selected[id] && D.questionsFor(id).length; });
    }

    function showBuilder() {
      stage.innerHTML = "";
      var search = h("input.bank-search", {
        type: "search", placeholder: "Search topics…", value: filter.q,
        "aria-label": "Search topics"
      });
      var subjBar = h("div.bank-subj-filters", { role: "group", "aria-label": "Filter by subject" });
      function subjChip(id, label) {
        var b = h("button.bank-subj" + (id ? ".subj-" + id : "") + (filter.subject === id ? ".is-on" : ""),
          { type: "button", "aria-pressed": filter.subject === id ? "true" : "false" },
          id ? U.glyph(id, 11) : null, id ? " " + label : label);
        b.addEventListener("click", function () {
          filter.subject = filter.subject === id ? "" : id;
          paintTopics();
          paintChips();
        });
        return b;
      }
      function paintChips() {
        subjBar.innerHTML = "";
        subjBar.append(
          subjChip("", "All"),
          subjChip("math", "Math"),
          subjChip("physics", "Physics"),
          subjChip("chemistry", "Chemistry"));
      }
      paintChips();

      var topics = h("div.topic-picks");
      var emptyNote = h("p.bank-empty", { hidden: true }, "No topics match.");

      function paintTopics() {
        topics.innerHTML = "";
        var q = filter.q.trim().toLowerCase();
        var shown = 0;
        D.subjects.forEach(function (s) {
          if (filter.subject && s.id !== filter.subject) return;
          var nodes = D.nodesOf(s.id).filter(function (n) {
            if (!q) return true;
            return n.title.toLowerCase().indexOf(q) !== -1 ||
              (n.syllabus || "").toLowerCase().indexOf(q) !== -1 ||
              (n.summary || "").toLowerCase().indexOf(q) !== -1;
          });
          if (!nodes.length) return;
          shown += nodes.length;
          var group = h("fieldset.topic-group.subj-" + s.id,
            h("legend", U.glyph(s.id, 12), " " + s.short));
          nodes.forEach(function (n) {
            var nQ = D.questionsFor(n.id).length;
            var ready = nQ > 0;
            var box = h("input", {
              type: "checkbox", id: "tq-" + n.id,
              checked: selected[n.id] ? true : null,
              disabled: ready ? null : true
            });
            box.addEventListener("change", function () {
              selected[n.id] = box.checked;
              updateMeta();
            });
            group.appendChild(h("label.topic-check" + (ready ? "" : ".is-soon"),
              box, h("span", n.title),
              h("span.count-soft", ready ? String(nQ) : "soon")));
          });
          topics.appendChild(group);
        });
        emptyNote.hidden = shown > 0;
      }

      var countVal = 5;
      var countReadout = h("span.stepper-val", { id: "bank-n", "aria-live": "polite" }, String(countVal));
      var dec = h("button.stepper-btn", { type: "button", "aria-label": "Fewer questions" }, "−");
      var inc = h("button.stepper-btn", { type: "button", "aria-label": "More questions" }, "+");
      var stepper = h("div.num-stepper", countReadout, h("div.stepper-btns", inc, dec));
      var avail = h("p.bank-avail", { role: "status", "aria-live": "polite" });
      var start = h("button.btn.primary.big", { type: "button" }, "Start test");
      var err = h("p.bank-err", { role: "alert", hidden: true });

      function clampCount(max) {
        countVal = Math.max(1, Math.min(countVal, Math.max(1, max || 1)));
        countReadout.textContent = String(countVal);
      }

      function updateMeta() {
        var pool = poolForTopics(selectedIds());
        var max = pool.length;
        clampCount(max || 1);
        avail.textContent = max
          ? U.plural(max, "question") + " available across " + U.plural(selectedIds().length, "topic")
          : "Pick a topic that has questions.";
        start.disabled = !max;
        dec.disabled = countVal <= 1;
        inc.disabled = !max || countVal >= max;
        err.hidden = true;
      }

      dec.addEventListener("click", function () { countVal--; updateMeta(); });
      inc.addEventListener("click", function () { countVal++; updateMeta(); });
      search.addEventListener("input", function () {
        filter.q = search.value;
        paintTopics();
      });
      start.addEventListener("click", function () {
        var pool = poolForTopics(selectedIds());
        var n = Math.max(1, Math.min(countVal, pool.length));
        if (!pool.length) {
          err.hidden = false;
          err.textContent = "Pick a topic that has questions.";
          return;
        }
        var items = interleave(shuffle(pool).slice(0, n)).map(function (q) {
          return { q: q, kind: "bank" };
        });
        runSession(stage, items, {
          againLabel: "Build another",
          onAgain: showBuilder,
          homeHref: "#/questions",
          homeLabel: "Back to builder"
        });
      });

      stage.appendChild(h("section.panel.bank-builder",
        h("h2", "Topics"),
        h("div.bank-filters", search, subjBar),
        topics,
        emptyNote,
        h("div.bank-count",
          h("span", "Questions"),
          stepper),
        avail,
        err,
        h("div.actions", start)));
      paintTopics();
      updateMeta();
    }
    return {};
  };

  /* ------------------------------------------------------- mistakes */
  views.mistakes = function (view) {
    document.title = "Mistake Notebook · SlimeIB";
    var f = { category: "", subject: "", resolved: false };
    view.appendChild(h("header.page-head",
      h("h1", { tabindex: "-1" }, "Mistake Notebook"),
      h("p.lede", "Every question you got wrong.")));

    var summaryHost = h("div.mistake-summary");
    var catSel = h("select", { "aria-label": "Mistake type" }, h("option", { value: "" }, "All mistake types"),
      h("option", { value: "none" }, "Not labeled yet"),
      S.MISTAKE_TYPES.map(function (t) { return h("option", { value: t.key }, t.label); }));
    var subjSel = h("select", { "aria-label": "Subject" }, h("option", { value: "" }, "All Subjects"),
      D.subjects.map(function (s) { return h("option", { value: s.id }, s.short); }));
    var resolvedBox = h("input", { type: "checkbox", id: "show-resolved" });
    catSel.addEventListener("change", function () { f.category = catSel.value; paint(); });
    subjSel.addEventListener("change", function () { f.subject = subjSel.value; paint(); });
    resolvedBox.addEventListener("change", function () { f.resolved = resolvedBox.checked; paint(); });
    var list = h("div.mistakes");
    view.append(summaryHost, h("div.filter-bar", catSel, subjSel,
      h("label.check", resolvedBox, " Show resolved")), list);

    function similar(m) {
      var q = D.question(m.q);
      var pool = D.questionsFor(m.node).filter(function (x) { return x.id !== m.q; });
      pool.sort(function (a, b) {
        var sa = (a.skill === q.skill ? 0 : 2) + (S.get().mistakes[a.id] && !S.get().mistakes[a.id].resolved ? 1 : 0) + Math.abs(a.difficulty - q.difficulty);
        var sb = (b.skill === q.skill ? 0 : 2) + (S.get().mistakes[b.id] && !S.get().mistakes[b.id].resolved ? 1 : 0) + Math.abs(b.difficulty - q.difficulty);
        return sa - sb;
      });
      return pool[0] || null;
    }

    function entry(m) {
      var q = D.question(m.q), n = D.node(m.node);
      var slot = h("div.m-slot");
      var cat = h("select", { "aria-label": "What went wrong?" }, h("option", { value: "" }, "What went wrong?"),
        S.MISTAKE_TYPES.map(function (t) { return h("option", { value: t.key, selected: m.category === t.key ? true : null }, t.label); }));
      cat.addEventListener("change", function () { S.setMistake(m.q, { category: cat.value || null }); paintSummary(); });
      var note = h("textarea", { rows: 2, placeholder: "Note to self (optional), e.g. 'remember the 4s electrons go first'", "aria-label": "Note" });
      note.value = m.note || "";
      note.addEventListener("change", function () { S.setMistake(m.q, { note: note.value }); });

      var retry = buttonTo("Retry", function () {
        slot.innerHTML = "";
        var quiz = Slime.quiz.render(q, { showMeta: false, onAttempt: function () { paintSummary(); } });
        slot.appendChild(quiz); quiz.focusFirst();
      }, "primary");
      var sim = similar(m);
      var simBtn = sim ? buttonTo("Similar question", function () {
        slot.innerHTML = "";
        var quiz = Slime.quiz.render(sim, { onAttempt: function () { paintSummary(); } });
        slot.append(h("p.muted.small", "A different question on the same topic:"), quiz);
        quiz.focusFirst();
      }) : null;

      return h("article.panel.mistake" + (m.resolved ? ".is-resolved" : ""),
        h("div.m-head", U.subjectPill(n.subject, n.title), U.diffDots(q.difficulty),
          m.resolved ? h("span.badge.badge-ok", "✓ Resolved") : h("span.muted.small",
            "Missed " + U.plural(m.count, "time") + " · last " + new Date(m.t).toLocaleDateString())),
        h("div.quiz-prompt", { html: q.prompt }),
        m.given ? h("p.m-given", "Your answer: ", h("b", m.given)) : h("p.m-given", "You revealed the solution."),
        h("div.m-tools", cat, note),
        h("div.actions", retry, simBtn, D.lesson(n.id) ? h("a.btn.ghost", { href: "#/topic/" + n.id }, "Open lesson") : null),
        slot);
    }

    function paintSummary() {
      var open = S.mistakes().filter(function (m) { return !m.resolved; });
      summaryHost.innerHTML = "";
      if (!S.mistakes().length) return;
      var counts = {};
      open.forEach(function (m) { var k = m.category || "none"; counts[k] = (counts[k] || 0) + 1; });
      var max = Math.max.apply(null, [1].concat(Object.keys(counts).map(function (k) { return counts[k]; })));
      summaryHost.appendChild(h("section.panel",
        h("h2", U.plural(open.length, "open mistake")),
        open.length ? h("ul.bars", S.MISTAKE_TYPES.concat([{ key: "none", label: "Not labeled yet" }]).filter(function (t) { return counts[t.key]; })
          .map(function (t) {
            return h("li", h("span.bar-label", t.label),
              h("span.bar", h("span", { style: "width:" + (100 * counts[t.key] / max) + "%" })), h("b", String(counts[t.key])));
          })) : h("p", "Everything is resolved. 🎉")));
    }

    function paint() {
      paintSummary();
      list.innerHTML = "";
      var all = S.mistakes();
      var ms = all.filter(function (m) {
        if (!f.resolved && m.resolved) return false;
        if (f.subject && D.node(m.node).subject !== f.subject) return false;
        if (f.category === "none" && m.category) return false;
        if (f.category && f.category !== "none" && m.category !== f.category) return false;
        return true;
      });
      if (!all.length) {
        list.appendChild(h("section.panel.empty-state", h("h2", "No mistakes yet"),
          h("p", "Wow. Real impressive."),
          h("a.btn", { href: "#/practice" }, "Go to Daily Practice")));
        return;
      }
      if (!ms.length) list.appendChild(h("p.empty", "Nothing matches these filters."));
      ms.forEach(function (m) { list.appendChild(entry(m)); });
    }
    paint();
    return {};
  };
})();
