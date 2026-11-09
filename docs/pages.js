/* Home, the map page, search, progress and the not-found page. */
(function () {
  "use strict";

  var Slime = window.Slime;
  var D = Slime.data, S = Slime.store, U = Slime.ui, h = U.h;
  var views = Slime.views = Slime.views || {};

  function slimeProgressPanel() {
    var total = D.nodes.length, slimed = 0, working = 0, idle = 0;
    D.nodes.forEach(function (n) {
      var i = S.stage(n.id).index;
      if (i >= 3) slimed++;
      else if (i >= 1) working++;
      else idle++;
    });
    var pct = total ? Math.round(100 * slimed / total) : 0;
    var wSlimed = total ? (100 * slimed / total) : 0;
    var wWorking = total ? (100 * working / total) : 0;
    var wIdle = total ? (100 * idle / total) : 0;
    return h("section.panel.slime-progress",
      h("div.slime-progress-head",
        h("h2", "All Subjects"),
        h("p.slime-pct", h("b", pct + "%"), " slimed")),
      h("div.slime-bar", {
        role: "img",
        "aria-label": pct + "% slimed. " +
          U.plural(slimed, "topic") + " slimed, " +
          U.plural(working, "topic") + " sliming, " +
          U.plural(idle, "topic") + " to be slimed."
      },
        wSlimed ? h("span.seg-slimed", { style: "width:" + wSlimed + "%" }) : null,
        wWorking ? h("span.seg-working", { style: "width:" + wWorking + "%" }) : null,
        wIdle ? h("span.seg-idle", { style: "width:" + wIdle + "%" }) : null),
      h("ul.slime-legend",
        h("li", h("i.swatch.swatch-slimed"), " Slimed"),
        h("li", h("i.swatch.swatch-working"), " Sliming"),
        h("li", h("i.swatch.swatch-idle"), " To Be Slimed")));
  }

  function streakPanel() {
    var st = S.streak();
    var sub = st.current
      ? (st.best > st.current ? "Best: " + st.best + " · " : "") + U.plural(st.days, "day") + " practiced all time"
      : (st.best ? "Best: " + st.best + ". Practice today to start again." : "Practice today to start a streak.");
    return h("section.panel.streak-panel",
      h("div.streak-main",
        h("p.streak-count", h("b", String(st.current)), h("span", " day streak")),
        h("p.streak-sub", sub)));
  }

  /* ----------------------------------------------------------- home */
  views.home = function (view) {
    document.title = "SlimeIB";
    view.appendChild(h("header.page-head.home-head",
      h("img.home-mark", { src: "logo.png", alt: "", width: 56, height: 56 }),
      h("h1.home-title", { tabindex: "-1" },
        h("span.home-slime", "Slime"), "IB")));

    view.append(slimeProgressPanel(), streakPanel());

    var dailyHost = h("div.daily.home-daily");
    view.appendChild(h("section.home-daily-wrap",
      h("h2.section-title", "Daily Practice"),
      dailyHost));
    if (Slime.practice && Slime.practice.mountDaily) Slime.practice.mountDaily(dailyHost, { homeHref: "#/" });
    return {};
  };

  /* ------------------------------------------------------------ map */
  views.map = function (view, subject, params) {
    if (subject !== "all" && !D.subject(subject)) return views.missing(view, "#/map/" + subject);
    S.setting("lastMap", subject);
    var name = subject === "all" ? "All Subjects" : D.subject(subject).name;
    document.title = name + " map · SlimeIB";
    var tabs = h("nav.subject-tabs", { "aria-label": "Choose a map" });
    D.subjects.map(function (s) { return [s.id, s.short]; }).concat([["all", "All Subjects"]]).forEach(function (t) {
      tabs.appendChild(h("a.subj-tab" + (t[0] !== "all" ? ".subj-" + t[0] : ""),
        { href: "#/map/" + t[0], "aria-current": t[0] === subject ? "page" : null },
        t[0] !== "all" ? U.glyph(t[0], 12) : null, " " + t[1]));
    });
    view.append(
      h("header.page-head.map-head", h("h1", { tabindex: "-1" }, name)),
      tabs);
    var host = h("div.map-host");
    view.appendChild(host);
    var m = Slime.map.render(host, { subject: subject, focus: params.node, justDone: params.done === "1" });
    if (params.done === "1") U.toast("Lesson complete. The highlighted topics are where it leads.");
    return m;
  };

  /* ---------------------------------------------------------- search */
  views.search = function (view, params) {
    document.title = "Search · SlimeIB";
    var f = { q: params.q || "", subject: params.subject || "", cluster: "", difficulty: "", syllabus: "", spec: "" };
    var input = h("input.big-search", { type: "search", value: f.q, placeholder: "Search topics, lessons and questions. Try “half-life” or “why does heating speed up a reaction”", "aria-label": "Search" });
    view.appendChild(h("header.page-head", h("h1", { tabindex: "-1" }, "Search"), input));

    var subjSel = h("select", { "aria-label": "Subject" }, h("option", { value: "" }, "All Subjects"),
      D.subjects.map(function (s) { return h("option", { value: s.id, selected: f.subject === s.id ? true : null }, s.short); }));
    var clusterSel = h("select", { "aria-label": "Syllabus theme" });
    function paintClusters() {
      clusterSel.innerHTML = "";
      clusterSel.appendChild(h("option", { value: "" }, "Any theme"));
      D.subjects.filter(function (s) { return !f.subject || s.id === f.subject; }).forEach(function (s) {
        s.clusters.forEach(function (c) { clusterSel.appendChild(h("option", { value: s.id + "/" + c.id }, c.name)); });
      });
    }
    paintClusters();
    var diffSel = h("select", { "aria-label": "Difficulty" }, h("option", { value: "" }, "Any difficulty"),
      h("option", { value: "1" }, "Foundation"), h("option", { value: "2" }, "Standard"),
      h("option", { value: "3" }, "Demanding"), h("option", { value: "4" }, "Hardest"));
    var specSel = h("select", { "aria-label": "Syllabus version" }, h("option", { value: "" }, "All content"),
      h("option", { value: "current" }, "Current syllabus"), h("option", { value: "extension" }, "Extension"));
    var syl = h("input", { type: "search", placeholder: "Syllabus ref, e.g. R2.2", "aria-label": "Syllabus reference" });
    view.appendChild(h("div.filter-bar", subjSel, clusterSel, diffSel, specSel, syl));

    var results = h("div.search-results", { "aria-live": "polite" });
    view.appendChild(results);

    function paint() {
      var cl = clusterSel.value.split("/");
      var filt = { q: f.q, subject: f.subject || (cl[0] || ""), cluster: cl[1] || "", difficulty: diffSel.value, syllabus: syl.value.trim(), spec: specSel.value };
      var any = filt.q || filt.subject || filt.cluster || filt.difficulty || filt.syllabus || filt.spec;
      results.innerHTML = "";
      if (!any) { results.appendChild(h("p.muted", "Type a word or a question, or pick a filter.")); return; }
      var nodes = D.searchNodes(filt), qs = D.searchQuestions(filt);
      results.appendChild(h("h2.section-title", U.plural(nodes.length, "topic")));
      var ul = h("ul.topic-results");
      nodes.slice(0, 30).forEach(function (n) {
        ul.appendChild(h("li", h("a.topic-result.subj-" + n.subject, { href: "#/topic/" + n.id },
          h("span.tr-head", U.subjectPill(n.subject), h("b", n.title), D.lesson(n.id) ? h("span.badge", "Lesson") : null, U.specBadge(n.spec)),
          h("span.muted", n.syllabus + " · " + n.summary),
          U.stageMeter(S.stage(n.id), { compact: true }))));
      });
      if (!nodes.length) ul.appendChild(h("li.empty", "No topics match."));
      results.appendChild(ul);
      results.appendChild(h("h2.section-title", U.plural(qs.length, "question")));
      var ql = h("ul.qlist");
      qs.slice(0, 30).forEach(function (q) { ql.appendChild(views.questionRow(q)); });
      if (!qs.length) ql.appendChild(h("li.empty", "No questions match."));
      results.appendChild(ql);
      history.replaceState(null, "", "#/search" + (f.q ? "?q=" + encodeURIComponent(f.q) : ""));
    }
    input.addEventListener("input", function () { f.q = input.value.trim(); paint(); });
    subjSel.addEventListener("change", function () { f.subject = subjSel.value; paintClusters(); paint(); });
    [clusterSel, diffSel, specSel].forEach(function (s) { s.addEventListener("change", paint); });
    syl.addEventListener("input", paint);
    paint();
    setTimeout(function () { input.focus(); }, 0);
    return {};
  };

  /* -------------------------------------------------------- progress */
  views.progress = function (view) {
    document.title = "Progress · SlimeIB";
    view.appendChild(h("header.page-head",
      h("h1", { tabindex: "-1" }, "Progress")));
    view.appendChild(slimeProgressPanel());

    view.appendChild(h("section.panel",
      h("h2", "The four stages"),
      h("ol.stage-explain", S.STAGES.slice(1).map(function (st, i) {
        return h("li", U.stageMeter({ index: i + 1, key: st.key, label: st.label, blurb: st.blurb }), h("span", st.blurb));
      }))));

    var up = S.upcoming(7), max = Math.max.apply(null, [1].concat(up));
    var days = ["Today", "Tomorrow"];
    for (var i = 2; i < 7; i++) {
      var d = new Date(); d.setDate(d.getDate() + i);
      days.push(d.toLocaleDateString(undefined, { weekday: "short" }));
    }
    view.appendChild(h("section.panel",
      h("h2", "Upcoming reviews"),
      up.some(Boolean) ? h("ul.bars.bars-v", up.map(function (n, i) {
        return h("li", h("span.bar", h("span", { style: "height:" + (100 * n / max) + "%" })), h("b", String(n)), h("span.bar-label", days[i]));
      })) : h("p.muted", "No reviews scheduled yet.")));

    var file = h("input", { type: "file", accept: "application/json,.json", hidden: true });
    var exp = h("button.btn", { type: "button" }, "Export progress");
    var imp = h("button.btn", { type: "button" }, "Import progress");
    var reset = h("button.btn.danger", { type: "button" }, "Reset all progress");
    exp.addEventListener("click", function () {
      var url = URL.createObjectURL(new Blob([S.exportJSON()], { type: "application/json" }));
      var a = h("a", { href: url, download: "slimeib-progress-" + S.dayKey(Date.now()) + ".json" });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
    imp.addEventListener("click", function () { file.click(); });
    file.addEventListener("change", function () {
      var f = file.files[0];
      if (!f) return;
      f.text().then(function (t) {
        try { S.importJSON(t); U.toast("Progress imported."); Slime.route(); }
        catch (e) { U.toast(e.message || "Could not read that file."); }
      });
    });
    reset.addEventListener("click", function () {
      if (confirm("Delete all progress saved in this browser? This cannot be undone. Export first if you might want it back.")) {
        S.reset(); U.toast("Progress reset."); Slime.route();
      }
    });
    view.appendChild(h("section.panel",
      h("h2", "Your data"),
      h("p", "Progress is saved in this browser only. Export it to move it to another device, or to keep a backup."),
      h("div.actions", exp, imp, reset, file)));
    return {};
  };

  /* --------------------------------------------------------- missing */
  views.missing = function (view, wanted) {
    document.title = "Not found · SlimeIB";
    view.appendChild(h("section.notfound",
      h("h1", { tabindex: "-1" }, "That page is not here"),
      h("p", "Nothing matches ", h("code", wanted), ". It may have been renamed since the link was shared."),
      h("p", h("a", { href: "#/" }, "Go to the home page →"))));
    return {};
  };
})();
