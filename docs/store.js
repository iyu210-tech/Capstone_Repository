/* Everything the site remembers about a learner, kept in localStorage.

   Two kinds of progress are tracked deliberately apart:
     - demonstrated progress (the stage) is derived from attempts, never set
       by hand, so it cannot drift from what the student can actually do;
     - confidence is self-reported and stored as-is, so the two can be
       compared. Feeling confident and being right are different things. */
(function () {
  "use strict";

  var Slime = window.Slime = window.Slime || {};
  var D = Slime.data;
  var KEY = "slimeib:v1";
  var DAY = 86400000;
  var MAX_ATTEMPTS = 3000;

  var STAGES = [
    { key: "none", label: "Not started", blurb: "Nothing yet." },
    { key: "explored", label: "Explored", blurb: "You have opened the lesson or tried the topic." },
    { key: "practicing", label: "Practicing", blurb: "You have attempted questions on it." },
    { key: "independent", label: "Independent", blurb: "You answer several different questions correctly without hints." },
    { key: "retained", label: "Retained", blurb: "You still answer correctly, unaided, a week or more later." }
  ];

  var MISTAKE_TYPES = [
    { key: "understand", label: "Didn't understand" },
    { key: "misread", label: "Misread question" },
    { key: "careless", label: "Careless error" }
  ];

  function blank() {
    return {
      version: 1,
      nodes: {},      // id -> { visited, lessonDone, confidence, confidenceAt }
      attempts: [],   // { q, node, t, correct, hints, revealed, ms, given }
      cards: {},      // question id -> spaced-repetition card
      mistakes: {},   // question id -> notebook entry
      daily: {},      // YYYY-MM-DD -> { n, correct }
      ratings: {},    // lesson id -> clarity 1..5
      settings: {},
      lastCompleted: null
    };
  }

  var state = read();

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return blank();
      var s = JSON.parse(raw);
      var b = blank();
      Object.keys(b).forEach(function (k) { if (s[k] === undefined) s[k] = b[k]; });
      return s;
    } catch (e) {
      return blank();
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode: keep in memory */ }
    window.dispatchEvent(new CustomEvent("slime:progress"));
  }

  function nodeRec(id) {
    if (!state.nodes[id]) state.nodes[id] = {};
    return state.nodes[id];
  }

  function dayKey(t) {
    var d = new Date(t);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }
  function startOfDay(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }

  // Consecutive calendar days with any practice logged in state.daily.
  function streak() {
    var keys = Object.keys(state.daily).sort();
    var best = 0, run = 0, prev = null;
    keys.forEach(function (k) {
      var t = startOfDay(new Date(k + "T12:00:00").getTime());
      if (prev !== null && t - prev === DAY) run++;
      else run = 1;
      if (run > best) best = run;
      prev = t;
    });
    var today = dayKey(Date.now());
    var yday = dayKey(Date.now() - DAY);
    var tip = state.daily[today] ? today : state.daily[yday] ? yday : null;
    var current = 0;
    if (tip) {
      var t = startOfDay(new Date(tip + "T12:00:00").getTime());
      while (state.daily[dayKey(t)]) { current++; t -= DAY; }
    }
    return { current: current, best: best, days: keys.length };
  }

  /* ---------------------------------------------------------- spaced review */
  // SM-2, lightly simplified. Quality comes from how the answer was reached,
  // not from a self-rating: a correct answer after hints is not the same
  // evidence as an unaided one, and a revealed solution is no evidence at all.
  function quality(a, q) {
    if (a.revealed) return 1;
    if (!a.correct) return 2;
    if (a.hints > 0) return 3;
    var quick = q && a.ms && a.ms < q.minutes * 60000 * 0.6;
    return quick ? 5 : 4;
  }

  function schedule(card, qual, now) {
    card = card || { reps: 0, ease: 2.5, interval: 0, lapses: 0 };
    if (qual < 3) {
      card.reps = 0;
      card.lapses++;
      card.interval = 1;
    } else {
      card.reps++;
      card.interval = card.reps === 1 ? 1 : card.reps === 2 ? 3 : Math.round(card.interval * card.ease);
    }
    card.ease = Math.max(1.3, card.ease + (0.1 - (5 - qual) * (0.08 + (5 - qual) * 0.02)));
    card.last = now;
    // Due at the start of the day, so "due today" means the calendar day.
    card.due = startOfDay(now) + card.interval * DAY;
    return card;
  }

  /* -------------------------------------------------------------- attempts */
  function recordAttempt(a) {
    var now = Date.now();
    var q = D.question(a.q);
    var rec = {
      q: a.q, node: q.node, t: now, correct: !!a.correct, hints: a.hints || 0,
      revealed: !!a.revealed, ms: a.ms || 0, given: a.given == null ? "" : String(a.given)
    };
    state.attempts.push(rec);
    if (state.attempts.length > MAX_ATTEMPTS) state.attempts.splice(0, state.attempts.length - MAX_ATTEMPTS);

    state.cards[a.q] = schedule(state.cards[a.q], quality(rec, q), now);
    nodeRec(q.node).visited = nodeRec(q.node).visited || now;

    var day = state.daily[dayKey(now)] || (state.daily[dayKey(now)] = { n: 0, correct: 0 });
    day.n++;
    if (rec.correct && !rec.revealed) day.correct++;

    var m = state.mistakes[a.q];
    var newMistake = false;
    if (!rec.correct || rec.revealed) {
      if (!m || m.resolved) {
        state.mistakes[a.q] = {
          q: a.q, node: q.node, t: now, given: rec.given, category: m ? m.category : null,
          note: m ? m.note : "", resolved: null, count: (m ? m.count : 0) + 1
        };
        newMistake = true;
      } else {
        m.count++; m.given = rec.given; m.t = now;
      }
    } else if (m && !m.resolved && rec.hints === 0) {
      m.resolved = now;
    }

    save();
    return { card: state.cards[a.q], newMistake: newMistake, mistake: state.mistakes[a.q] || null };
  }

  function attemptsFor(nodeId) {
    return state.attempts.filter(function (a) { return a.node === nodeId; });
  }

  function unaided(a) { return a.correct && !a.revealed && a.hints === 0; }

  /* ----------------------------------------------------------------- stage */
  function stage(nodeId) {
    var rec = state.nodes[nodeId] || {};
    var at = attemptsFor(nodeId);
    var i = 0;
    if (rec.visited || rec.lessonDone || at.length) i = 1;
    if (at.length) i = 2;

    if (at.length) {
      var available = D.questionsFor(nodeId).length;
      var need = Math.max(1, Math.min(3, available));
      var distinct = {};
      at.forEach(function (a) { if (unaided(a)) distinct[a.q] = true; });
      var recent = at.slice(-5);
      var rate = recent.filter(unaided).length / recent.length;
      if (Object.keys(distinct).length >= need && rate >= 0.6) i = 3;

      if (i === 3) {
        var first = null;
        at.forEach(function (a) { if (unaided(a) && first === null) first = a.t; });
        var later = at.some(function (a) { return unaided(a) && a.t - first >= 7 * DAY; });
        if (later && unaided(at[at.length - 1])) i = 4;
      }
    }
    var s = STAGES[i];
    return { index: i, key: s.key, label: s.label, blurb: s.blurb };
  }

  function nodeStats(nodeId) {
    var at = attemptsFor(nodeId);
    var right = at.filter(function (a) { return a.correct && !a.revealed; }).length;
    return {
      attempts: at.length,
      correct: right,
      unaided: at.filter(unaided).length,
      accuracy: at.length ? right / at.length : null
    };
  }

  /* --------------------------------------------------------------- reviews */
  function due(now) {
    now = now || Date.now();
    return Object.keys(state.cards)
      .filter(function (id) { return D.question(id) && state.cards[id].due <= now; })
      .sort(function (a, b) { return state.cards[a].due - state.cards[b].due; });
  }

  function upcoming(days) {
    var out = [], today = startOfDay(Date.now());
    for (var i = 0; i < days; i++) out.push(0);
    Object.keys(state.cards).forEach(function (id) {
      var d = Math.floor((state.cards[id].due - today) / DAY);
      if (d < 0) d = 0;
      if (d < days) out[d]++;
    });
    return out;
  }

  /* A topic counts as covered once the lesson is finished or questions on it
     have been tried: daily practice should only draw on things already met. */
  function covered() {
    return D.nodes.filter(function (n) {
      var r = state.nodes[n.id];
      return (r && r.lessonDone) || attemptsFor(n.id).length;
    }).map(function (n) { return n.id; });
  }

  /* ------------------------------------------------------- recommendations */
  // The neighbours of finished lessons that have not been started yet -
  // what the map highlights after a lesson, and what home suggests next.
  function nextUp() {
    var done = {}, out = {};
    D.nodes.forEach(function (n) { if ((state.nodes[n.id] || {}).lessonDone) done[n.id] = true; });
    Object.keys(done).forEach(function (id) {
      D.links(id).forEach(function (l) {
        var forward = l.dir === "out" || l.type === "similarity";
        if (forward && !done[l.other] && stage(l.other).index === 0) out[l.other] = true;
      });
    });
    return Object.keys(out);
  }

  function recommend(limit) {
    var nexts = {};
    nextUp().forEach(function (id) { nexts[id] = true; });
    return D.lessonIds.map(function (id) {
      var n = D.node(id), rec = state.nodes[id] || {}, st = stage(id);
      if (rec.lessonDone) return null;
      var s = 0, why = "";
      if (nexts[id]) { s += 4; why = "Connected to a lesson you finished"; }
      var prereqs = D.links(id).filter(function (l) { return l.type === "prerequisite" && l.dir === "in"; });
      var met = prereqs.filter(function (l) { return stage(l.other).index >= 2 || (state.nodes[l.other] || {}).lessonDone; });
      if (prereqs.length && met.length === prereqs.length) { s += 2; why = why || "You have the prerequisites"; }
      if (st.index > 0) { s += 3; why = why || "You have already started this"; }
      s += (4 - n.difficulty) * 0.5;
      return { node: n, score: s, why: why || (n.difficulty === 1 ? "A good starting point" : "Next in the syllabus") };
    }).filter(Boolean).sort(function (a, b) { return b.score - a.score; }).slice(0, limit || 3);
  }

  /* ---------------------------------------------------------------- public */
  Slime.store = {
    STAGES: STAGES,
    MISTAKE_TYPES: MISTAKE_TYPES,
    DAY: DAY,
    dayKey: dayKey,
    streak: streak,
    get: function () { return state; },
    node: function (id) { return state.nodes[id] || {}; },
    visit: function (id) {
      var r = nodeRec(id);
      if (!r.visited) { r.visited = Date.now(); save(); }
    },
    completeLesson: function (id) {
      var r = nodeRec(id);
      r.lessonDone = r.lessonDone || Date.now();
      r.visited = r.visited || r.lessonDone;
      state.lastCompleted = { node: id, t: Date.now() };
      save();
    },
    setConfidence: function (id, v) {
      var r = nodeRec(id);
      r.confidence = v; r.confidenceAt = Date.now();
      save();
    },
    rateLesson: function (id, v) { state.ratings[id] = v; save(); },
    recordAttempt: recordAttempt,
    attemptsFor: attemptsFor,
    stage: stage,
    nodeStats: nodeStats,
    card: function (qid) { return state.cards[qid] || null; },
    due: due,
    upcoming: upcoming,
    covered: covered,
    nextUp: nextUp,
    recommend: recommend,
    lastAttempt: function (qid) {
      for (var i = state.attempts.length - 1; i >= 0; i--) if (state.attempts[i].q === qid) return state.attempts[i];
      return null;
    },
    mistakes: function () {
      return Object.keys(state.mistakes).map(function (k) { return state.mistakes[k]; })
        .filter(function (m) { return D.question(m.q); })
        .sort(function (a, b) { return b.t - a.t; });
    },
    setMistake: function (qid, patch) {
      var m = state.mistakes[qid];
      if (!m) return;
      Object.keys(patch).forEach(function (k) { m[k] = patch[k]; });
      save();
    },
    setting: function (k, v) {
      if (arguments.length === 1) return state.settings[k];
      state.settings[k] = v; save();
    },
    exportJSON: function () { return JSON.stringify(state, null, 1); },
    importJSON: function (text) {
      var s = JSON.parse(text);
      if (!s || s.version !== 1 || !Array.isArray(s.attempts)) throw new Error("That file is not a SlimeIB progress export.");
      var b = blank();
      Object.keys(b).forEach(function (k) { if (s[k] === undefined) s[k] = b[k]; });
      state = s; save();
    },
    reset: function () {
      var keep = state.settings;
      state = blank(); state.settings = keep; save();
    }
  };
})();
