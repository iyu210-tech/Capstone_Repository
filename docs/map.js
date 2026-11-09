/* The subject maps: layout, drawing, pan/zoom, keyboard navigation, the
   node panel and the list view that stands in for the map on small screens. */
(function () {
  "use strict";

  var Slime = window.Slime;
  var D = Slime.data, S = Slime.store, U = Slime.ui, h = U.h, svg = U.svg;
  var R = 16;                     // node radius in layout units

  /* ------------------------------------------------------------ layout */
  // Deterministic: the same content always produces the same map, so a
  // student's mental picture of "where things are" survives a reload.
  var cache = {};

  function layoutSubject(sid) {
    if (cache[sid]) return cache[sid];
    var subj = D.subject(sid), nodes = D.nodesOf(sid), K = subj.clusters.length;
    var anchors = {}, pos = {}, ids = nodes.map(function (n) { return n.id; });
    subj.clusters.forEach(function (c, i) {
      var a = -Math.PI / 2 + 2 * Math.PI * i / K;
      anchors[c.id] = { x: 470 * Math.cos(a), y: 350 * Math.sin(a) };
    });
    var count = {};
    nodes.forEach(function (n) { count[n.cluster] = (count[n.cluster] || 0) + 1; });
    var seen = {};
    nodes.forEach(function (n) {
      var j = seen[n.cluster] = (seen[n.cluster] || 0) + 1;
      var a = 2 * Math.PI * j / count[n.cluster] + ids.indexOf(n.id) * 0.1;
      // Orbit grows with cluster size so ~16–20 math codes per unit stay readable.
      var orbit = 55 + 14 * Math.sqrt(count[n.cluster]);
      pos[n.id] = { x: anchors[n.cluster].x + orbit * Math.cos(a), y: anchors[n.cluster].y + orbit * Math.sin(a) };
    });
    // Only links inside a cluster pull nodes together. Links between clusters
    // are still drawn, but letting them pull too drags whole clusters on top
    // of each other and the grouping stops reading as a mind map.
    var clusterOf = {};
    nodes.forEach(function (n) { clusterOf[n.id] = n.cluster; });
    var springs = D.edges.filter(function (e) {
      return pos[e.from] && pos[e.to] && clusterOf[e.from] === clusterOf[e.to];
    });

    for (var it = 0; it < 700; it++) {
      var temp = 1 - it / 700, f = {};
      ids.forEach(function (id) { f[id] = { x: 0, y: 0 }; });
      for (var i = 0; i < ids.length; i++) {
        for (var j = i + 1; j < ids.length; j++) {
          var A = pos[ids[i]], B = pos[ids[j]];
          var dx = (A.x - B.x) / 1.8, dy = A.y - B.y;   // labels are wide, so space nodes more sideways
          var d2 = dx * dx + dy * dy + 0.01, d = Math.sqrt(d2);
          if (d > 260) continue;
          var rep = (clusterOf[ids[i]] === clusterOf[ids[j]] ? 9500 : 2500) / d2;
          f[ids[i]].x += rep * dx / d; f[ids[i]].y += rep * dy / d;
          f[ids[j]].x -= rep * dx / d; f[ids[j]].y -= rep * dy / d;
        }
      }
      springs.forEach(function (e) {
        var A = pos[e.from], B = pos[e.to];
        var dx = B.x - A.x, dy = B.y - A.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        var k = 0.02 * (d - 105);
        f[e.from].x += k * dx / d; f[e.from].y += k * dy / d;
        f[e.to].x -= k * dx / d; f[e.to].y -= k * dy / d;
      });
      nodes.forEach(function (n) {
        var p = pos[n.id], a = anchors[n.cluster];
        f[n.id].x += 0.03 * (a.x - p.x); f[n.id].y += 0.03 * (a.y - p.y);
        var lim = 30 * temp + 0.5;
        p.x += Math.max(-lim, Math.min(lim, f[n.id].x));
        p.y += Math.max(-lim, Math.min(lim, f[n.id].y));
      });
    }
    cache[sid] = pos;
    return pos;
  }

  function layoutAll() {
    if (cache.all) return cache.all;
    var out = {}, offsets = { math: [-640, -380], physics: [640, -380], chemistry: [0, 540] };
    D.subjects.forEach(function (s) {
      var p = layoutSubject(s.id), ids = Object.keys(p), cx = 0, cy = 0;
      ids.forEach(function (id) { cx += p[id].x; cy += p[id].y; });
      cx /= ids.length; cy /= ids.length;
      ids.forEach(function (id) {
        out[id] = { x: (p[id].x - cx) * 0.82 + offsets[s.id][0], y: (p[id].y - cy) * 0.82 + offsets[s.id][1] };
      });
    });
    cache.all = out;
    return out;
  }

  function wrapLabel(text) {
    var ws = text.split(" "), lines = [], cur = "";
    ws.forEach(function (w) {
      if ((cur + " " + w).trim().length > 17 && cur) { lines.push(cur); cur = w; }
      else cur = (cur + " " + w).trim();
    });
    if (cur) lines.push(cur);
    return lines.slice(0, 3);
  }

  function arc(r, a0, a1) {
    var x0 = r * Math.cos(a0), y0 = r * Math.sin(a0), x1 = r * Math.cos(a1), y1 = r * Math.sin(a1);
    return "M" + x0.toFixed(2) + "," + y0.toFixed(2) + "A" + r + "," + r + " 0 0,1 " + x1.toFixed(2) + "," + y1.toFixed(2);
  }

  /* ------------------------------------------------------------ panel */
  function panel(node, onPick) {
    var st = S.stage(node.id), rec = S.node(node.id), lesson = D.lesson(node.id);
    var qs = D.questionsFor(node.id);
    var wrap = h("div.np");
    wrap.append(
      h("div.np-tags", U.subjectPill(node.subject), U.levelBadge(node.level), U.specBadge(node.spec)),
      h("h2.np-title", { tabindex: "-1" }, node.title),
      h("p.np-syl", node.syllabus + " · " + D.cluster(node.subject, node.cluster).name),
      h("p.np-sum", node.summary),
      h("div.np-progress",
        U.stageMeter(st),
        rec.lessonDone ? h("span.done-badge", "✓ Lesson complete") : null)
    );

    var actions = h("div.np-actions");
    if (lesson) {
      actions.appendChild(h("a.btn.primary", { href: "#/topic/" + node.id },
        rec.lessonDone ? "Review lesson" : st.index ? "Continue lesson" : "Start lesson"));
    } else {
      actions.appendChild(h("a.btn", { href: "#/topic/" + node.id }, "Topic overview"));
    }
    if (qs.length) actions.appendChild(h("a.btn", { href: "#/questions?node=" + node.id }, "Practice test · " + U.plural(qs.length, "question")));
    wrap.appendChild(actions);
    if (!lesson) wrap.appendChild(h("p.muted.small", "The full lesson for this topic is still being written."));

    var groups = {};
    D.links(node.id).forEach(function (l) {
      var rel = D.relation(l);
      (groups[rel] = groups[rel] || []).push(l);
    });
    var order = ["Builds on", "Uses ideas from", "Leads to", "Applied in", "Similar to"];
    var conn = h("div.np-conn", h("h3", "Connections"));
    order.forEach(function (rel) {
      if (!groups[rel]) return;
      var ul = h("ul");
      groups[rel].forEach(function (l) {
        var o = D.node(l.other);
        var btn = h("button.conn-link", { type: "button" },
          U.glyph(o.subject, 11), " ", o.title,
          l.cross ? h("span.conn-subj", " · " + D.subject(o.subject).short) : null);
        btn.addEventListener("click", function () { onPick(o.id); });
        ul.appendChild(h("li.conn-" + l.type, btn, l.note ? h("p.conn-note", l.note) : null));
      });
      conn.append(h("h4", rel), ul);
    });
    if (!Object.keys(groups).length) conn.appendChild(h("p.muted", "No connections yet."));
    wrap.appendChild(conn);
    return wrap;
  }

  /* ------------------------------------------------------------- list */
  function listView(sid, filter) {
    var subjects = sid === "all" ? D.subjects : [D.subject(sid)];
    var root = h("div.map-list");
    var nexts = S.nextUp();
    subjects.forEach(function (s) {
      if (sid === "all") root.appendChild(h("h2.list-subj", U.glyph(s.id, 14), " " + s.name));
      s.clusters.forEach(function (c) {
        var nodes = D.nodesOf(s.id).filter(function (n) { return n.cluster === c.id && filter(n); });
        if (!nodes.length) return;
        var ul = h("ul.list-nodes");
        nodes.forEach(function (n) {
          ul.appendChild(h("li", h("a.list-node.subj-" + n.subject, { href: "#/topic/" + n.id },
            h("span.list-main",
              h("span.list-title", U.glyph(n.subject, 11), " ", n.title)),
            h("span.list-side",
              nexts.indexOf(n.id) !== -1 ? h("span.badge.badge-next", "Next up") : null,
              S.node(n.id).lessonDone ? h("span.done-badge", "✓") : null,
              U.stageMeter(S.stage(n.id), { compact: true })))));
        });
        root.append(h("h3.list-cluster", c.name), ul);
      });
    });
    if (!root.querySelector("li")) root.appendChild(h("p.empty", "No topics match these filters."));
    return root;
  }

  /* ------------------------------------------------------------- map */
  function render(host, opts) {
    var sid = opts.subject;
    var pos = sid === "all" ? layoutAll() : layoutSubject(sid);
    var nodes = (sid === "all" ? D.nodes : D.nodesOf(sid)).slice();
    var inMap = {};
    nodes.forEach(function (n) { inMap[n.id] = true; });
    var edges = D.edges.filter(function (e) { return inMap[e.from] && inMap[e.to]; });
    var nexts = {};
    S.nextUp().forEach(function (id) { nexts[id] = true; });

    var filters = { q: "" };
    var selected = null, view = { k: 1, x: 0, y: 0 }, cleanup = [];
    var viewMode = S.setting("mapView") || (window.innerWidth < 640 ? "list" : "map");

    /* toolbar */
    var search = h("input.map-search", { type: "search", placeholder: "Find a topic on this map…", "aria-label": "Find a topic on this map" });
    var viewBtn = h("button.btn", { type: "button" });
    var toolbar = h("div.map-toolbar", search, viewBtn);
    var countEl = h("p.map-count", { role: "status", "aria-live": "polite" });

    /* stage */
    var svgEl = svg("svg", { class: "map-svg", role: "group", "aria-label": "Topic map. Tab through topics, use arrow keys to move between nearby topics, Enter to open." });
    var defs = svg("defs");
    ["n", "hot"].forEach(function (k) {
      var m = svg("marker", { id: "arrow-" + k + "-" + sid, viewBox: "0 0 10 10", refX: "9", refY: "5",
        markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" });
      m.appendChild(svg("path", { d: "M0,1 L9,5 L0,9 z", class: "arrow-" + k }));
      defs.appendChild(m);
    });
    svgEl.appendChild(defs);
    var vp = svg("g", { class: "map-vp" });
    var gClusters = svg("g", { class: "map-clusters" }), gEdges = svg("g", { class: "map-edges" }), gNodes = svg("g", { class: "map-nodes" });
    vp.append(gClusters, gEdges, gNodes);
    svgEl.appendChild(vp);

    var zoomIn = h("button.map-zoom", { type: "button", "aria-label": "Zoom in" }, "+");
    var zoomOut = h("button.map-zoom", { type: "button", "aria-label": "Zoom out" }, "−");
    var zoomFit = h("button.map-zoom", { type: "button", "aria-label": "Fit map to screen" }, "⤢");
    var stageEl = h("div.map-stage", svgEl, h("div.map-zooms", zoomIn, zoomOut, zoomFit),
      h("p.map-hint", "Drag or scroll to move · pinch or Ctrl + scroll to zoom · Tab and arrow keys to navigate"));
    var side = h("aside.map-panel", { hidden: true, "aria-label": "Topic details" });
    var closeBtn = h("button.np-close", { type: "button", "aria-label": "Close topic details" }, "✕");
    var listHost = h("div.map-list-host");
    var body = h("div.map-body", stageEl, side);
    host.append(toolbar, countEl, body, listHost, legend(sid));

    /* clusters */
    var subjectsShown = sid === "all" ? D.subjects : [D.subject(sid)];
    subjectsShown.forEach(function (s) {
      s.clusters.forEach(function (c) {
        var members = nodes.filter(function (n) { return n.subject === s.id && n.cluster === c.id; });
        if (!members.length) return;
        var cx = 0, cy = 0;
        members.forEach(function (n) { cx += pos[n.id].x; cy += pos[n.id].y; });
        cx /= members.length; cy /= members.length;
        var r = 0;
        members.forEach(function (n) { r = Math.max(r, Math.hypot(pos[n.id].x - cx, pos[n.id].y - cy)); });
        r += 52;
        gClusters.appendChild(svg("circle", { cx: cx, cy: cy, r: r, class: "cluster subj-" + s.id }));
        var t = svg("text", { x: cx, y: cy - r + 18, class: "cluster-label", "text-anchor": "middle" });
        t.textContent = sid === "all" ? s.short + " · " + c.name.replace(/^.*· /, "") : c.name;
        gClusters.appendChild(t);
      });
    });

    /* edges */
    var edgeEls = edges.map(function (e) {
      var a = pos[e.from], b = pos[e.to];
      var dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      var ux = dx / d, uy = dy / d, pad = R + 7;
      var x1 = a.x + ux * pad, y1 = a.y + uy * pad, x2 = b.x - ux * pad, y2 = b.y - uy * pad;
      var cross = D.node(e.from).subject !== D.node(e.to).subject;
      var dpath = "M" + x1 + "," + y1;
      if (cross) {
        var bend = 0.12 * d, mx = (x1 + x2) / 2 - uy * bend, my = (y1 + y2) / 2 + ux * bend;
        dpath += "Q" + mx + "," + my + " " + x2 + "," + y2;
      } else dpath += "L" + x2 + "," + y2;
      var p = svg("path", { d: dpath, class: "edge e-" + e.type + (cross ? " is-cross" : "") });
      if (e.type !== "similarity") p.setAttribute("marker-end", "url(#arrow-n-" + sid + ")");
      p.__e = e;
      gEdges.appendChild(p);
      return p;
    });

    /* nodes */
    var nodeEls = {};
    nodes.forEach(function (n) {
      var p = pos[n.id], st = S.stage(n.id), rec = S.node(n.id), lesson = D.lesson(n.id);
      var g = svg("g", {
        class: "mnode subj-" + n.subject + " stage-" + st.key + (lesson ? " has-lesson" : " no-lesson") +
          (rec.lessonDone ? " is-done" : "") + (nexts[n.id] ? " is-next" : ""),
        transform: "translate(" + p.x.toFixed(1) + "," + p.y.toFixed(1) + ")",
        tabindex: "0", role: "button", "data-id": n.id,
        "aria-label": n.title + ", " + D.subject(n.subject).short + ". " + st.label + "." +
          (rec.lessonDone ? " Lesson complete." : lesson ? " Lesson available." : " Lesson coming soon.") +
          (nexts[n.id] ? " Suggested next." : "")
      });
      g.appendChild(svg("circle", { r: R + 11, class: "halo" }));
      g.appendChild(svg("path", { d: U.shapePath(U.difficultySides(n.difficulty), R), class: "shape" }));
      for (var i = 0; i < 4; i++) {
        var a0 = -Math.PI / 2 + i * Math.PI / 2 + 0.16, a1 = a0 + Math.PI / 2 - 0.32;
        g.appendChild(svg("path", { d: arc(R + 6, a0, a1), class: "ring" + (i < st.index ? " on" : "") }));
      }
      if (rec.lessonDone) {
        g.appendChild(svg("circle", { cx: R * 0.85, cy: -R * 0.85, r: 7, class: "done-dot" }));
        var ck = svg("path", { d: "M" + (R * 0.85 - 3.2) + "," + (-R * 0.85) + "l2.2,2.4l4,-4.6", class: "done-tick" });
        g.appendChild(ck);
      }
      if (!lesson) {
        var inner = svg("circle", { r: 4, class: "no-lesson-dot" });
        g.appendChild(inner);
      }
      var lines = wrapLabel(n.title);
      var t = svg("text", { class: "mlabel", "text-anchor": "middle", y: R + 22 });
      lines.forEach(function (ln, i) {
        var ts = svg("tspan", { x: 0, dy: i ? "1.15em" : "0" });
        ts.textContent = ln;
        t.appendChild(ts);
      });
      g.appendChild(t);
      if (nexts[n.id]) {
        var nt = svg("text", { class: "next-tag", "text-anchor": "middle", y: -R - 15 });
        nt.textContent = "NEXT";
        g.appendChild(nt);
      }
      var title = svg("title");
      title.textContent = n.title + ": " + st.label;
      g.appendChild(title);
      gNodes.appendChild(g);
      nodeEls[n.id] = g;
    });

    /* --------------------------------------------- highlight & filter */
    function matches(n) {
      if (filters.q) return D.searchNodes({ q: filters.q, subject: n.subject }).indexOf(n) !== -1;
      return true;
    }

    function applyFilters() {
      var shown = 0;
      nodes.forEach(function (n) {
        var ok = matches(n);
        nodeEls[n.id].classList.toggle("filtered", !ok);
        if (ok) shown++;
      });
      countEl.textContent = filters.q ? shown + " of " + nodes.length + " topics match" : U.plural(nodes.length, "topic");
      paintEdges();
      if (viewMode === "list") paintList();
    }

    // Edges stay hidden until a node is selected, so the map stays readable.
    function paintEdges() {
      edgeEls.forEach(function (p) {
        var on = !!selected && (p.__e.from === selected || p.__e.to === selected);
        var filtered = nodeEls[p.__e.from].classList.contains("filtered") ||
          nodeEls[p.__e.to].classList.contains("filtered");
        p.classList.toggle("shown", on && !filtered);
        p.classList.toggle("hot", on && !filtered);
        if (p.__e.type !== "similarity") {
          p.setAttribute("marker-end", "url(#arrow-" + (on ? "hot" : "n") + "-" + sid + ")");
        }
      });
    }

    // When a topic is selected, everything else falls away so only that topic
    // and its neighbours remain. Hover alone does not trigger this.
    function paintFocus() {
      var near = {};
      if (selected) {
        near[selected] = true;
        D.links(selected).forEach(function (l) { near[l.other] = true; });
      }
      nodes.forEach(function (n) {
        var el = nodeEls[n.id];
        el.classList.toggle("away", !!selected && !near[n.id]);
        el.classList.toggle("near", !!selected && near[n.id] && n.id !== selected);
        el.classList.toggle("is-selected", n.id === selected);
        el.classList.remove("dim");
      });
      gClusters.classList.toggle("away", !!selected);
      stageEl.classList.toggle("is-focused", !!selected);
      paintEdges();
    }

    function select(id, o) {
      o = o || {};
      if (!inMap[id]) {
        location.hash = "#/map/" + D.node(id).subject + "?node=" + id;
        return;
      }
      selected = id;
      paintFocus();
      side.innerHTML = "";
      side.append(closeBtn, panel(D.node(id), function (other) { select(other, { focusPanel: true }); }));
      side.hidden = false;
      body.classList.add("has-panel");
      if (o.center !== false) centerOn(id);
      if (o.focusPanel) side.querySelector(".np-title").focus();
      history.replaceState(null, "", "#/map/" + sid + "?node=" + id);
    }

    function deselect() {
      var was = selected;
      selected = null;
      paintFocus();
      side.hidden = true;
      body.classList.remove("has-panel");
      history.replaceState(null, "", "#/map/" + sid);
      if (was && nodeEls[was]) nodeEls[was].focus({ preventScroll: true });
    }
    closeBtn.addEventListener("click", deselect);

    /* --------------------------------------------------- pan & zoom */
    function bounds() {
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      nodes.forEach(function (n) {
        var p = pos[n.id];
        x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
      });
      return { x0: x0 - 90, y0: y0 - 70, x1: x1 + 90, y1: y1 + 90 };
    }

    function apply() {
      vp.setAttribute("transform", "translate(" + view.x.toFixed(1) + "," + view.y.toFixed(1) + ") scale(" + view.k.toFixed(4) + ")");
      svgEl.classList.toggle("far", view.k < 0.55);
    }

    function fit() {
      var b = bounds(), w = svgEl.clientWidth || 800, hgt = svgEl.clientHeight || 600;
      view.k = Math.min(w / (b.x1 - b.x0), hgt / (b.y1 - b.y0));
      view.x = w / 2 - view.k * (b.x0 + b.x1) / 2;
      view.y = hgt / 2 - view.k * (b.y0 + b.y1) / 2;
      apply();
    }

    function zoomAt(f, cx, cy) {
      var k = Math.max(0.25, Math.min(3, view.k * f));
      f = k / view.k;
      view.x = cx - (cx - view.x) * f;
      view.y = cy - (cy - view.y) * f;
      view.k = k;
      apply();
    }

    function centerOn(id) {
      var p = pos[id], w = svgEl.clientWidth, hgt = svgEl.clientHeight;
      var sx = view.x + p.x * view.k, sy = view.y + p.y * view.k;
      var margin = 80;
      if (sx < margin || sx > w - margin || sy < margin || sy > hgt - margin) {
        view.x = w / 2 - p.x * view.k;
        view.y = hgt / 2 - p.y * view.k;
        apply();
      }
    }

    zoomIn.addEventListener("click", function () { zoomAt(1.25, svgEl.clientWidth / 2, svgEl.clientHeight / 2); });
    zoomOut.addEventListener("click", function () { zoomAt(0.8, svgEl.clientWidth / 2, svgEl.clientHeight / 2); });
    zoomFit.addEventListener("click", fit);

    svgEl.addEventListener("wheel", function (e) {
      e.preventDefault();
      var r = svgEl.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
      else { view.x -= e.deltaX; view.y -= e.deltaY; apply(); }
    }, { passive: false });

    var pointers = {}, drag = null, moved = false;
    svgEl.addEventListener("pointerdown", function (e) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      moved = false;
      var ids = Object.keys(pointers);
      if (ids.length === 1) drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
      if (ids.length === 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        drag = { pinch: Math.hypot(a.x - b.x, a.y - b.y), k: view.k };
      }
    });
    svgEl.addEventListener("pointermove", function (e) {
      if (!pointers[e.pointerId] || !drag) return;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pointers);
      if (ids.length === 2 && drag.pinch) {
        var a = pointers[ids[0]], b = pointers[ids[1]], r = svgEl.getBoundingClientRect();
        var d = Math.hypot(a.x - b.x, a.y - b.y);
        zoomAt((drag.k * d / drag.pinch) / view.k, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
        moved = true;
      } else if (ids.length === 1 && !drag.pinch) {
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) {
          if (!moved) svgEl.setPointerCapture(e.pointerId);
          moved = true;
        }
        if (moved) { view.x = drag.vx + dx; view.y = drag.vy + dy; apply(); }
      }
    });
    function up(e) {
      delete pointers[e.pointerId];
      if (!Object.keys(pointers).length) drag = null;
    }
    svgEl.addEventListener("pointerup", up);
    svgEl.addEventListener("pointercancel", up);

    svgEl.addEventListener("click", function (e) {
      if (moved) return;
      var g = e.target.closest(".mnode");
      if (g) select(g.dataset.id);
      else if (selected) deselect();
    });

    /* ----------------------------------------------------- keyboard */
    function nearestInDirection(id, dir) {
      var p = pos[id], best = null, bestScore = Infinity;
      nodes.forEach(function (n) {
        if (n.id === id || nodeEls[n.id].classList.contains("filtered")) return;
        var q = pos[n.id], dx = q.x - p.x, dy = q.y - p.y;
        var along = dir === "ArrowRight" ? dx : dir === "ArrowLeft" ? -dx : dir === "ArrowDown" ? dy : -dy;
        var across = dir === "ArrowRight" || dir === "ArrowLeft" ? Math.abs(dy) : Math.abs(dx);
        if (along <= 5) return;
        var s = along + across * 2;
        if (s < bestScore) { bestScore = s; best = n.id; }
      });
      return best;
    }

    gNodes.addEventListener("keydown", function (e) {
      var g = e.target.closest(".mnode");
      if (!g) return;
      var id = g.dataset.id;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(id, { focusPanel: false }); }
      else if (/^Arrow/.test(e.key)) {
        e.preventDefault();
        var next = nearestInDirection(id, e.key);
        if (next) { nodeEls[next].focus({ preventScroll: true }); centerOn(next); }
      } else if (e.key === "Escape" && selected) deselect();
      else if (e.key === "+" || e.key === "=") zoomAt(1.25, svgEl.clientWidth / 2, svgEl.clientHeight / 2);
      else if (e.key === "-") zoomAt(0.8, svgEl.clientWidth / 2, svgEl.clientHeight / 2);
    });
    gNodes.addEventListener("focusin", function (e) {
      var g = e.target.closest(".mnode");
      if (g) centerOn(g.dataset.id);
    });
    side.addEventListener("keydown", function (e) { if (e.key === "Escape") deselect(); });

    /* ------------------------------------------------------- toolbar */
    search.addEventListener("input", function () { filters.q = search.value.trim(); applyFilters(); });
    search.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      var first = nodes.filter(function (n) { return !nodeEls[n.id].classList.contains("filtered"); })[0];
      if (first && filters.q) select(first.id);
    });

    function paintList() {
      listHost.innerHTML = "";
      listHost.appendChild(listView(sid, matches));
    }

    function setMode(m, remember) {
      viewMode = m;
      if (remember) S.setting("mapView", m);
      body.hidden = m === "list";
      listHost.hidden = m !== "list";
      viewBtn.textContent = m === "list" ? "Show as map" : "Show as list";
      viewBtn.setAttribute("aria-label", m === "list" ? "Switch to map view" : "Switch to list view");
      if (m === "list") paintList();
      else requestAnimationFrame(function () { fit(); if (selected) centerOn(selected); });
    }
    viewBtn.addEventListener("click", function () { setMode(viewMode === "list" ? "map" : "list", true); });

    /* ------------------------------------------------------- start */
    applyFilters();
    setMode(viewMode, false);

    var ro = window.ResizeObserver ? new ResizeObserver(function () { if (viewMode === "map" && !selected) fit(); }) : null;
    if (ro) ro.observe(svgEl);

    if (opts.focus && inMap[opts.focus]) {
      requestAnimationFrame(function () {
        if (viewMode === "list") setMode("map", false);
        select(opts.focus);
        if (opts.justDone) celebrate(opts.focus);
      });
    }

    // After a lesson: the finished topic and its onward connections pulse, so
    // the student sees where that idea leads before choosing what is next.
    function celebrate(id) {
      nodeEls[id].classList.add("celebrate");
      edgeEls.forEach(function (p) {
        if (p.__e.from === id || (p.__e.type === "similarity" && p.__e.to === id)) p.classList.add("flow");
      });
      D.links(id).forEach(function (l) {
        if (nodeEls[l.other] && nexts[l.other]) nodeEls[l.other].classList.add("celebrate");
      });
    }

    cleanup.push(function () { if (ro) ro.disconnect(); });
    return { destroy: function () { cleanup.forEach(function (f) { f(); }); } };
  }

  function legend(sid) {
    function sample(cls, arrow) {
      var s = svg("svg", { width: 36, height: 10, "aria-hidden": "true" });
      var p = svg("path", { d: "M2,5 L30,5", class: "edge " + cls + " shown" });
      s.appendChild(p);
      if (arrow) s.appendChild(svg("path", { d: "M28,1 L35,5 L28,9 z", class: "arrow-n" }));
      return s;
    }
    function sideSample(sides) {
      var s = svg("svg", { width: 18, height: 18, viewBox: "-10 -10 20 20", "aria-hidden": "true" });
      s.appendChild(svg("path", { d: U.shapePath(sides, 8), fill: "currentColor" }));
      return s;
    }
    var colors = D.subjects.map(function (s) {
      return h("li", h("span.subj-" + s.id, U.glyph(s.id, 12)), " " + s.short);
    });
    return h("details.map-legend", { open: sid === "all" ? true : null },
      h("summary", "How to read the map"),
      h("div.legend-grid",
        h("div", h("h4", "Connections"), h("ul",
          h("li", sample("e-prerequisite", true), " Prerequisite: learn this first"),
          h("li", sample("e-application", true), " Application: used in"),
          h("li", sample("e-similarity", false), " Similar idea"),
          h("li", "Select a topic to see its connections"))),
        h("div", h("h4", "Difficulty"), h("ul",
          h("li", h("span.diff-sample", sideSample(0)), " Circle: foundation"),
          h("li", h("span.diff-sample", sideSample(3)), " Triangle: standard"),
          h("li", h("span.diff-sample", sideSample(4)), " Square: demanding"),
          h("li", h("span.diff-sample", sideSample(5)), " Pentagon: hardest"))),
        h("div", h("h4", "Subjects"), h("ul", colors,
          h("li", h("span.hollow-sample"), " Hollow center: lesson not written yet"))),
        h("div", h("h4", "Your progress"), h("ul",
          S.STAGES.slice(1).map(function (st, i) {
            return h("li.legend-stage",
              U.stageMeter({ index: i + 1, key: st.key, label: st.label, blurb: st.blurb }, { compact: true }),
              h("span", h("strong", st.label + ": "), st.blurb));
          }),
          h("li", h("span.done-badge", "✓"), " Lesson finished"),
          h("li", h("span.badge.badge-next", "NEXT"), " Connected to a finished lesson")))
      )
    );
  }

  Slime.map = { render: render, panel: panel };
})();
