/* Browser ports of the three Python visualisations.
   The maths here deliberately mirrors the .py files line for line, so the
   animation and the code you download agree with each other. */
(function () {
  "use strict";

  /* ---------------------------------------------------------------- plot */
  function cssVar(name, fallback) {
    var v = getComputedStyle(document.body).getPropertyValue(name).trim();
    return v || fallback;
  }

  function Plot(canvas, opts) {
    this.c = canvas;
    this.ctx = canvas.getContext("2d");
    this.pad = { l: 62, r: 18, t: 18, b: 46 };
    this.set(opts);
    this.resize();
  }

  Plot.prototype.set = function (o) {
    this.xmin = o.xmin; this.xmax = o.xmax;
    this.ymin = o.ymin; this.ymax = o.ymax;
    this.xlabel = o.xlabel || ""; this.ylabel = o.ylabel || "";
    this.xticks = o.xticks || 6; this.yticks = o.yticks || 5;
    this.fmtX = o.fmtX || function (v) { return trim(v); };
    this.fmtY = o.fmtY || function (v) { return trim(v); };
  };

  function trim(v) {
    var a = Math.abs(v);
    if (a >= 1e6 || (v !== 0 && a < 0.001)) return v.toExponential(1);
    if (a >= 100) return String(Math.round(v));
    if (a >= 1) return String(Math.round(v * 10) / 10);
    return String(Math.round(v * 1000) / 1000);
  }

  Plot.prototype.resize = function () {
    var dpr = window.devicePixelRatio || 1;
    var w = this.c.clientWidth || 900;
    var h = Math.round(w * 480 / 900);
    this.w = w; this.h = h;
    this.c.width = Math.round(w * dpr);
    this.c.height = Math.round(h * dpr);
    this.c.style.height = h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  Plot.prototype.px = function (x) {
    var p = this.pad;
    return p.l + (x - this.xmin) / (this.xmax - this.xmin) * (this.w - p.l - p.r);
  };
  Plot.prototype.py = function (y) {
    var p = this.pad;
    return this.h - p.b - (y - this.ymin) / (this.ymax - this.ymin) * (this.h - p.t - p.b);
  };

  Plot.prototype.frame = function () {
    var ctx = this.ctx, p = this.pad;
    var ink = cssVar("--ink", "#000"), soft = cssVar("--ink-soft", "#666");
    var border = cssVar("--border", "#ddd");

    ctx.clearRect(0, 0, this.w, this.h);
    ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
    ctx.lineWidth = 1;

    // gridlines + tick labels
    ctx.strokeStyle = border;
    ctx.fillStyle = soft;
    var i, v, X, Y;
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (i = 0; i <= this.xticks; i++) {
      v = this.xmin + (this.xmax - this.xmin) * i / this.xticks;
      X = this.px(v);
      ctx.beginPath(); ctx.moveTo(X, p.t); ctx.lineTo(X, this.h - p.b); ctx.stroke();
      ctx.fillText(this.fmtX(v), X, this.h - p.b + 7);
    }
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (i = 0; i <= this.yticks; i++) {
      v = this.ymin + (this.ymax - this.ymin) * i / this.yticks;
      Y = this.py(v);
      ctx.beginPath(); ctx.moveTo(p.l, Y); ctx.lineTo(this.w - p.r, Y); ctx.stroke();
      ctx.fillText(this.fmtY(v), p.l - 8, Y);
    }

    // axis labels
    ctx.fillStyle = soft;
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillText(this.xlabel, (p.l + this.w - p.r) / 2, this.h - 6);
    ctx.save();
    ctx.translate(13, (p.t + this.h - p.b) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(this.ylabel, 0, 0);
    ctx.restore();

    // axis spines
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(p.l, p.t); ctx.lineTo(p.l, this.h - p.b); ctx.lineTo(this.w - p.r, this.h - p.b);
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  Plot.prototype.clip = function (fn) {
    var ctx = this.ctx, p = this.pad;
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.l, p.t, this.w - p.l - p.r, this.h - p.t - p.b);
    ctx.clip();
    fn();
    ctx.restore();
  };

  Plot.prototype.line = function (xs, ys, color, width, dash) {
    var ctx = this.ctx, self = this;
    this.clip(function () {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = width || 2;
      ctx.setLineDash(dash || []);
      ctx.lineJoin = "round";
      for (var i = 0; i < xs.length; i++) {
        var X = self.px(xs[i]), Y = self.py(ys[i]);
        if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    });
  };

  Plot.prototype.fillUnder = function (xs, ys, color, fromX) {
    var ctx = this.ctx, self = this;
    this.clip(function () {
      ctx.beginPath();
      ctx.fillStyle = color;
      var started = false;
      for (var i = 0; i < xs.length; i++) {
        if (xs[i] < fromX) continue;
        var X = self.px(xs[i]), Y = self.py(ys[i]);
        if (!started) { ctx.moveTo(X, self.py(self.ymin)); started = true; }
        ctx.lineTo(X, Y);
      }
      if (started) {
        ctx.lineTo(self.px(xs[xs.length - 1]), self.py(self.ymin));
        ctx.closePath();
        ctx.fill();
      }
    });
  };

  Plot.prototype.vline = function (x, color, label) {
    var ctx = this.ctx, p = this.pad, X = this.px(x);
    if (X < p.l || X > this.w - p.r) return;
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(X, p.t); ctx.lineTo(X, this.h - p.b); ctx.stroke();
    ctx.setLineDash([]);
    if (label) {
      ctx.fillStyle = color;
      ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = X > this.w - 120 ? "right" : "left";
      ctx.textBaseline = "top";
      ctx.textBaseline = "bottom";
      ctx.fillText(label, X + (X > this.w - 120 ? -6 : 6), this.h - p.b - 6);
    }
    ctx.restore();
  };

  Plot.prototype.dot = function (x, y, color, r) {
    var ctx = this.ctx;
    var self = this;
    this.clip(function () {
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(self.px(x), self.py(y), r || 5, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  Plot.prototype.legend = function (items) {
    var ctx = this.ctx, p = this.pad;
    var x = this.w - p.r - 10, y = p.t + 8;
    ctx.save();
    ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    items.forEach(function (it) {
      ctx.fillStyle = cssVar("--ink", "#000");
      ctx.fillText(it.label, x - 26, y);
      ctx.strokeStyle = it.color;
      ctx.lineWidth = it.width || 2.5;
      ctx.setLineDash(it.dash || []);
      ctx.beginPath(); ctx.moveTo(x - 22, y); ctx.lineTo(x, y); ctx.stroke();
      ctx.setLineDash([]);
      y += 18;
    });
    ctx.restore();
  };

  /* ------------------------------------------------------------ controls */
  function slider(host, opts) {
    var wrap = document.createElement("label");
    wrap.className = "ctl";
    var name = document.createElement("span");
    name.textContent = opts.label;
    var input = document.createElement("input");
    input.type = "range";
    input.min = opts.min; input.max = opts.max;
    input.step = opts.step || 1; input.value = opts.value;
    var out = document.createElement("output");
    function show() { out.textContent = opts.format(Number(input.value)); }
    input.addEventListener("input", function () { show(); opts.onInput(Number(input.value)); });
    show();
    wrap.append(name, input, out);
    host.appendChild(wrap);
    return {
      el: input,
      get: function () { return Number(input.value); },
      set: function (v) { input.value = v; show(); }
    };
  }

  function buttonRow(host) {
    var row = document.createElement("div");
    row.className = "ctl-row";
    host.appendChild(row);
    return row;
  }

  function button(row, label, onClick) {
    var b = document.createElement("button");
    b.className = "btn";
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", function () { onClick(b); });
    row.appendChild(b);
    return b;
  }

  /* --------------------------------------------------------- 1. Taylor */
  var FACT = [1];
  for (var f = 1; f < 30; f++) FACT[f] = FACT[f - 1] * f;

  function taylorSin(x, nTerms) {
    var total = 0;
    for (var k = 0; k < nTerms; k++) {
      var p = 2 * k + 1;
      total += Math.pow(-1, k) * Math.pow(x, p) / FACT[p];
    }
    return total;
  }

  function demoTaylor(ctx) {
    var MAX_TERMS = 10;
    var plot = new Plot(ctx.canvas, {
      xmin: -4 * Math.PI, xmax: 4 * Math.PI, ymin: -3, ymax: 3,
      xlabel: "x", ylabel: "y", xticks: 8, yticks: 6
    });

    var xs = [];
    for (var i = 0; i <= 700; i++) xs.push(-4 * Math.PI + (8 * Math.PI) * i / 700);
    var exact = xs.map(Math.sin);

    var n = 1, playing = true, lastStep = 0;

    var nSlider = slider(ctx.controls, {
      label: "Terms", min: 1, max: MAX_TERMS, value: 1,
      format: function (v) { return String(v); },
      onInput: function (v) { n = v; playing = false; playBtn.textContent = "Play"; draw(); }
    });

    var row = buttonRow(ctx.controls);
    var playBtn = button(row, "Pause", function (b) {
      playing = !playing;
      b.textContent = playing ? "Pause" : "Play";
    });

    function draw() {
      plot.frame();
      plot.line(xs, exact, cssVar("--ink", "#000"), 2);
      var approx = xs.map(function (x) { return taylorSin(x, n); });
      plot.line(xs, approx, cssVar("--accent", "#b4341f"), 2.5);
      plot.vline(0, cssVar("--ink-soft", "#888"), "");
      plot.legend([
        { label: "sin(x)", color: cssVar("--ink", "#000") },
        { label: n + " term" + (n === 1 ? "" : "s"), color: cssVar("--accent", "#b4341f") }
      ]);

      // how far the approximation stays within 0.05 of sin(x)
      var good = 0;
      for (var i = 0; i < xs.length; i++) {
        if (xs[i] < 0) continue;
        if (Math.abs(approx[i] - exact[i]) > 0.05) break;
        good = xs[i];
      }
      ctx.readout.innerHTML =
        "Polynomial up to <b>x<sup>" + (2 * n - 1) + "</sup></b>. " +
        "It tracks sin(x) to within 0.05 out to about <b>x = ±" + good.toFixed(1) + "</b>" +
        " — then it escapes to infinity.";
    }

    function tick(dt, now) {
      if (!playing) return;
      if (now - lastStep < 900) return;
      lastStep = now;
      n = n % MAX_TERMS + 1;
      nSlider.set(n);
      draw();
    }

    draw();
    return { draw: draw, tick: tick, plot: plot };
  }

  /* ------------------------------------------------------ 2. Projectile */
  var G = 9.81, MASS = 0.145, DT = 0.001;

  function simulate(speed, angleDeg, dragK) {
    var th = angleDeg * Math.PI / 180;
    var vx = speed * Math.cos(th), vy = speed * Math.sin(th);
    var x = 0, y = 0, xs = [0], ys = [0], guard = 0;
    while (y >= 0 && guard++ < 200000) {
      var v = Math.hypot(vx, vy);
      var ax = -dragK * v * vx / MASS;
      var ay = -G - dragK * v * vy / MASS;
      vx += ax * DT; vy += ay * DT;
      x += vx * DT; y += vy * DT;
      xs.push(x); ys.push(y);
    }
    return { xs: xs, ys: ys, range: xs[xs.length - 1] };
  }

  function bestAngle(speed, dragK) {
    var best = 10, bestR = -1;
    for (var a = 10; a <= 80; a++) {
      var r = simulate(speed, a, dragK).range;
      if (r > bestR) { bestR = r; best = a; }
    }
    return best;
  }

  function demoProjectile(ctx) {
    var speed = 40, angle = 45, dragK = 0.0013;
    var plot = new Plot(ctx.canvas, {
      xmin: 0, xmax: 180, ymin: 0, ymax: 70,
      xlabel: "horizontal distance / m", ylabel: "height / m", xticks: 6, yticks: 5
    });

    var drag = null, vac = null, optDrag = 45, optVac = 45;
    var progress = 0, playing = true;

    function recompute() {
      drag = simulate(speed, angle, dragK);
      vac = simulate(speed, angle, 0);
      optDrag = bestAngle(speed, dragK);
      optVac = bestAngle(speed, 0);
      var maxX = Math.max(vac.range, 20) * 1.08;
      var maxY = Math.max.apply(null, vac.ys) * 1.25 + 2;
      plot.set({
        xmin: 0, xmax: maxX, ymin: 0, ymax: maxY,
        xlabel: "horizontal distance / m", ylabel: "height / m", xticks: 6, yticks: 5
      });
      progress = 0;
    }

    slider(ctx.controls, {
      label: "Launch speed", min: 10, max: 90, value: speed,
      format: function (v) { return v + " m/s"; },
      onInput: function (v) { speed = v; recompute(); draw(); }
    });
    slider(ctx.controls, {
      label: "Launch angle", min: 10, max: 80, value: angle,
      format: function (v) { return v + "°"; },
      onInput: function (v) { angle = v; recompute(); draw(); }
    });
    slider(ctx.controls, {
      label: "Drag k", min: 0, max: 40, value: 13, step: 1,
      format: function (v) { return (v / 10000).toFixed(4); },
      onInput: function (v) { dragK = v / 10000; recompute(); draw(); }
    });

    var row = buttonRow(ctx.controls);
    var playBtn = button(row, "Pause", function (b) {
      playing = !playing; b.textContent = playing ? "Pause" : "Play";
    });
    button(row, "Jump to best angle", function () {
      angle = optDrag;
      ctx.controls.querySelectorAll("input[type=range]")[1].value = angle;
      ctx.controls.querySelectorAll("output")[1].textContent = angle + "°";
      recompute(); draw();
    });

    function draw() {
      plot.frame();
      plot.line(vac.xs, vac.ys, cssVar("--ink-soft", "#888"), 1.5, [6, 5]);
      plot.line(drag.xs, drag.ys, cssVar("--accent", "#b4341f"), 2.5);

      var idx = Math.min(drag.xs.length - 1, Math.floor(progress * (drag.xs.length - 1)));
      plot.dot(drag.xs[idx], drag.ys[idx], cssVar("--accent", "#b4341f"), 6);

      plot.legend([
        { label: "with drag", color: cssVar("--accent", "#b4341f") },
        { label: "vacuum", color: cssVar("--ink-soft", "#888"), width: 1.5, dash: [6, 5] }
      ]);

      var lost = vac.range - drag.range;
      ctx.readout.innerHTML =
        "Range <b>" + drag.range.toFixed(1) + " m</b> with drag vs <b>" +
        vac.range.toFixed(1) + " m</b> in a vacuum — drag costs <b>" +
        lost.toFixed(1) + " m</b> (" + (100 * lost / vac.range).toFixed(0) + "%). " +
        "Best angle here is <b>" + optDrag + "°</b>, not " + optVac + "°.";
    }

    function tick(dt) {
      if (!playing) return;
      progress += dt / 2200;
      if (progress > 1.15) progress = 0;
      draw();
    }

    recompute();
    draw();
    return { draw: draw, tick: tick, plot: plot };
  }

  /* ------------------------------------------------------- 3. Boltzmann */
  var K_B = 1.380649e-23, N_A = 6.02214076e23;

  function mbDistribution(v, T, mass) {
    var a = mass / (2 * K_B * T);
    return 4 * Math.PI * v * v * Math.pow(a / Math.PI, 1.5) * Math.exp(-a * v * v);
  }

  // Simpson's rule for the tail fraction above v_ea
  function fractionAbove(vEa, T, mass) {
    var hi = Math.max(vEa * 4, 6000), n = 2000;
    var h = (hi - vEa) / n, s = mbDistribution(vEa, T, mass) + mbDistribution(hi, T, mass);
    for (var i = 1; i < n; i++) {
      s += mbDistribution(vEa + i * h, T, mass) * (i % 2 ? 4 : 2);
    }
    return s * h / 3;
  }

  function demoBoltzmann(ctx) {
    var MASS = 0.028 / N_A;
    var T = 300, eaKJ = 50, playing = true, dir = 1, logY = true;
    var FLOOR = -14;   // log10 clamp, so zeros do not blow up the axis

    function applyScale() {
      if (logY) {
        plot.set({
          xmin: 0, xmax: 2500, ymin: FLOOR, ymax: -2,
          xlabel: "molecular speed / m s⁻¹",
          ylabel: "fraction of molecules (log scale)",
          xticks: 5, yticks: 6,
          fmtY: function (v) { return "1e" + Math.round(v); }
        });
      } else {
        plot.set({
          xmin: 0, xmax: 2500, ymin: 0, ymax: 0.0022,
          xlabel: "molecular speed / m s⁻¹",
          ylabel: "fraction of molecules",
          xticks: 5, yticks: 4,
          fmtY: function (v) { return v === 0 ? "0" : (v * 1000).toFixed(1) + "e-3"; }
        });
      }
    }

    var plot = new Plot(ctx.canvas, {
      xmin: 0, xmax: 2500, ymin: 0, ymax: 0.0022,
      xlabel: "molecular speed / m s⁻¹", ylabel: "fraction of molecules",
      xticks: 5, yticks: 4
    });
    applyScale();

    // map a density onto whichever axis is showing
    function ymap(y) {
      if (!logY) return y;
      return y <= 0 ? FLOOR : Math.max(FLOOR, Math.log(y) / Math.LN10);
    }

    var vs = [];
    for (var i = 0; i <= 600; i++) vs.push(2500 * i / 600);

    var tSlider = slider(ctx.controls, {
      label: "Temperature", min: 250, max: 600, value: T,
      format: function (v) { return v + " K"; },
      onInput: function (v) { T = v; playing = false; playBtn.textContent = "Play"; draw(); }
    });
    slider(ctx.controls, {
      label: "Activation energy", min: 10, max: 80, value: eaKJ,
      format: function (v) { return v + " kJ/mol"; },
      onInput: function (v) { eaKJ = v; draw(); }
    });

    var row = buttonRow(ctx.controls);
    var playBtn = button(row, "Pause", function (b) {
      playing = !playing; b.textContent = playing ? "Pause" : "Play";
    });
    var logBtn = button(row, "Log scale", function (b) {
      logY = !logY;
      b.setAttribute("aria-pressed", String(logY));
      applyScale();
      draw();
    });
    logBtn.setAttribute("aria-pressed", "true");

    function vEa() { return Math.sqrt(2 * (eaKJ * 1000 / N_A) / MASS); }

    function draw() {
      var ve = vEa();
      plot.frame();

      // faint reference curves so the shift in the peak is visible
      [300, 500].forEach(function (Tref) {
        var ysr = vs.map(function (v) { return ymap(mbDistribution(v, Tref, MASS)); });
        plot.line(vs, ysr, cssVar("--border", "#ddd"), 1.5);
      });

      var ys = vs.map(function (v) { return ymap(mbDistribution(v, T, MASS)); });
      plot.fillUnder(vs, ys, cssVar("--accent-soft", "#fbeeeb"), ve);
      plot.line(vs, ys, cssVar("--accent", "#b4341f"), 2.5);
      plot.vline(ve, cssVar("--ink", "#000"), "Ea = " + eaKJ + " kJ/mol");
      plot.legend([
        { label: Math.round(T) + " K", color: cssVar("--accent", "#b4341f") },
        { label: "300 K / 500 K", color: cssVar("--border", "#ddd"), width: 1.5 }
      ]);

      var frac = fractionAbove(ve, T, MASS);
      var base = fractionAbove(ve, 300, MASS);
      ctx.readout.innerHTML =
        "At <b>" + Math.round(T) + " K</b>, <b>" + frac.toExponential(2) +
        "</b> of molecules clear the barrier — that is <b>" +
        (frac / base).toFixed(2) + "×</b> the fraction at 300 K. " +
        (logY
          ? "On this log axis every gridline is 10x - watch the shaded tail climb."
          : "Notice how little the peak moves. The tail past Ea is far too small to see here, which is exactly why it needs a log axis.");
    }

    function tick(dt) {
      if (!playing) return;
      T += dir * dt * 0.05;
      if (T >= 600) { T = 600; dir = -1; }
      if (T <= 250) { T = 250; dir = 1; }
      tSlider.set(Math.round(T));
      draw();
    }

    draw();
    return { draw: draw, tick: tick, plot: plot };
  }

  /* ---------------------------------------------------------- registry */
  var BUILDERS = {
    taylor: demoTaylor,
    projectile: demoProjectile,
    boltzmann: demoBoltzmann
  };

  window.mountDemo = function (name, canvas, controls, readout) {
    var build = BUILDERS[name];
    if (!build) return null;

    var demo = build({ canvas: canvas, controls: controls, readout: readout });
    var raf = null, last = null, stopped = false;

    function loop(ts) {
      if (stopped) return;
      if (last === null) last = ts;
      var dt = Math.min(ts - last, 60);
      last = ts;
      demo.tick(dt, ts);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    function onResize() { if (demo.plot) demo.plot.resize(); demo.draw(); }
    window.addEventListener("resize", onResize);

    return {
      destroy: function () {
        stopped = true;
        if (raf) cancelAnimationFrame(raf);
        window.removeEventListener("resize", onResize);
      }
    };
  };
})();
