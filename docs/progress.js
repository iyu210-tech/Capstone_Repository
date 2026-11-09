/* Progress: "I get this now" / "Still stuck" marks and saved demo setups.
 *
 * This is the job the account was always meant to have ("an account just
 * remembers you between visits" - until now it remembered nothing). It works
 * signed out too: everything is kept in localStorage first, and signing in
 * merges that into Supabase so it follows the student to another device.
 * Nothing is ever gated on it.
 *
 * Tables and RLS policies: supabase/migrations/. If they are not there yet,
 * the remote half fails quietly and the local half carries on.
 */
(function () {
  "use strict";

  var view = document.getElementById("view");
  if (!view) return;

  var MARKS_KEY = "progress-marks";     // { topicId: { status, at } }
  var SETUPS_KEY = "saved-setups";      // { topicId: [{ name, params, at }] }
  var MAX_SETUPS = 12;                  // per topic - a list, not an archive

  function load(key) {
    try { return JSON.parse(localStorage.getItem(key) || "{}") || {}; } catch (e) { return {}; }
  }
  function store(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }

  var marks = load(MARKS_KEY);
  var setups = load(SETUPS_KEY);

  function topics() { return window.TOPICS || []; }
  function topicId() { return window.demoSetup ? window.demoSetup.topicId() : ""; }

  /* ------------------------------------------------------------ remote */
  var sb = null, user = null;

  function remote() { return sb && user ? sb : null; }

  // Every remote write is fire-and-forget: a missing table or a dropped
  // connection must never undo what the student just clicked.
  function quietly(promise) {
    if (promise && promise.then) {
      promise.then(function (res) {
        if (res && res.error) console.warn("progress sync:", res.error.message);
      }, function (err) { console.warn("progress sync:", err && err.message); });
    }
  }

  function pushMark(id) {
    var c = remote();
    if (!c) return;
    var m = marks[id];
    if (!m) {
      quietly(c.from("topic_progress").delete().eq("topic_id", id));
    } else {
      quietly(c.from("topic_progress").upsert(
        { topic_id: id, status: m.status, updated_at: new Date(m.at).toISOString() },
        { onConflict: "user_id,topic_id" }));
    }
  }

  function pushSetup(id, s) {
    var c = remote();
    if (c) {
      quietly(c.from("saved_setups").upsert(
        { topic_id: id, name: s.name, params: s.params, created_at: new Date(s.at).toISOString() },
        { onConflict: "user_id,topic_id,name" }));
    }
  }

  function dropSetup(id, name) {
    var c = remote();
    if (c) quietly(c.from("saved_setups").delete().eq("topic_id", id).eq("name", name));
  }

  // On sign-in: newest mark wins per topic, setups are unioned by name.
  // Anything the browser had that the account did not is pushed up, so work
  // done signed out on this device is not lost by signing in.
  function merge() {
    var c = remote();
    if (!c) return;
    Promise.all([
      c.from("topic_progress").select("topic_id,status,updated_at"),
      c.from("saved_setups").select("topic_id,name,params,created_at")
    ]).then(function (res) {
      if (res[0].error || res[1].error) {
        console.warn("progress sync unavailable:", (res[0].error || res[1].error).message);
        return;
      }
      var seen = {};
      res[0].data.forEach(function (row) {
        var at = Date.parse(row.updated_at);
        seen[row.topic_id] = true;
        if (!marks[row.topic_id] || marks[row.topic_id].at < at) {
          marks[row.topic_id] = { status: row.status, at: at };
        } else if (marks[row.topic_id].at > at) {
          pushMark(row.topic_id);
        }
      });
      Object.keys(marks).forEach(function (id) { if (!seen[id]) pushMark(id); });

      var remoteNames = {};
      res[1].data.forEach(function (row) {
        var list = setups[row.topic_id] = setups[row.topic_id] || [];
        remoteNames[row.topic_id + "\u0000" + row.name] = true;
        if (!list.some(function (s) { return s.name === row.name; })) {
          list.push({ name: row.name, params: row.params, at: Date.parse(row.created_at) });
        }
      });
      Object.keys(setups).forEach(function (id) {
        setups[id].forEach(function (s) {
          if (!remoteNames[id + "\u0000" + s.name]) pushSetup(id, s);
        });
      });

      store(MARKS_KEY, marks);
      store(SETUPS_KEY, setups);
      render();
    }, function (err) { console.warn("progress sync:", err && err.message); });
  }

  document.addEventListener("auth:change", function (e) {
    var was = user && user.id;
    sb = e.detail.client;
    user = e.detail.user;
    if (user && user.id !== was) merge();
  });

  /* -------------------------------------------------------------- marks */
  var LABELS = { understood: "I get this now", stuck: "Still stuck" };

  function setMark(id, status) {
    if (marks[id] && marks[id].status === status) delete marks[id];   // click again to clear
    else marks[id] = { status: status, at: Date.now() };
    store(MARKS_KEY, marks);
    pushMark(id);
  }

  function renderMarks(id) {
    var head = view.querySelector(".topic-head");
    if (!head) return;
    var old = head.querySelector(".progress-marks");
    if (old) old.remove();

    var box = document.createElement("div");
    box.className = "progress-marks";
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", "How this topic is going");
    var status = document.createElement("span");
    status.className = "sr-only";
    status.setAttribute("role", "status");

    Object.keys(LABELS).forEach(function (key) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "btn mark-btn";
      b.dataset.mark = key;
      b.textContent = LABELS[key];
      b.setAttribute("aria-pressed", String(!!marks[id] && marks[id].status === key));
      b.addEventListener("click", function () {
        setMark(id, key);
        box.querySelectorAll(".mark-btn").forEach(function (x) {
          x.setAttribute("aria-pressed", String(!!marks[id] && marks[id].status === x.dataset.mark));
        });
        status.textContent = marks[id] ? "Marked: " + LABELS[marks[id].status] + "." : "Mark cleared.";
      });
      box.appendChild(b);
    });
    box.appendChild(status);
    head.appendChild(box);
  }

  /* -------------------------------------------------------------- strip */
  // One line on the home page. Hidden until there is something to say, so a
  // first-time visitor is not greeted by "0 of 4".
  function renderStrip() {
    var count = document.getElementById("count");
    if (!count) return;
    var old = document.getElementById("progress-strip");
    if (old) old.remove();

    var all = topics();
    var got = all.filter(function (t) { return marks[t.id] && marks[t.id].status === "understood"; });
    var stuck = all.filter(function (t) { return marks[t.id] && marks[t.id].status === "stuck"; });
    if (!got.length && !stuck.length) return;

    var p = document.createElement("p");
    p.id = "progress-strip";
    p.className = "progress-strip";
    // One segment per topic: solid for understood, hatched for still stuck.
    var meter = document.createElement("span");
    meter.className = "meter";
    meter.setAttribute("aria-hidden", "true");
    all.forEach(function (t) {
      var seg = document.createElement("i");
      var m = marks[t.id];
      if (m) seg.className = m.status === "understood" ? "got" : "stuck";
      meter.appendChild(seg);
    });
    p.appendChild(meter);
    p.appendChild(document.createTextNode(
      "Your progress: " + got.length + " of " + all.length + " understood"));
    if (stuck.length) {
      p.appendChild(document.createTextNode(" · still stuck on "));
      stuck.forEach(function (t, i) {
        if (i) p.appendChild(document.createTextNode(", "));
        var a = document.createElement("a");
        a.href = "#/" + t.id;
        a.textContent = t.title;
        p.appendChild(a);
      });
    }
    count.parentNode.insertBefore(p, count);
  }

  /* ------------------------------------------------------------- setups */
  function renderSetups(id, row) {
    var old = document.getElementById("saved-setups");
    if (old) old.remove();

    var wrap = document.createElement("div");
    wrap.id = "saved-setups";
    wrap.className = "saved-setups";

    var form = document.createElement("form");
    form.className = "ctl-row save-setup";
    var name = document.createElement("input");
    name.type = "text";
    name.maxLength = 60;
    name.placeholder = "Name this setup, e.g. “fast and flat”";
    name.setAttribute("aria-label", "Name for this setup");
    var save = document.createElement("button");
    save.type = "submit";
    save.className = "btn";
    save.textContent = "Save this setup";
    form.append(name, save);

    var list = document.createElement("div");
    list.className = "ctl-row setup-list";
    list.setAttribute("role", "list");
    list.setAttribute("aria-label", "Saved setups");

    function paint() {
      list.innerHTML = "";
      (setups[id] || []).forEach(function (s) {
        var item = document.createElement("span");
        item.setAttribute("role", "listitem");
        item.className = "setup-item";
        var use = document.createElement("button");
        use.type = "button";
        use.className = "chip";
        use.textContent = s.name;
        use.title = "Load this setup";
        use.addEventListener("click", function () { window.demoSetup.apply(s.params); });
        var del = document.createElement("button");
        del.type = "button";
        del.className = "linkish setup-del";
        del.textContent = "×";
        del.setAttribute("aria-label", "Delete setup " + s.name);
        del.addEventListener("click", function () {
          setups[id] = setups[id].filter(function (x) { return x.name !== s.name; });
          store(SETUPS_KEY, setups);
          dropSetup(id, s.name);
          paint();
        });
        item.append(use, del);
        list.appendChild(item);
      });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var label = name.value.trim() || "Setup " + ((setups[id] || []).length + 1);
      var s = { name: label, params: window.demoSetup.read(), at: Date.now() };
      var arr = (setups[id] || []).filter(function (x) { return x.name !== label; });
      arr.unshift(s);
      setups[id] = arr.slice(0, MAX_SETUPS);
      store(SETUPS_KEY, setups);
      pushSetup(id, s);
      name.value = "";
      paint();
    });

    paint();
    wrap.append(form, list);
    row.parentNode.insertBefore(wrap, row.nextSibling);
  }

  /* ------------------------------------------------------------- wiring */
  function render() {
    var id = topicId();
    if (id && view.querySelector(".topic-head")) renderMarks(id);
    else renderStrip();
    var row = document.querySelector(".share-row");
    if (id && row) renderSetups(id, row);
  }

  // share.js announces when a topic's demo controls (and its link row) exist;
  // saved setups hang off that row, so they wait for it.
  window.addEventListener("share:ready", function (e) { renderSetups(e.detail.id, e.detail.row); });

  // Only the router's own swaps count. The strip is itself a child of #view,
  // so reacting to every added node meant inserting it re-triggered this
  // observer, which removed and re-inserted it, forever - a frozen tab.
  function isRouteSwap(record) {
    if (record.target !== view) return false;
    for (var j = 0; j < record.addedNodes.length; j++) {
      var n = record.addedNodes[j];
      if (n.nodeType === 1 && n.id !== "progress-strip") return true;
    }
    return false;
  }

  new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      if (isRouteSwap(records[i])) {
        Promise.resolve().then(function () {
          var id = topicId();
          if (id && view.querySelector(".topic-head")) renderMarks(id);
          else renderStrip();
        });
        return;
      }
    }
  }).observe(view, { childList: true });
  render();
}());
