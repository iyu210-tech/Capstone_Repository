/* Lesson simulations that have no Python twin yet.
   Built on the same Plot and control helpers as demos.js, so they size,
   theme and pause exactly like the original four. */
(function () {
  "use strict";

  var K = window.DemoKit;
  if (!K) return;
  var Plot = K.Plot, slider = K.slider, buttonRow = K.buttonRow,
    button = K.button, playButton = K.playButton, cssVar = K.cssVar;

  function fmt(v, d) {
    if (!isFinite(v)) return "-";
    var s = v.toFixed(d === undefined ? 3 : d);
    return s === "-0.000" ? "0.000" : s.replace("-", "−");
  }

  function pressed(row, active) {
    row.querySelectorAll("button[data-choice]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b === active));
    });
  }

  /* -------------------------------------------- secant to tangent */
  var FUNCS = {
    sq: { label: "x²", f: function (x) { return x * x; }, d: function (x) { return 2 * x; },
      x: [-3, 3], y: [-1, 9], a: 1 },
    cube: { label: "x³", f: function (x) { return x * x * x; }, d: function (x) { return 3 * x * x; },
      x: [-2.2, 2.2], y: [-8, 8], a: 1 },
    sin: { label: "sin x", f: Math.sin, d: Math.cos,
      x: [-2 * Math.PI, 2 * Math.PI], y: [-1.8, 1.8], a: 0.8 },
    exp: { label: "eˣ", f: Math.exp, d: Math.exp,
      x: [-3, 2.2], y: [-0.5, 8], a: 0.5 }
  };

  function demoSecant(ctx) {
    var key = "sq", F = FUNCS[key], a = F.a, h = 1.5, shrinking = false;
    var plot = new Plot(ctx.canvas, {
      xmin: F.x[0], xmax: F.x[1], ymin: F.y[0], ymax: F.y[1], xlabel: "x", ylabel: "y"
    });

    var row = buttonRow(ctx.controls);
    Object.keys(FUNCS).forEach(function (k) {
      var b = button(row, "f(x) = " + FUNCS[k].label, function () {
        key = k; F = FUNCS[k]; a = F.a;
        aSlider.el.min = F.x[0] + 0.5; aSlider.el.max = F.x[1] - 0.5;
        aSlider.set(a);
        plot.set({ xmin: F.x[0], xmax: F.x[1], ymin: F.y[0], ymax: F.y[1], xlabel: "x", ylabel: "y" });
        pressed(row, b);
        draw();
      });
      b.dataset.choice = k;
      if (k === key) b.setAttribute("aria-pressed", "true");
    });

    var aSlider = slider(ctx.controls, {
      label: "Point P at x =", min: F.x[0] + 0.5, max: F.x[1] - 0.5, step: 0.05, value: a,
      format: function (v) { return fmt(v, 2); },
      onInput: function (v) { a = v; draw(); }
    });
    var hSlider = slider(ctx.controls, {
      label: "Step h", min: -2, max: 2, step: 0.01, value: h,
      format: function (v) { return fmt(v, 2); },
      onInput: function (v) { h = v; setShrinking(false); draw(); }
    });

    var row2 = buttonRow(ctx.controls);
    var shrinkBtn = button(row2, "Shrink h towards 0", function () {
      if (!shrinking && Math.abs(h) < 0.02) { h = 1.5; hSlider.set(h); }
      setShrinking(!shrinking);
    });
    function setShrinking(on) {
      shrinking = on;
      shrinkBtn.textContent = on ? "Stop" : "Shrink h towards 0";
      ctx.setLive(!on);
    }
    ctx.setLive(true);

    function lineAcross(m, x0, y0) {
      return [[plot.xmin, plot.xmax], [y0 + m * (plot.xmin - x0), y0 + m * (plot.xmax - x0)]];
    }

    function draw() {
      var xs = [], ys = [], i;
      for (i = 0; i <= 400; i++) {
        var x = plot.xmin + (plot.xmax - plot.xmin) * i / 400;
        xs.push(x); ys.push(F.f(x));
      }
      var accent = cssVar("--accent", "#2f7a2a"), ref = cssVar("--plot-ref", "#999");
      var ink = cssVar("--ink", "#000"), second = cssVar("--plot-2", "#3b6fd6");
      var fa = F.f(a), tangent = F.d(a);

      plot.frame();
      plot.line(xs, ys, ink, 2);
      var t = lineAcross(tangent, a, fa);
      plot.line(t[0], t[1], ref, 2, [6, 5]);

      var legend = [
        { label: "f(x) = " + F.label, color: ink },
        { label: "tangent at P", color: ref, dash: [6, 5] }
      ];

      var tooSmall = Math.abs(h) < 0.005;
      var sec = NaN;
      if (!tooSmall) {
        var fb = F.f(a + h);
        sec = (fb - fa) / h;
        var s = lineAcross(sec, a, fa);
        plot.line(s[0], s[1], accent, 2.5);
        plot.dot(a + h, fb, second, 5);
        legend.splice(1, 0, { label: "secant PQ", color: accent });
      }
      plot.dot(a, fa, accent, 5.5);
      plot.legend(legend);

      if (tooSmall) {
        ctx.say("h is essentially zero, so P and Q coincide and the secant is undefined " +
          "(0/0). The tangent gradient is <b>f′(" + fmt(a, 2) + ") = " + fmt(tangent) + "</b>.");
      } else {
        ctx.say("Secant gradient <b>(f(a + h) − f(a)) / h = " + fmt(sec) + "</b> · " +
          "tangent gradient <b>f′(" + fmt(a, 2) + ") = " + fmt(tangent) + "</b> · " +
          "difference " + fmt(Math.abs(sec - tangent)));
      }
      ctx.setAlt("Graph of y = " + F.label + " with a secant through x = " + fmt(a, 2) +
        " and x = " + fmt(a + h, 2) + ", and the tangent at x = " + fmt(a, 2) + ".");
    }

    function tick() {
      if (!shrinking) return;
      h *= 0.965;
      if (Math.abs(h) < 0.01) { h = h < 0 ? -0.01 : 0.01; setShrinking(false); }
      hSlider.set(Number(h.toFixed(2)));
      draw();
    }

    draw();
    return { draw: draw, tick: tick, plot: plot };
  }

  /* --------------------------------------------- mass on a spring */
  function demoSHM(ctx) {
    var m = 0.5, k = 50, x0 = 0.05, t = 0, playing = !K.REDUCED;
    var showV = true, showA = true;
    var plot = new Plot(ctx.canvas, {
      xmin: 0, xmax: 1, ymin: -1.2, ymax: 1.2,
      xlabel: "time t / s", ylabel: "fraction of maximum value", ylabelShort: "÷ max"
    });

    function omega() { return Math.sqrt(k / m); }
    function period() { return 2 * Math.PI / omega(); }
    function rescale() {
      plot.set({ xmin: 0, xmax: 2 * period(), ymin: -1.2, ymax: 1.2,
        xlabel: "time t / s", ylabel: "fraction of maximum value", ylabelShort: "÷ max" });
    }

    slider(ctx.controls, { label: "Mass m", min: 0.1, max: 2, step: 0.05, value: m,
      format: function (v) { return v.toFixed(2) + " kg"; },
      onInput: function (v) { m = v; rescale(); draw(); } });
    slider(ctx.controls, { label: "Spring constant k", min: 10, max: 200, step: 5, value: k,
      format: function (v) { return v + " N/m"; },
      onInput: function (v) { k = v; rescale(); draw(); } });
    slider(ctx.controls, { label: "Amplitude x₀", min: 0.01, max: 0.1, step: 0.005, value: x0,
      format: function (v) { return (v * 100).toFixed(1) + " cm"; },
      onInput: function (v) { x0 = v; draw(); } });

    var row = buttonRow(ctx.controls);
    playButton(row, ctx, function () { return playing; }, function (v) { playing = v; });
    var vBtn = button(row, "Velocity", function () {
      showV = !showV; vBtn.setAttribute("aria-pressed", String(showV)); draw();
    });
    var aBtn = button(row, "Acceleration", function () {
      showA = !showA; aBtn.setAttribute("aria-pressed", String(showA)); draw();
    });
    vBtn.setAttribute("aria-pressed", "true");
    aBtn.setAttribute("aria-pressed", "true");

    function drawSpring(phase) {
      var g = plot.ctx, p = plot.pad;
      var left = plot.w - p.r + 18, right = plot.w - 12;
      if (right - left < 36) return;
      var cx = (left + right) / 2, top = p.t + 4;
      var mid = p.t + (plot.h - p.t - p.b) * 0.55;
      var amp = (plot.h - p.t - p.b) * 0.22 * (x0 / 0.1);
      var y = mid + phase * amp;        // drawn with positive displacement downwards
      var boxW = Math.min(44, right - left), boxH = 30;

      g.save();
      g.strokeStyle = cssVar("--ink-soft", "#666"); g.lineWidth = 2;
      g.beginPath(); g.moveTo(left, top); g.lineTo(right, top); g.stroke();
      g.beginPath(); g.moveTo(cx, top);
      var coils = 9, sTop = top + 8, sBot = y - boxH / 2 - 6;
      g.lineTo(cx, sTop);
      for (var i = 0; i < coils; i++) {
        var yy = sTop + (sBot - sTop) * (i + 0.5) / coils;
        g.lineTo(cx + (i % 2 ? -9 : 9), yy);
      }
      g.lineTo(cx, sBot); g.lineTo(cx, y - boxH / 2); g.stroke();

      g.setLineDash([4, 4]); g.strokeStyle = cssVar("--plot-grid", "#ddd");
      g.beginPath(); g.moveTo(left, mid); g.lineTo(right, mid); g.stroke(); g.setLineDash([]);

      g.fillStyle = cssVar("--accent", "#2f7a2a");
      g.fillRect(cx - boxW / 2, y - boxH / 2, boxW, boxH);
      g.fillStyle = "#fff"; g.font = "600 11px ui-sans-serif, system-ui, sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(m.toFixed(2) + " kg", cx, y);
      g.fillStyle = cssVar("--ink-soft", "#666"); g.textBaseline = "bottom";
      g.fillText("equilibrium", cx, mid - 4);
      g.restore();
    }

    function draw() {
      var w = omega(), T = period();
      plot.pad.r = plot.w < 560 ? 76 : 120;
      var xs = [], xn = [], vn = [], an = [];
      for (var i = 0; i <= 400; i++) {
        var tt = plot.xmax * i / 400;
        xs.push(tt);
        xn.push(Math.cos(w * tt));
        vn.push(-Math.sin(w * tt));
        an.push(-Math.cos(w * tt));
      }
      var accent = cssVar("--accent", "#2f7a2a"), second = cssVar("--plot-2", "#3b6fd6");
      var ref = cssVar("--plot-ref", "#999");
      var tc = t % plot.xmax, phase = Math.cos(w * t);

      plot.frame();
      if (showA) plot.line(xs, an, ref, 2, [6, 5]);
      if (showV) plot.line(xs, vn, second, 2);
      plot.line(xs, xn, accent, 2.5);
      plot.vline(tc, cssVar("--ink-soft", "#666"));
      plot.dot(tc, phase, accent, 5);
      if (showV) plot.dot(tc, -Math.sin(w * t), second, 4.5);
      if (showA) plot.dot(tc, -phase, ref, 4.5);

      var items = [{ label: "x / x₀", color: accent }];
      if (showV) items.push({ label: "v / v_max", color: second });
      if (showA) items.push({ label: "a / a_max", color: ref, dash: [6, 5] });
      plot.legend(items);
      drawSpring(phase);

      var ek = 1 - phase * phase;
      ctx.say("ω = <b>" + w.toFixed(2) + " rad s⁻¹</b> · T = <b>" + T.toFixed(3) + " s</b> · " +
        "v<sub>max</sub> = ωx₀ = <b>" + (w * x0).toFixed(3) + " m s⁻¹</b> · " +
        "a<sub>max</sub> = ω²x₀ = <b>" + (w * w * x0).toFixed(2) + " m s⁻²</b> · " +
        "energy now " + Math.round(ek * 100) + "% kinetic, " + Math.round((1 - ek) * 100) + "% potential");
      ctx.setAlt("Displacement, velocity and acceleration of a mass on a spring over two periods of " +
        T.toFixed(2) + " seconds.");
    }

    function tick(dt) {
      if (!playing) return;
      t += dt / 1000;
      draw();
    }

    rescale();
    draw();
    return { draw: draw, tick: tick, plot: plot };
  }

  /* ---------------------------------------------- radioactive decay */
  function demoDecay(ctx) {
    var N0 = 200, half = 3, logView = false, playing = !K.REDUCED;
    var alive, t, hist, done;
    var plot = new Plot(ctx.canvas, {
      xmin: 0, xmax: 5 * half, ymin: 0, ymax: N0, xlabel: "time t / s",
      ylabel: "undecayed nuclei N", ylabelShort: "N"
    });

    function rescale() {
      plot.set(logView
        ? { xmin: 0, xmax: 5 * half, ymin: 0, ymax: Math.log(N0) * 1.05,
            xlabel: "time t / s", ylabel: "ln N", ylabelShort: "ln N" }
        : { xmin: 0, xmax: 5 * half, ymin: 0, ymax: N0 * 1.05,
            xlabel: "time t / s", ylabel: "undecayed nuclei N", ylabelShort: "N" });
    }

    function restart() {
      alive = []; for (var i = 0; i < N0; i++) alive.push(true);
      t = 0; hist = [[0, N0]]; done = false;
      rescale(); draw();
    }

    slider(ctx.controls, { label: "Starting nuclei N₀", min: 40, max: 400, step: 10, value: N0,
      format: String, onInput: function (v) { N0 = v; restart(); } });
    slider(ctx.controls, { label: "Half-life T½", min: 1, max: 8, step: 0.5, value: half,
      format: function (v) { return v.toFixed(1) + " s"; },
      onInput: function (v) { half = v; restart(); } });

    var row = buttonRow(ctx.controls);
    var play = playButton(row, ctx, function () { return playing; }, function (v) {
      playing = v;
      if (v && done) restart();
    });
    button(row, "Restart", function () { restart(); });
    var lnBtn = button(row, "Show ln N", function () {
      logView = !logView; lnBtn.setAttribute("aria-pressed", String(logView));
      rescale(); draw();
    });
    lnBtn.setAttribute("aria-pressed", "false");

    function count() { var n = 0; for (var i = 0; i < alive.length; i++) if (alive[i]) n++; return n; }
    function yv(n) { return logView ? (n > 0 ? Math.log(n) : NaN) : n; }

    function drawNuclei() {
      var g = plot.ctx, p = plot.pad;
      var cols = Math.ceil(Math.sqrt(N0 * 1.5)), rows = Math.ceil(N0 / cols);
      var cell = Math.max(4, Math.min(9, (plot.w * 0.3) / cols));
      var bw = cols * cell + 16, bh = rows * cell + 16;
      var x0 = plot.w - p.r - bw - 6, y0 = p.t + 6;
      if (x0 < p.l + 40) return;
      plot.plate(x0, y0, bw, bh);
      var accent = cssVar("--accent", "#2f7a2a"), ref = cssVar("--plot-ref", "#999");
      g.save();
      for (var i = 0; i < N0; i++) {
        var cx = x0 + 8 + (i % cols + 0.5) * cell, cy = y0 + 8 + (Math.floor(i / cols) + 0.5) * cell;
        g.beginPath(); g.arc(cx, cy, cell * 0.36, 0, Math.PI * 2);
        if (alive[i]) { g.fillStyle = accent; g.fill(); }
        else { g.strokeStyle = ref; g.lineWidth = 1; g.stroke(); }
      }
      g.restore();
    }

    function draw() {
      var lam = Math.LN2 / half, n = count();
      var accent = cssVar("--accent", "#2f7a2a"), ref = cssVar("--plot-ref", "#999");
      plot.frame();

      for (var k = 1; k < 5; k++) plot.vline(k * half, ref, k === 1 ? "T½" : k + "T½");

      var tx = [], ty = [];
      for (var i = 0; i <= 200; i++) {
        var tt = plot.xmax * i / 200;
        tx.push(tt); ty.push(yv(N0 * Math.exp(-lam * tt)));
      }
      plot.line(tx, ty, ref, 2, [6, 5]);
      plot.line(hist.map(function (h) { return h[0]; }),
        hist.map(function (h) { return yv(h[1]); }), accent, 2.5);
      if (n > 0) plot.dot(t, yv(n), accent, 5);
      drawNuclei();
      plot.legend([
        { label: "simulation", color: accent },
        { label: logView ? "ln N₀ − λt" : "N₀e^(−λt)", color: ref, dash: [6, 5] }
      ]);

      var predicted = N0 * Math.exp(-lam * t);
      ctx.say("t = <b>" + t.toFixed(1) + " s</b> (" + (t / half).toFixed(2) + " half-lives) · " +
        "<b>" + n + "</b> nuclei left · prediction N₀(½)<sup>t/T½</sup> = <b>" + predicted.toFixed(1) + "</b> · " +
        "λ = ln 2 / T½ = <b>" + lam.toFixed(3) + " s⁻¹</b>");
      ctx.setAlt("Decay of " + N0 + " nuclei with half-life " + half + " s. After " + t.toFixed(1) +
        " seconds, " + n + " remain; the exponential law predicts " + predicted.toFixed(0) + ".");
    }

    function tick(dt) {
      if (!playing || done) return;
      var step = dt / 1000, lam = Math.LN2 / half, p = 1 - Math.exp(-lam * step);
      for (var i = 0; i < alive.length; i++) if (alive[i] && Math.random() < p) alive[i] = false;
      t += step;
      hist.push([t, count()]);
      if (t >= plot.xmax || count() === 0) { done = true; play.stop(); }
      draw();
    }

    restart();
    return { draw: draw, tick: tick, plot: plot };
  }

  window.registerDemo("secant", demoSecant);
  window.registerDemo("shm", demoSHM);
  window.registerDemo("decay", demoDecay);
})();
