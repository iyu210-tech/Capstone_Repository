/* Indexes over the generated content.js: lookups, neighbours, search.
   Read-only. Anything about the learner lives in store.js. */
(function () {
  "use strict";

  var C = window.CONTENT || { subjects: [], nodes: [], edges: [], lessons: {}, questions: [] };
  var Slime = window.Slime = window.Slime || {};

  var byId = {}, subjects = {}, clusters = {}, qById = {}, qByNode = {}, links = {};

  C.subjects.forEach(function (s) {
    subjects[s.id] = s;
    s.clusters.forEach(function (c) { clusters[s.id + "/" + c.id] = c; });
  });
  C.nodes.forEach(function (n) { byId[n.id] = n; links[n.id] = []; qByNode[n.id] = []; });
  C.questions.forEach(function (q) { qById[q.id] = q; qByNode[q.node].push(q); });
  Object.keys(qByNode).forEach(function (k) {
    qByNode[k].sort(function (a, b) { return a.difficulty - b.difficulty; });
  });

  // Each edge is stored once per end, tagged with the direction it is seen from,
  // so "builds on" and "leads to" fall out of a single list.
  C.edges.forEach(function (e) {
    var cross = byId[e.from].subject !== byId[e.to].subject;
    links[e.from].push({ other: e.to, type: e.type, dir: "out", cross: cross, note: e.note || "" });
    links[e.to].push({ other: e.from, type: e.type, dir: "in", cross: cross, note: e.note || "" });
  });

  var RELATION = {
    "prerequisite:in": "Builds on",
    "prerequisite:out": "Leads to",
    "application:in": "Uses ideas from",
    "application:out": "Applied in",
    "similarity:in": "Similar to",
    "similarity:out": "Similar to"
  };

  function relation(link) { return RELATION[link.type + ":" + link.dir]; }

  /* ------------------------------------------------------------ search */
  var STOP = ("a an the is are do does did why how what when which of for to in on and or my i it " +
    "its this that with you your be can about at as by from if not so up more than").split(" ");

  function words(q) {
    return q.toLowerCase().replace(/[^a-z0-9.\u00c0-\u024f ]/g, " ").split(/\s+/)
      .filter(function (w) { return w && STOP.indexOf(w) === -1; });
  }

  function textOf(html) { return String(html || "").replace(/<[^>]+>/g, ""); }

  // Rank by how many meaningful words hit rather than demanding all of them,
  // so a typed-out question still finds the right topic.
  function score(hay, ws) {
    if (!ws.length) return 1;
    var hits = 0;
    ws.forEach(function (w) {
      var stem = w.replace(/(ing|ed|es|s)$/, "");
      if (hay.indexOf(w) !== -1 || (stem.length > 3 && hay.indexOf(stem) !== -1)) hits++;
    });
    return hits;
  }

  var nodeHay = {}, qHay = {};
  C.nodes.forEach(function (n) {
    var l = C.lessons[n.id];
    nodeHay[n.id] = [n.title, n.summary, n.syllabus, n.tags.join(" "), subjects[n.subject].name,
      clusters[n.subject + "/" + n.cluster].name, l ? l.title + " " + l.objectives.join(" ") : ""]
      .join(" ").toLowerCase();
  });
  C.questions.forEach(function (q) {
    var n = byId[q.node];
    qHay[q.id] = [textOf(q.prompt), q.syllabus, q.skill, n.title, n.tags.join(" ")].join(" ").toLowerCase();
  });

  /* filters: { q, subject, cluster, difficulty, syllabus, spec }; any may be empty */
  function nodeMatches(n, f) {
    if (f.subject && n.subject !== f.subject) return false;
    if (f.cluster && n.cluster !== f.cluster) return false;
    if (f.difficulty && n.difficulty !== Number(f.difficulty)) return false;
    if (f.spec && (n.spec || "current") !== f.spec) return false;
    if (f.syllabus && n.syllabus.toLowerCase().indexOf(f.syllabus.toLowerCase()) === -1) return false;
    return true;
  }

  function searchNodes(f) {
    var ws = words(f.q || "");
    return C.nodes.filter(function (n) { return nodeMatches(n, f); })
      .map(function (n) { return { node: n, score: score(nodeHay[n.id], ws) }; })
      .filter(function (r) { return r.score > 0; })
      .sort(function (a, b) { return b.score - a.score; })
      .map(function (r) { return r.node; });
  }

  function searchQuestions(f) {
    var ws = words(f.q || "");
    return C.questions.filter(function (q) {
      var n = byId[q.node];
      if (!nodeMatches(n, { subject: f.subject, cluster: f.cluster, spec: f.spec })) return false;
      if (f.node && q.node !== f.node) return false;
      if (f.difficulty && q.difficulty !== Number(f.difficulty)) return false;
      if (f.skill && q.skill !== f.skill) return false;
      if (f.maxMinutes && q.minutes > Number(f.maxMinutes)) return false;
      if (f.syllabus && q.syllabus.toLowerCase().indexOf(f.syllabus.toLowerCase()) === -1) return false;
      return true;
    }).map(function (q) { return { q: q, score: score(qHay[q.id], ws) }; })
      .filter(function (r) { return r.score > 0; })
      .sort(function (a, b) { return b.score - a.score || a.q.difficulty - b.q.difficulty; })
      .map(function (r) { return r.q; });
  }

  Slime.data = {
    raw: C,
    subjects: C.subjects,
    subject: function (id) { return subjects[id]; },
    cluster: function (subject, id) { return clusters[subject + "/" + id]; },
    nodes: C.nodes,
    node: function (id) { return byId[id]; },
    nodesOf: function (subject) { return C.nodes.filter(function (n) { return n.subject === subject; }); },
    lesson: function (id) { return C.lessons[id] || null; },
    lessonIds: Object.keys(C.lessons),
    questions: C.questions,
    question: function (id) { return qById[id]; },
    questionsFor: function (nodeId) { return qByNode[nodeId] || []; },
    links: function (id) { return links[id] || []; },
    relation: relation,
    edges: C.edges,
    searchNodes: searchNodes,
    searchQuestions: searchQuestions,
    textOf: textOf,
    SKILLS: ["concept", "calculation", "interpretation", "multi-step"],
    DIFFICULTY: ["", "Foundation", "Standard", "Demanding", "Hardest"]
  };
})();
