/* One assessed question: answer, progressive hints, worked solution,
   misconception feedback and mistake capture. Used by lessons, daily
   practice, the question bank and the Mistake Notebook alike, so a question
   behaves the same wherever it appears. */
(function () {
  "use strict";

  var Slime = window.Slime;
  var h = Slime.ui.h, D = Slime.data, S = Slime.store;
  var uid = 0;

  var SKILL_LABEL = {
    concept: "Concept", calculation: "Calculation",
    interpretation: "Interpretation", "multi-step": "Multi-step"
  };

  /* ----------------------------------------------------- numeric input */
  // Accepts what students actually type: 1.5e3, 1.5×10^3, 1.5 x 10^3, 3/4,
  // a Unicode minus, thousands commas, and a unit tacked on the end.
  function parseNumber(raw) {
    var s = String(raw || "").trim()
      .replace(/[−–]/g, "-").replace(/,/g, "").replace(/\s+/g, "")
      .replace(/(?:×|x|\*)10\^?\(?([-+]?\d+)\)?/i, "e$1");
    var m = s.match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)(?:\/([-+]?(?:\d+\.?\d*|\.\d+)))?/i);
    if (!m) return NaN;
    var v = parseFloat(m[1]);
    if (m[2] !== undefined) v = v / parseFloat(m[2]);
    return v;
  }

  function within(x, a) {
    if (a.abs !== undefined) return Math.abs(x - a.value) <= a.abs + 1e-12;
    if (!a.tol) return Math.abs(x - a.value) < 1e-9;
    return Math.abs(x - a.value) <= Math.abs(a.value) * a.tol + 1e-12;
  }

  // Short-answer matching: case-insensitive, unicode punctuation folded,
  // whitespace collapsed. Accepts the canonical text plus any accept[] aliases.
  function normalizeShort(raw) {
    return String(raw || "")
      .normalize("NFKC")
      .replace(/[−–—]/g, "-")
      .replace(/[×⋅·]/g, "x")
      .replace(/[‘’‛′]/g, "'")
      .replace(/[“”„″]/g, "\"")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function shortMatch(given, a) {
    var g = normalizeShort(given);
    if (!g) return false;
    var opts = [a.text].concat(a.accept || []);
    for (var i = 0; i < opts.length; i++) {
      if (normalizeShort(opts[i]) === g) return true;
    }
    return false;
  }

  // A wrong number usually has a recognizable shape. Saying which one is far
  // more useful than "incorrect".
  function numericNudge(x, a) {
    var v = a.value;
    if (v !== 0 && within(-x, a)) return "Right size, wrong sign. Check the direction or the order of subtraction.";
    if (v !== 0 && x !== 0) {
      var r = x / v, k = Math.round(Math.log(Math.abs(r)) / Math.LN10);
      if (k !== 0 && Math.abs(Math.abs(r) / Math.pow(10, k) - 1) < 0.03)
        return "Off by a factor of 10" + (Math.abs(k) > 1 ? "^" + Math.abs(k) : "") +
          ". Check powers of ten and unit conversions (cm/m, kJ/J, minutes/seconds).";
      if (Math.abs(r - 2) < 0.03 || Math.abs(r - 0.5) < 0.03)
        return "Out by a factor of 2. Check for a missing ½ or a doubled term.";
      if (Math.abs(r - 1) < 0.1) return "Close. Check your rounding, or carry more significant figures through the working.";
    }
    return "Not quite. Try a hint, or compare your working with the solution.";
  }

  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ------------------------------------------------------------ meta */
  function meta(q, showNode) {
    var n = D.node(q.node);
    return h("div.quiz-meta",
      showNode ? h("a.quiz-node", { href: "#/topic/" + n.id }, Slime.ui.subjectPill(n.subject), " " + n.title) : null,
      Slime.ui.diffDots(q.difficulty),
      h("span", SKILL_LABEL[q.skill] || q.skill),
      h("span", "~" + q.minutes + " min"),
      h("span", q.syllabus)
    );
  }

  /* ---------------------------------------------------------- render */
  // opts.onAttempt(result) fires once, on the first answer that counts.
  function render(q, opts) {
    opts = opts || {};
    var id = "q" + (++uid);
    var started = Date.now();
    var hintsUsed = 0, recorded = false, solved = false, revealed = false;

    var root = h("article.quiz", { "aria-labelledby": id + "-p", "data-q": q.id });
    if (opts.showMeta !== false) root.appendChild(meta(q, opts.showNode));
    root.appendChild(h("div.quiz-prompt", { id: id + "-p", html: q.prompt }));

    var form = h("form.quiz-form", { novalidate: true });
    var input = null, radios = [];
    if (q.format === "mcq") {
      var fs = h("fieldset.choices", h("legend.sr-only", "Choose one answer"));
      shuffle(q.choices).forEach(function (c, i) {
        var r = h("input", { type: "radio", name: id, value: String(q.choices.indexOf(c)), id: id + "-c" + i });
        radios.push(r);
        fs.appendChild(h("label.choice", { for: id + "-c" + i }, r, h("span", { html: c.text })));
      });
      form.appendChild(fs);
    } else if (q.format === "short") {
      input = h("input.num-input", {
        type: "text", autocomplete: "off", id: id + "-in",
        "aria-describedby": id + "-fmt"
      });
      form.appendChild(h("div.num-row",
        h("label", { for: id + "-in" }, "Your answer"),
        input
      ));
      form.appendChild(h("p.num-help", { id: id + "-fmt" },
        "Type the short answer exactly (spelling and units matter; case does not)."));
    } else {
      input = h("input.num-input", {
        type: "text", inputmode: "decimal", autocomplete: "off", id: id + "-in",
        "aria-describedby": id + "-fmt"
      });
      form.appendChild(h("div.num-row",
        h("label", { for: id + "-in" }, "Your answer"),
        input,
        q.answer && q.answer.units ? h("span.num-units", q.answer.units) : null
      ));
      form.appendChild(h("p.num-help", { id: id + "-fmt" }, "Decimals, fractions (3/4) and powers of ten (2.1e-3 or 2.1×10^-3) all work."));
    }

    var checkBtn = h("button.btn.primary", { type: "submit" }, "Check");
    var hintBtn = h("button.btn", { type: "button" });
    var solBtn = h("button.btn.ghost", { type: "button" }, "Show worked solution");
    form.appendChild(h("div.quiz-actions", checkBtn, hintBtn, solBtn));
    root.appendChild(form);

    var hintList = h("ol.quiz-hints", { "aria-live": "polite" });
    var feedback = h("div.quiz-feedback", { role: "status", "aria-live": "polite" });
    var mistakeBox = h("div.quiz-mistake", { hidden: true });
    var solution = h("div.quiz-solution", { hidden: true, tabindex: "-1" });
    root.append(hintList, feedback, mistakeBox, solution);

    function paintHintBtn() {
      var left = q.hints.length - hintsUsed;
      hintBtn.textContent = left ? "Hint " + (hintsUsed + 1) + " of " + q.hints.length : "No more hints";
      hintBtn.disabled = !left || solved;
    }
    paintHintBtn();

    hintBtn.addEventListener("click", function () {
      if (hintsUsed >= q.hints.length) return;
      hintList.appendChild(h("li", { html: q.hints[hintsUsed] }));
      hintsUsed++;
      paintHintBtn();
    });

    function given() {
      if (input) return input.value.trim();
      var r = radios.filter(function (x) { return x.checked; })[0];
      return r ? Number(r.value) : null;
    }

    function givenText(g) {
      return q.format === "mcq" ? D.textOf(q.choices[g].text) : g;
    }

    function record(correct, g) {
      if (recorded) return null;
      recorded = true;
      var res = S.recordAttempt({
        q: q.id, correct: correct, hints: hintsUsed, revealed: revealed,
        ms: Date.now() - started, given: g === null || g === undefined ? "" : givenText(g)
      });
      var out = { q: q, correct: correct && !revealed, hints: hintsUsed, revealed: revealed, card: res.card };
      if (opts.onAttempt) opts.onAttempt(out);
      return res;
    }

    function lock() {
      radios.forEach(function (r) { r.disabled = true; });
      if (input) input.readOnly = true;
      checkBtn.disabled = true;
      paintHintBtn();
    }

    function showSolution() {
      solution.innerHTML = "";
      solution.appendChild(h("h4", "Worked solution"));
      solution.appendChild(h("ol.steps", q.solution.map(function (s) { return h("li", { html: s }); })));
      if (q.format === "numeric") {
        solution.appendChild(h("p.sol-answer", "Answer: ",
          h("b", String(q.answer.value).replace("-", "−") + (q.answer.units ? " " + q.answer.units : ""))));
      }
      if (q.format === "short") {
        solution.appendChild(h("p.sol-answer", "Answer: ", h("b", { html: q.answer.text })));
      }
      if (q.misconceptions && q.misconceptions.length) {
        solution.appendChild(h("h4", "Common misconceptions"));
        solution.appendChild(h("ul", q.misconceptions.map(function (s) { return h("li", { html: s }); })));
      }
      solution.hidden = false;
      solBtn.hidden = true;
    }

    function askCategory() {
      var m = S.get().mistakes[q.id];
      if (!m) return;
      mistakeBox.innerHTML = "";
      mistakeBox.hidden = false;
      var row = h("div.chips", { role: "group", "aria-label": "What went wrong?" });
      S.MISTAKE_TYPES.forEach(function (t) {
        var b = h("button.chip", { type: "button", "aria-pressed": String(m.category === t.key) }, t.label);
        b.addEventListener("click", function () {
          S.setMistake(q.id, { category: t.key });
          row.querySelectorAll(".chip").forEach(function (c) { c.setAttribute("aria-pressed", String(c === b)); });
        });
        row.appendChild(b);
      });
      mistakeBox.append(
        h("p", h("b", "Saved to your "), h("a", { href: "#/mistakes" }, "Mistake Notebook"), h("b", ".")),
        row
      );
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (solved) return;
      var g = given();
      if (g === null || g === "") {
        feedback.className = "quiz-feedback is-info";
        feedback.textContent = q.format === "mcq" ? "Choose an answer first." : "Type an answer first.";
        return;
      }

      var correct, why = "";
      if (q.format === "mcq") {
        var choice = q.choices[g];
        correct = !!choice.correct;
        why = choice.why || "";
        root.querySelectorAll(".choice").forEach(function (l) { l.classList.remove("is-wrong"); });
        if (!correct) radios.filter(function (r) { return r.checked; })[0].parentNode.classList.add("is-wrong");
      } else if (q.format === "short") {
        correct = shortMatch(g, q.answer);
        if (!correct) why = "Check spelling, notation and units, then try again.";
      } else {
        var x = parseNumber(g);
        if (isNaN(x)) {
          feedback.className = "quiz-feedback is-info";
          feedback.textContent = "That doesn't look like a number. Try something like 0.25, 1/4 or 2.5e-1.";
          return;
        }
        correct = within(x, q.answer);
        if (!correct) why = numericNudge(x, q.answer);
      }

      var firstTime = !recorded;
      var res = record(correct, g);

      if (correct) {
        solved = true;
        lock();
        if (q.format === "mcq") radios.filter(function (r) { return r.checked; })[0].parentNode.classList.add("is-right");
        feedback.className = "quiz-feedback is-right";
        feedback.innerHTML = "";
        var note = revealed ? " You had seen the solution, so this one will come back for review soon." :
          !firstTime ? " Got there. It will come back for review, since the first try missed." :
          hintsUsed ? " With " + Slime.ui.plural(hintsUsed, "hint") + ". Next time, try it unaided." :
          " Unaided, too.";
        feedback.append(h("b", "✓ Correct."), note);
        if (res && res.card && !revealed) {
          feedback.append(" ", h("span.muted", "Next review " + Slime.ui.relTime(res.card.due) + "."));
        }
        mistakeBox.hidden = !(S.get().mistakes[q.id] && !S.get().mistakes[q.id].resolved);
      } else {
        feedback.className = "quiz-feedback is-wrong";
        feedback.innerHTML = "";
        feedback.append(h("b", "✗ Not quite. "), h("span", { html: why }), " ",
          h("span.muted", "Change your answer and check again, or take a hint."));
        if (firstTime) askCategory();
      }
    });

    solBtn.addEventListener("click", function () {
      if (!recorded) {
        revealed = true;
        record(false, null);
        askCategory();
      }
      showSolution();
      solution.focus();
    });

    root.focusFirst = function () {
      var el = input || radios[0];
      if (el) el.focus();
    };
    return root;
  }

  Slime.quiz = {
    render: render, parseNumber: parseNumber, normalizeShort: normalizeShort,
    shortMatch: shortMatch, SKILL_LABEL: SKILL_LABEL
  };
})();
