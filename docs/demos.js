/* Browser ports of the Python visualisations.
   The maths here deliberately mirrors the .py files line for line, so the
   animation and the code you download agree with each other. */
(function () {
  "use strict";

  var REDUCED = !!(window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  /* ------------------------------------------------------------ numbers */
  var SUPS = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²",
    "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷",
    "8": "⁸", "9": "⁹" };

  // Canvas cannot do <sup>, so exponents use the Unicode superscript block.
  function sup(n) {
    return String(n).split("").map(function (c) { return SUPS[c] || c; }).join("");
  }
  function sciText(v, digits) {
    var parts = v.toExponential(digits === undefined ? 1 : digits).split("e");
    return parts[0] + "×10" + sup(Number(parts[1]));
  }
  // Same thing for the HTML readouts, where real markup is available.
  function sciHTML(v, digits) {
    var parts = v.toExponential(digits === undefined ? 2 : digits).split("e");
    return parts[0] + " × 10<sup>" + Number(parts[1]) + "</sup>";
  }

  /* Ticks on round numbers. Dividing the range into N equal parts gives
     axes like 0, 29.4, 58.7, 88.1 - correct but unreadable. Snapping the
     step to 1/2/2.5/5 x 10^n is what makes a chart look finished. */
  function niceStep(span, target) {
    var raw = span / Math.max(1, target);
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    // Pick the round step whose tick COUNT lands closest to the target.
    // First-fit rounding-up quietly halves the tick count whenever the raw
    // step sits just above a power of ten (53/5 -> 10.6 -> 20 -> 3 ticks).
    var best = mag, bestErr = Infinity;
    [1, 2, 2.5, 5, 10].forEach(function (m) {
      var step = m * mag;
      var err = Math.abs(span / step - target);
      if (err < bestErr) { bestErr = err; best = step; }
    });
    return best;
  }

  // A log axis is labelled by exponent, so its step must be a whole number of
  // decades - a 2.5-decade step rounds to 10^-2, 10^-5, 10^-7, 10^-10, which
  // looks evenly spaced but is not.
  var DECADES = [1, 2, 3, 4, 5, 6, 10, 12, 20, 25, 50, 100];

  function niceTicks(min, max, target, integral) {
    var span = max - min;
    if (!(span > 0) || !isFinite(span)) return { ticks: [min], step: 1 };
    var step;
    if (integral) {
      var bestErr = Infinity;
      step = 1;
      DECADES.forEach(function (s) {
        var err = Math.abs(span / s - target);
        if (err < bestErr) { bestErr = err; step = s; }
      });
    } else {
      step = niceStep(span, target);
    }
    var eps = step * 1e-9;
    var out = [];
    for (var v = Math.ceil(min / step - 1e-9) * step; v <= max + eps; v += step) {
      out.push(Math.abs(v) < eps ? 0 : v);
    }
    return { ticks: out, step: step };
  }

  function stepFmt(step) {
    var d = Math.max(0, -Math.floor(Math.log(step) / Math.LN10 + 1e-9));
    return function (v) {
      if (v === 0) return "0";
      var a = Math.abs(v);
      if (a >= 1e5 || a < 1e-4) return sciText(v, 0);
      return v.toFixed(Math.min(6, d));
    };
  }

  /* ---------------------------------------------------------------- plot */
  function cssVar(name, fallback) {
    var v = getComputedStyle(document.body).getPropertyValue(name).trim();
    return v || fallback;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function Plot(canvas, opts) {
    this.c = canvas;
    this.ctx = canvas.getContext("2d");
    this.w = 900; this.h = 480;
    this.fs = 11;
    this.pad = { l: 62, r: 18, t: 18, b: 46 };
    this.set(opts);
    this.resize();
  }

  Plot.prototype.set = function (o) {
    this.xmin = o.xmin; this.xmax = o.xmax;
    this.ymin = o.ymin; this.ymax = o.ymax;
    this.xlabel = o.xlabel || ""; this.ylabel = o.ylabel || "";
    this.ylabelShort = o.ylabelShort || "";
    this.xtarget = o.xticks || 6; this.ytarget = o.yticks || 5;
    this.userFmtX = o.fmtX || null; this.userFmtY = o.fmtY || null;
    this.yIntegral = !!o.yIntegral;
    this.retick();
  };

  Plot.prototype.retick = function () {
    // Narrow canvases get fewer ticks, or the labels collide.
    var narrow = this.w < 560;
    var xt = niceTicks(this.xmin, this.xmax, narrow ? Math.min(4, this.xtarget) : this.xtarget);
    var yt = niceTicks(this.ymin, this.ymax,
      narrow ? Math.min(4, this.ytarget) : this.ytarget, this.yIntegral);
    this.xTicks = xt.ticks; this.yTicks = yt.ticks;
    this.fmtX = this.userFmtX || stepFmt(xt.step);
    this.fmtY = this.userFmtY || stepFmt(yt.step);
  };

  Plot.prototype.resize = function () {
    var dpr = window.devicePixelRatio || 1;
    var w = this.c.clientWidth || 900;

    // A 900x480 plot squeezed to phone width is 176px tall and unreadable.
    // Below ~400px the axis padding alone eats most of the height, so the
    // plot area needs a taller box again to keep the curve worth looking at.
    var ratio = w < 400 ? 0.95 : w < 560 ? 0.82 : w < 760 ? 0.66 : 480 / 900;
    var h = Math.round(w * ratio);

    this.fs = w < 560 ? 10 : 11;
    this.pad = w < 560
      ? { l: 56, r: 12, t: 14, b: 42 }
      : { l: 62, r: 18, t: 18, b: 46 };

    this.w = w; this.h = h;
    this.c.width = Math.round(w * dpr);
    this.c.height = Math.round(h * dpr);
    this.c.style.height = h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.retick();
  };

  Plot.prototype.px = function (x) {
    var p = this.pad;
    return p.l + (x - this.xmin) / (this.xmax - this.xmin) * (this.w - p.l - p.r);
  };
  Plot.prototype.py = function (y) {
    var p = this.pad;
    return this.h - p.b - (y - this.ymin) / (this.ymax - this.ymin) * (this.h - p.t - p.b);
  };

  // Shrink or truncate a label until it fits the space it is drawn into.
  Plot.prototype.fit = function (text, avail, alt) {
    var ctx = this.ctx;
    if (ctx.measureText(text).width <= avail) return text;
    if (alt && ctx.measureText(alt).width <= avail) return alt;
    var s = alt || text;
    while (s.length > 3 && ctx.measureText(s + "…").width > avail) s = s.slice(0, -1);
    return s + "…";
  };

  Plot.prototype.frame = function () {
    var ctx = this.ctx, p = this.pad;
    var ink = cssVar("--ink", "#000"), soft = cssVar("--ink-soft", "#666");
    var grid = cssVar("--plot-grid", "#ddd");

    ctx.clearRect(0, 0, this.w, this.h);
    ctx.font = this.fs + "px ui-sans-serif, system-ui, sans-serif";
    ctx.lineWidth = 1;

    ctx.strokeStyle = grid;
    ctx.fillStyle = soft;
    var i, X, Y;

    ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (i = 0; i < this.xTicks.length; i++) {
      X = this.px(this.xTicks[i]);
      ctx.beginPath(); ctx.moveTo(X, p.t); ctx.lineTo(X, this.h - p.b); ctx.stroke();
      ctx.fillText(this.fmtX(this.xTicks[i]), X, this.h - p.b + 7);
    }
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (i = 0; i < this.yTicks.length; i++) {
      Y = this.py(this.yTicks[i]);
      ctx.beginPath(); ctx.moveTo(p.l, Y); ctx.lineTo(this.w - p.r, Y); ctx.stroke();
      ctx.fillText(this.fmtY(this.yTicks[i]), p.l - 6, Y);
    }

    // axis labels, clipped to the space they actually have
    ctx.fillStyle = soft;
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillText(this.fit(this.xlabel, this.w - p.l - p.r),
      (p.l + this.w - p.r) / 2, this.h - 6);

    ctx.save();
    ctx.translate(this.fs, (p.t + this.h - p.b) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = "middle";
    ctx.fillText(this.fit(this.ylabel, this.h - p.t - p.b, this.ylabelShort), 0, 0);
    ctx.restore();

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
      var started = false, lastX = fromX;
      for (var i = 0; i < xs.length; i++) {
        if (xs[i] < fromX) continue;
        var X = self.px(xs[i]), Y = self.py(ys[i]);
        if (!started) { ctx.moveTo(X, self.py(self.ymin)); started = true; }
        ctx.lineTo(X, Y);
        lastX = xs[i];
      }
      if (started) {
        ctx.lineTo(self.px(lastX), self.py(self.ymin));
        ctx.closePath();
        ctx.fill();
      }
    });
  };

  // A small opaque plate behind floating text, so labels never fight
  // gridlines or curves for legibility.
  Plot.prototype.plate = function (x, y, w, h) {
    var ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = cssVar("--surface", "#fff");
    roundRect(ctx, x, y, w, h, 6); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = cssVar("--border", "#ddd");
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, h, 6); ctx.stroke();
    ctx.restore();
  };

  Plot.prototype.vline = function (x, color, label) {
    var ctx = this.ctx, p = this.pad, X = this.px(x);
    if (X < p.l || X > this.w - p.r) return;
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(X, p.t); ctx.lineTo(X, this.h - p.b); ctx.stroke();
    ctx.setLineDash([]);
    if (label) {
      ctx.font = "600 " + this.fs + "px ui-sans-serif, system-ui, sans-serif";
      var tw = ctx.measureText(label).width;
      var right = X + tw + 16 < this.w - p.r;
      var bx = right ? X + 6 : X - tw - 18;
      var by = this.h - p.b - this.fs - 14;
      this.plate(bx, by, tw + 12, this.fs + 10);
      ctx.fillStyle = color;
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(label, bx + 6, by + (this.fs + 10) / 2);
    }
    ctx.restore();
  };

  Plot.prototype.dot = function (x, y, color, r) {
    var ctx = this.ctx, self = this;
    this.clip(function () {
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(self.px(x), self.py(y), r || 5, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  Plot.prototype.legend = function (items) {
    var ctx = this.ctx, p = this.pad, fs = this.fs, self = this;
    ctx.save();
    ctx.font = fs + "px ui-sans-serif, system-ui, sans-serif";

    var sw = 20, gap = 8, padX = 9, lh = fs + 8;
    var tw = 0;
    items.forEach(function (it) { tw = Math.max(tw, ctx.measureText(it.label).width); });
    var boxW = tw + sw + gap + padX * 2;
    var boxH = items.length * lh + 8;
    var x0 = this.w - p.r - boxW - 4, y0 = p.t + 4;

    this.plate(x0, y0, boxW, boxH);

    var y = y0 + 4 + lh / 2;
    items.forEach(function (it) {
      ctx.strokeStyle = it.color;
      ctx.lineWidth = it.width || 2.5;
      ctx.setLineDash(it.dash || []);
      ctx.beginPath();
      ctx.moveTo(x0 + padX, y); ctx.lineTo(x0 + padX + sw, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = cssVar("--ink", "#000");
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(it.label, x0 + padX + sw + gap, y);
      y += lh;
    });
    ctx.restore();
    return { x: x0, y: y0, w: boxW, h: boxH };
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

  // Play/pause that also flips the readout's live region: while a demo is
  // animating, an aria-live readout would fire dozens of times a second.
  function playButton(row, ctx, get, set) {
    var b = button(row, get() ? "Pause" : "Play", function () {
      set(!get());
      b.textContent = get() ? "Pause" : "Play";
      ctx.setLive(!get());
    });
    ctx.setLive(!get());
    return {
      el: b,
      stop: function () { set(false); b.textContent = "Play"; ctx.setLive(true); }
    };
  }

  /* --------------------------------------------------------- 1. Taylor */
  // Every factorial up to 22! is exact in a double, so these coefficients
  // are the same numbers Python gets from math.factorial.
  var FACT = [1];
  for (var f = 1; f < 30; f++) FACT[f] = FACT[f - 1] * f;

  /* Same registry as SERIES in taylor_series.py. term(k) gives
     [coefficient, power] of the k-th NON-ZERO term, all centred on x = 0.
     radius is how far from 0 the series converges. */
  var SERIES = {
    "sin(x)": {
      exact: Math.sin,
      term: function (k) { return [Math.pow(-1, k) / FACT[2 * k + 1], 2 * k + 1]; },
      xlim: [-4 * Math.PI, 4 * Math.PI], ylim: [-3, 3], radius: Infinity
    },
    "cos(x)": {
      exact: Math.cos,
      term: function (k) { return [Math.pow(-1, k) / FACT[2 * k], 2 * k]; },
      xlim: [-4 * Math.PI, 4 * Math.PI], ylim: [-3, 3], radius: Infinity
    },
    "e^x": {
      exact: Math.exp,
      term: function (k) { return [1 / FACT[k], k]; },
      xlim: [-6, 6], ylim: [-5, 30], radius: Infinity
    },
    "ln(1+x)": {
      // ln(1+x) only exists for x > -1; NaN leaves a gap in the curve
      exact: function (x) { return x > -1 ? Math.log1p(x) : NaN; },
      term: function (k) { return [Math.pow(-1, k) / (k + 1), k + 1]; },
      xlim: [-2, 3], ylim: [-4, 3], radius: 1
    }
  };

  function taylor(x, nTerms, name) {
    var total = 0, term = SERIES[name].term;
    for (var k = 0; k < nTerms; k++) {
      var cp = term(k);
      total += cp[0] * Math.pow(x, cp[1]);
    }
    return total;
  }

  // What the readout says about convergence, per function.
  var SERIES_NOTE = {
    "sin(x)": "The series for sin(x) converges for <b>every</b> x, so each extra term pushes that edge further out — it just takes more terms the further you go.",
    "cos(x)": "Like sin(x), the series for cos(x) converges for <b>every</b> x: more terms always widen the good region.",
    "e^x": "The series for e<sup>x</sup> converges for <b>every</b> x too — but the further from 0 you go, the more terms it takes to get close.",
    "ln(1+x)": "This series has <b>radius of convergence 1</b>: it converges only for −1 &lt; x ≤ 1 (shaded). Past x = 1 every extra term makes the polynomial <b>worse</b>, however many you add."
  };

  function demoTaylor(ctx) {
    var MAX_TERMS = 10;
    var name = "sin(x)";
    var plot = new Plot(ctx.canvas, {
      xmin: -4 * Math.PI, xmax: 4 * Math.PI, ymin: -3, ymax: 3,
      xlabel: "x", ylabel: "y", xticks: 8, yticks: 6
    });

    var xs = [], exact = [];
    function setFunction(which) {
      name = which;
      var s = SERIES[name];
      plot.set({
        xmin: s.xlim[0], xmax: s.xlim[1], ymin: s.ylim[0], ymax: s.ylim[1],
        xlabel: "x", ylabel: "y", xticks: 8, yticks: 6
      });
      xs = [];
      for (var i = 0; i <= 700; i++) xs.push(s.xlim[0] + (s.xlim[1] - s.xlim[0]) * i / 700);
      exact = xs.map(s.exact);
      fnButtons.forEach(function (b) { b.setAttribute("aria-pressed", String(b.textContent === name)); });
    }

    var n = 1, playing = !REDUCED, lastStep = 0;

    var fnRow = buttonRow(ctx.controls);
    var fnButtons = Object.keys(SERIES).map(function (key) {
      return button(fnRow, key, function () { setFunction(key); draw(); });
    });

    var nSlider = slider(ctx.controls, {
      label: "Terms", min: 1, max: MAX_TERMS, value: 1,
      format: function (v) { return String(v); },
      onInput: function (v) { n = v; play.stop(); draw(); }
    });

    var row = buttonRow(ctx.controls);
    var play = playButton(row, ctx,
      function () { return playing; },
      function (v) { playing = v; });
    button(row, "Reset", function () {
      n = 1; nSlider.set(1); play.stop(); setFunction("sin(x)"); draw();
    });

    function fmtX(v) { return (Math.abs(v) < 0.05 ? 0 : v).toFixed(1); }

    function draw() {
      var s = SERIES[name];
      var accent = cssVar("--accent", "#b4341f"), ink = cssVar("--ink", "#000");
      plot.frame();
      if (s.radius < Infinity) {
        // shade where the series converges, so the boundary is not a guess
        var c = plot.ctx, p = plot.pad;
        plot.clip(function () {
          c.fillStyle = cssVar("--accent-soft", "#fbeeeb");
          c.fillRect(plot.px(-s.radius), p.t,
            plot.px(s.radius) - plot.px(-s.radius), plot.h - p.t - p.b);
        });
        plot.vline(-s.radius, cssVar("--ink-soft", "#666"));
        plot.vline(s.radius, cssVar("--ink-soft", "#666"), "|x| = " + s.radius);
      }
      plot.line(xs, exact, ink, 2);
      var approx = xs.map(function (x) { return taylor(x, n, name); });
      plot.line(xs, approx, accent, 2.5);
      plot.legend([
        { label: name, color: ink },
        { label: n + " term" + (n === 1 ? "" : "s"), color: accent }
      ]);

      // The good region: walk out from x = 0 both ways until the error
      // first passes 0.05.
      var i0 = 0, lo, hi, i;
      for (i = 1; i < xs.length; i++) if (Math.abs(xs[i]) < Math.abs(xs[i0])) i0 = i;
      function ok(j) { return isFinite(exact[j]) && Math.abs(approx[j] - exact[j]) <= 0.05; }
      for (i = i0; i < xs.length && ok(i); i++) hi = xs[i];
      for (i = i0; i >= 0 && ok(i); i--) lo = xs[i];
      var highest = s.term(n - 1)[1];
      var region = lo === undefined
        ? "It is not within 0.05 of " + name + " even at x = 0."
        : "It tracks " + name + " to within 0.05 from <b>x = " + fmtX(lo) +
          "</b> to <b>x = " + fmtX(hi) + "</b>.";
      ctx.say(
        "Polynomial up to <b>x<sup>" + highest + "</sup></b>. " + region + " " + SERIES_NOTE[name]
      );
      ctx.setAlt(
        "Plot of " + name + " against its Maclaurin polynomial with " + n +
        " term" + (n === 1 ? "" : "s") + "." +
        (lo === undefined ? "" : " The polynomial stays within 0.05 of the curve from x = " +
          fmtX(lo) + " to x = " + fmtX(hi) + ", then diverges.") +
        (s.radius < Infinity ? " The series only converges for x between -1 and 1." : "")
      );
    }

    function tick(dt, now) {
      if (!playing) return;
      if (now - lastStep < 900) return;
      lastStep = now;
      n = n % MAX_TERMS + 1;
      nSlider.set(n);
      draw();
    }

    setFunction(name);
    draw();
    return { draw: draw, tick: tick, plot: plot };
  }

  /* ------------------------------------------------------ 2. Projectile */
  var G = 9.81, MASS = 0.145, DT = 0.001, STRIDE = 4;

  // Degrees to radians the way numpy's np.radians does it: x * (pi / 180).
  // (x * pi) / 180 rounds differently in the last bit, and near a tie that
  // bit is enough to pick a different "best" angle from the Python.
  function toRad(deg) { return deg * (Math.PI / 180); }

  // Same semi-implicit Euler step as projectile_drag.py, same DT: velocity
  // first, then position with the new velocity. Points are decimated for
  // drawing, and the ground hit is interpolated exactly as the Python does,
  // so the reported range is the real crossing rather than one step past it.
  function simulate(speed, angleDeg, dragK) {
    var th = toRad(angleDeg);
    var vx = speed * Math.cos(th), vy = speed * Math.sin(th);
    var x = 0, y = 0, px = 0, py = 0;
    var xs = [0], ys = [0], guard = 0;
    while (y >= 0 && guard++ < 200000) {
      px = x; py = y;
      var v = Math.hypot(vx, vy);
      vx += (-dragK * v * vx / MASS) * DT;
      vy += (-G - dragK * v * vy / MASS) * DT;
      x += vx * DT; y += vy * DT;
      if (guard % STRIDE === 0) { xs.push(x); ys.push(y); }
    }
    var hit = py > y ? px + (x - px) * (py / (py - y)) : x;
    xs.push(hit); ys.push(0);
    return { xs: xs, ys: ys, range: hit };
  }

  // Range only: the same flight, without building arrays. It used to run at
  // a 4x coarser step to save time, which moved the optimum a degree away
  // from the Python's in places; at the same DT the two agree everywhere on
  // the sliders (tests/test_science_parity.py checks it).
  function rangeOnly(speed, angleDeg, dragK) {
    var th = toRad(angleDeg);
    var vx = speed * Math.cos(th), vy = speed * Math.sin(th);
    var x = 0, y = 0, px = 0, py = 0, guard = 0;
    while (y >= 0 && guard++ < 200000) {
      px = x; py = y;
      var v = Math.hypot(vx, vy);
      vx += (-dragK * v * vx / MASS) * DT;
      vy += (-G - dragK * v * vy / MASS) * DT;
      x += vx * DT; y += vy * DT;
    }
    return py > y ? px + (x - px) * (py / (py - y)) : x;
  }

  /* The Python scans every angle from 10 to 80: 71 flights, which at 90 m/s
     is ~60 ms here and several times that on a phone. Range against angle
     has a single peak, so climbing uphill one degree at a time from a good
     guess finds the same angle - and the demo's guess is the previous
     answer, so a slider nudge costs about three flights. Ties go to the
     smaller angle, as numpy's argmax does. */
  function bestAngle(speed, dragK, start) {
    var a = Math.min(80, Math.max(10, Math.round(start || 45)));
    var r = rangeOnly(speed, a, dragK), next, moved = false;
    while (a > 10 && (next = rangeOnly(speed, a - 1, dragK)) >= r) {
      a--; r = next; moved = true;
    }
    while (!moved && a < 80 && (next = rangeOnly(speed, a + 1, dragK)) > r) {
      a++; r = next;
    }
    return a;
  }

  function demoProjectile(ctx) {
    var D = { speed: 40, angle: 45, dragRaw: 13 };
    var speed = D.speed, angle = D.angle, dragK = D.dragRaw / 10000;
    var plot = new Plot(ctx.canvas, {
      xmin: 0, xmax: 180, ymin: 0, ymax: 70,
      xlabel: "horizontal distance / m", ylabel: "height / m",
      ylabelShort: "height / m", xticks: 6, yticks: 5
    });

    var drag = null, vac = null, optDrag = 45, optVac = 45;
    var progress = 0, playing = !REDUCED;
    var optimaPending = false, optimaTimer = null;

    /* The trajectory costs a few ms and must track the slider. The optimum
       angle is a search over many flights and must not: running it on every
       input event blocked the main thread for 50-130ms a time, which read as
       the page freezing. It is debounced, and the readout says so meanwhile. */
    function recomputeCurves() {
      drag = simulate(speed, angle, dragK);
      vac = simulate(speed, angle, 0);
      var maxX = Math.max(vac.range, 20) * 1.08;
      var maxY = Math.max.apply(null, vac.ys) * 1.25 + 2;
      plot.set({
        xmin: 0, xmax: maxX, ymin: 0, ymax: maxY,
        xlabel: "horizontal distance / m", ylabel: "height / m",
        ylabelShort: "height / m", xticks: 6, yticks: 5
      });
      progress = 0;
    }

    function scheduleOptima() {
      optimaPending = true;
      jumpBtn.disabled = true;
      if (optimaTimer) clearTimeout(optimaTimer);
      optimaTimer = setTimeout(function () {
        optimaTimer = null;
        optDrag = bestAngle(speed, dragK, optDrag);
        optVac = bestAngle(speed, 0, optVac);
        optimaPending = false;
        jumpBtn.disabled = false;
        draw();
      }, 160);
    }

    function changed() { recomputeCurves(); scheduleOptima(); draw(); }

    var sSpeed = slider(ctx.controls, {
      label: "Launch speed", min: 10, max: 90, value: speed,
      format: function (v) { return v + " m/s"; },
      onInput: function (v) { speed = v; changed(); }
    });
    var sAngle = slider(ctx.controls, {
      label: "Launch angle", min: 10, max: 80, value: angle,
      format: function (v) { return v + "°"; },
      onInput: function (v) { angle = v; changed(); }
    });
    var sDrag = slider(ctx.controls, {
      label: "Drag k", min: 0, max: 40, value: D.dragRaw, step: 1,
      format: function (v) { return (v / 10000).toFixed(4); },
      onInput: function (v) { dragK = v / 10000; changed(); }
    });

    var row = buttonRow(ctx.controls);
    var play = playButton(row, ctx,
      function () { return playing; },
      function (v) { playing = v; });
    var jumpBtn = button(row, "Jump to best angle", function () {
      angle = optDrag;
      sAngle.set(angle);
      changed();
    });
    button(row, "Reset", function () {
      speed = D.speed; angle = D.angle; dragK = D.dragRaw / 10000;
      sSpeed.set(speed); sAngle.set(angle); sDrag.set(D.dragRaw);
      changed();
    });

    function draw() {
      plot.frame();
      plot.line(vac.xs, vac.ys, cssVar("--plot-ref", "#999"), 1.5, [6, 5]);
      plot.line(drag.xs, drag.ys, cssVar("--accent", "#b4341f"), 2.5);

      var idx = Math.min(drag.xs.length - 1, Math.floor(progress * (drag.xs.length - 1)));
      plot.dot(drag.xs[idx], drag.ys[idx], cssVar("--accent", "#b4341f"), 6);
      plot.legend([
        { label: "with drag", color: cssVar("--accent", "#b4341f") },
        { label: "vacuum", color: cssVar("--plot-ref", "#999"), width: 1.5, dash: [6, 5] }
      ]);

      var lost = vac.range - drag.range;
      // With k = 0 the two optima coincide, and "45 degrees, not 45 degrees"
      // reads as a bug even though the number is right.
      var best = optimaPending
        ? "<span class=\"chip-busy\">finding best angle…</span>"
        : optDrag === optVac
          ? "Best angle here is <b>" + optDrag + "°</b> — the same as in a vacuum."
          : "Best angle here is <b>" + optDrag + "°</b>, not " + optVac + "°.";
      ctx.say(
        "Range <b>" + drag.range.toFixed(1) + " m</b> with drag vs <b>" +
        vac.range.toFixed(1) + " m</b> in a vacuum — drag costs <b>" +
        lost.toFixed(1) + " m</b> (" + (100 * lost / vac.range).toFixed(0) + "%). " + best
      );
      ctx.setAlt(
        "Trajectory at " + speed + " metres per second and " + angle +
        " degrees. With drag it travels " + drag.range.toFixed(1) +
        " metres, against " + vac.range.toFixed(1) + " metres in a vacuum." +
        (optimaPending ? "" : " The best launch angle here is " + optDrag + " degrees.")
      );
    }

    function tick(dt) {
      if (!playing) return;
      progress += dt / 2200;
      if (progress > 1.15) progress = 0;
      draw();
    }

    recomputeCurves();
    optDrag = bestAngle(speed, dragK);
    optVac = bestAngle(speed, 0);
    draw();
    return {
      draw: draw, tick: tick, plot: plot,
      destroy: function () { if (optimaTimer) clearTimeout(optimaTimer); }
    };
  }

  /* ------------------------------------------------------- 3. Boltzmann */
  var K_B = 1.380649e-23, N_A = 6.02214076e23, R_GAS = K_B * N_A;

  // Speed distribution f(v), a fraction of molecules per (m s^-1).
  function mbDistribution(v, T, mass) {
    var a = mass / (2 * K_B * T);
    return 4 * Math.PI * v * v * Math.pow(a / Math.PI, 1.5) * Math.exp(-a * v * v);
  }

  /* Energy distribution f(E), a fraction per (kJ mol^-1) - the IB curve.
     f(E) dE = f(v) dv with E = mv^2/2 gives 2 sqrt(E/pi) (RT)^-3/2 e^(-E/RT);
     the mass cancels, so every gas shares this curve at a given T. */
  function mbEnergy(E, T) {
    var RT = R_GAS * T / 1000;
    return 2 * Math.sqrt(E / Math.PI) * Math.pow(RT, -1.5) * Math.exp(-E / RT);
  }

  /* JavaScript has no erfc. This is the Chebyshev fit from Numerical
     Recipes (erfcc): fractional error below 1.2e-7 for every x, far finer
     than the three figures the readout shows. */
  function erfc(x) {
    var z = Math.abs(x), t = 1 / (1 + 0.5 * z);
    var r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 +
      t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 +
      t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? r : 2 - r;
  }

  // The shaded area past Ea, in closed form - the same formula as
  // fraction_above_ea in maxwell_boltzmann.py, with x = Ea / RT.
  function fractionAboveEa(eaKJ, T) {
    var x = eaKJ * 1000 / (R_GAS * T);
    return erfc(Math.sqrt(x)) + 2 * Math.sqrt(x / Math.PI) * Math.exp(-x);
  }

  function demoBoltzmann(ctx) {
    var MASS = 0.028 / N_A;
    var D = { T: 300, eaKJ: 50 };
    var T = D.T, eaKJ = D.eaKJ, playing = !REDUCED, dir = 1, logY = true;
    var energyView = true;   // IB draws energy on the x-axis; speed is the extra
    var FLOOR_V = -14, FLOOR_E = -18;

    function xmaxNow() {
      if (!energyView) return 2500;
      // On a linear axis the peak sits near RT/2 (~1.2 kJ/mol), so a fixed
      // 90 kJ/mol axis would squash the whole curve into a spike at the left.
      return logY ? 90 : Math.max(20, eaKJ * 1.25);
    }

    function applyScale() {
      var xl = energyView ? "kinetic energy / kJ mol⁻¹" : "molecular speed / m s⁻¹";
      var per = energyView ? "per kJ mol⁻¹" : "per m s⁻¹";
      if (logY) {
        plot.set({
          xmin: 0, xmax: xmaxNow(), ymin: energyView ? FLOOR_E : FLOOR_V,
          ymax: energyView ? 0 : -2,
          xlabel: xl,
          ylabel: "fraction of molecules " + per + " (log scale)",
          ylabelShort: per + " (log)",
          xticks: 5, yticks: 6, yIntegral: true,
          fmtY: function (v) { return "10" + sup(Math.round(v)); }
        });
      } else {
        plot.set({
          xmin: 0, xmax: xmaxNow(), ymin: 0, ymax: energyView ? 0.25 : 0.0022,
          xlabel: xl,
          ylabel: "fraction of molecules " + per,
          ylabelShort: per,
          xticks: 5, yticks: 4,
          fmtY: energyView ? null : function (v) { return v === 0 ? "0" : sciText(v, 1); }
        });
      }
    }

    var plot = new Plot(ctx.canvas, {
      xmin: 0, xmax: 90, ymin: FLOOR_E, ymax: 0,
      xlabel: "kinetic energy / kJ mol⁻¹", ylabel: "fraction of molecules per kJ mol⁻¹",
      xticks: 5, yticks: 4
    });
    applyScale();

    function ymap(y) {
      if (!logY) return y;
      var floor = energyView ? FLOOR_E : FLOOR_V;
      return y <= 0 ? floor : Math.max(floor, Math.log(y) / Math.LN10);
    }

    var tSlider = slider(ctx.controls, {
      label: "Temperature", min: 250, max: 600, value: T,
      format: function (v) { return v + " K"; },
      onInput: function (v) { T = v; play.stop(); draw(); }
    });
    var eSlider = slider(ctx.controls, {
      label: "Activation energy", min: 10, max: 80, value: eaKJ,
      format: function (v) { return v + " kJ/mol"; },
      onInput: function (v) { eaKJ = v; if (energyView && !logY) applyScale(); draw(); }
    });

    var row = buttonRow(ctx.controls);
    var play = playButton(row, ctx,
      function () { return playing; },
      function (v) { playing = v; });
    var viewBtn = button(row, "Speed axis", function (b) {
      energyView = !energyView;
      b.setAttribute("aria-pressed", String(!energyView));
      applyScale();
      draw();
    });
    viewBtn.setAttribute("aria-pressed", "false");
    var logBtn = button(row, "Log scale", function (b) {
      logY = !logY;
      b.setAttribute("aria-pressed", String(logY));
      applyScale();
      draw();
    });
    logBtn.setAttribute("aria-pressed", "true");
    button(row, "Reset", function () {
      T = D.T; eaKJ = D.eaKJ; dir = 1;
      tSlider.set(T); eSlider.set(eaKJ);
      applyScale();
      play.stop(); draw();
    });

    function vEa() { return Math.sqrt(2 * (eaKJ * 1000 / N_A) / MASS); }

    function draw() {
      var xs = [], xmax = xmaxNow(), i;
      for (i = 0; i <= 600; i++) xs.push(xmax * i / 600);
      var f = energyView
        ? function (x, Tk) { return mbEnergy(x, Tk); }
        : function (x, Tk) { return mbDistribution(x, Tk, MASS); };
      var edge = energyView ? eaKJ : vEa();
      plot.frame();

      [300, 500].forEach(function (Tref) {
        var ysr = xs.map(function (x) { return ymap(f(x, Tref)); });
        plot.line(xs, ysr, cssVar("--plot-ref", "#999"), 1.5);
      });

      var ys = xs.map(function (x) { return ymap(f(x, T)); });
      // --plot-fill, not --accent-soft: the old fill measured 1.1:1 against
      // the canvas, so the one thing this topic exists to show was invisible.
      plot.fillUnder(xs, ys, cssVar("--plot-fill", "rgba(180,52,31,.3)"), edge);
      plot.line(xs, ys, cssVar("--accent", "#b4341f"), 2.5);
      plot.vline(edge, cssVar("--ink", "#000"),
        energyView ? "Ea = " + eaKJ + " kJ/mol" : "KE = Ea at " + Math.round(edge) + " m/s");
      plot.legend([
        { label: Math.round(T) + " K", color: cssVar("--accent", "#b4341f") },
        { label: "300 K / 500 K", color: cssVar("--plot-ref", "#999"), width: 1.5 }
      ]);

      var Tn = Math.round(T);
      var frac = fractionAboveEa(eaKJ, T);
      var base = fractionAboveEa(eaKJ, 300);
      var tenK = fractionAboveEa(eaKJ, Tn + 10) / fractionAboveEa(eaKJ, Tn);
      ctx.say(
        "At <b>" + Tn + " K</b>, <b>" + sciHTML(frac) +
        "</b> of molecules have at least Ea — <b>" + (frac / base).toFixed(2) +
        "×</b> the fraction at 300 K. Another 10 K would multiply it by <b>" +
        tenK.toFixed(2) + "</b>. " +
        (logY
          ? "On this log axis every gridline is 10× — watch the shaded tail climb."
          : "Notice how little the peak moves. Unless Ea is small, the tail past it is far too thin to see here, which is exactly why it needs a log axis.") +
        (energyView ? "" : " The area past the line is the same fraction as on the energy axis: these are the molecules fast enough to carry Ea.")
      );
      ctx.setAlt(
        "Maxwell-Boltzmann " + (energyView ? "kinetic energy" : "speed") + " distribution at " +
        Tn + " kelvin, with the area past the activation energy shaded. " +
        frac.toExponential(2) + " of molecules exceed the barrier, " +
        (frac / base).toFixed(2) + " times the fraction at 300 kelvin."
      );
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

  /* -------------------------------------------------------- 4. Orbitals */
  /* Long-form interactive explainer: shapes → 2e/orbital → Aufbau → metals.
     Builds its own HTML layout inside .demo (not a single autoplaying canvas). */

  var AUFBAU = [
    [1, "s", 2], [2, "s", 2], [2, "p", 6], [3, "s", 2], [3, "p", 6],
    [4, "s", 2], [3, "d", 10], [4, "p", 6], [5, "s", 2], [4, "d", 10],
    [5, "p", 6], [6, "s", 2], [4, "f", 14], [5, "d", 10], [6, "p", 6]
  ];
  var ORB_EXCEPTIONS = { 24: { "4s": 1, "3d": 5 }, 29: { "4s": 1, "3d": 10 } };

  var FILL_ORDER = AUFBAU.map(function (x) { return x[0] + x[1]; });

  var BLOCK_COLORS = { s: "#b4341f", p: "#2f6f8f", d: "#c47a1a", f: "#5a6b3b" };

  var PT_ELEMENTS = [
    { z: 1, sym: "H", row: 1, col: 1, block: "s" },
    { z: 2, sym: "He", row: 1, col: 18, block: "s" },
    { z: 3, sym: "Li", row: 2, col: 1, block: "s" }, { z: 4, sym: "Be", row: 2, col: 2, block: "s" },
    { z: 5, sym: "B", row: 2, col: 13, block: "p" }, { z: 6, sym: "C", row: 2, col: 14, block: "p" },
    { z: 7, sym: "N", row: 2, col: 15, block: "p" }, { z: 8, sym: "O", row: 2, col: 16, block: "p" },
    { z: 9, sym: "F", row: 2, col: 17, block: "p" }, { z: 10, sym: "Ne", row: 2, col: 18, block: "p" },
    { z: 11, sym: "Na", row: 3, col: 1, block: "s" }, { z: 12, sym: "Mg", row: 3, col: 2, block: "s" },
    { z: 13, sym: "Al", row: 3, col: 13, block: "p" }, { z: 14, sym: "Si", row: 3, col: 14, block: "p" },
    { z: 15, sym: "P", row: 3, col: 15, block: "p" }, { z: 16, sym: "S", row: 3, col: 16, block: "p" },
    { z: 17, sym: "Cl", row: 3, col: 17, block: "p" }, { z: 18, sym: "Ar", row: 3, col: 18, block: "p" },
    { z: 19, sym: "K", row: 4, col: 1, block: "s" }, { z: 20, sym: "Ca", row: 4, col: 2, block: "s" },
    { z: 21, sym: "Sc", row: 4, col: 3, block: "d" }, { z: 22, sym: "Ti", row: 4, col: 4, block: "d" },
    { z: 23, sym: "V", row: 4, col: 5, block: "d" }, { z: 24, sym: "Cr", row: 4, col: 6, block: "d" },
    { z: 25, sym: "Mn", row: 4, col: 7, block: "d" }, { z: 26, sym: "Fe", row: 4, col: 8, block: "d" },
    { z: 27, sym: "Co", row: 4, col: 9, block: "d" }, { z: 28, sym: "Ni", row: 4, col: 10, block: "d" },
    { z: 29, sym: "Cu", row: 4, col: 11, block: "d" }, { z: 30, sym: "Zn", row: 4, col: 12, block: "d" },
    { z: 31, sym: "Ga", row: 4, col: 13, block: "p" }, { z: 32, sym: "Ge", row: 4, col: 14, block: "p" },
    { z: 33, sym: "As", row: 4, col: 15, block: "p" }, { z: 34, sym: "Se", row: 4, col: 16, block: "p" },
    { z: 35, sym: "Br", row: 4, col: 17, block: "p" }, { z: 36, sym: "Kr", row: 4, col: 18, block: "p" }
  ];

  var METAL_CASES = [
    { z: 21, sym: "Sc", blurb: "First d-block metal. Aufbau works: 4s fills before 3d." },
    { z: 24, sym: "Cr", blurb: "Exception. Half-full 3d⁵ is preferred over 4s² 3d⁴ — one 4s electron moves into 3d." },
    { z: 26, sym: "Fe", blurb: "Typical transition metal. Aufbau works: [Ar] 4s² 3d⁶." },
    { z: 29, sym: "Cu", blurb: "Exception. Full 3d¹⁰ is preferred over 4s² 3d⁹ — one 4s electron moves into 3d." },
    { z: 30, sym: "Zn", blurb: "End of the 3d row. Full 3d¹⁰ and 4s² — no exception needed." }
  ];

  function fillAufbau(z, applyException) {
    var remaining = z, config = {}, i, key, take;
    for (i = 0; i < AUFBAU.length; i++) {
      if (remaining <= 0) break;
      key = AUFBAU[i][0] + AUFBAU[i][1];
      take = Math.min(AUFBAU[i][2], remaining);
      config[key] = take;
      remaining -= take;
    }
    if (applyException && ORB_EXCEPTIONS[z]) {
      var ex = ORB_EXCEPTIONS[z];
      Object.keys(ex).forEach(function (k) { config[k] = ex[k]; });
    }
    return config;
  }

  function configString(config) {
    var cores = [[2, "[He]"], [10, "[Ne]"], [18, "[Ar]"], [36, "[Kr]"]];
    var z = 0, i, k, coreZ = 0, coreLabel = "";
    Object.keys(config).forEach(function (key) { z += config[key]; });
    for (i = 0; i < cores.length; i++) {
      if (z > cores[i][0]) { coreZ = cores[i][0]; coreLabel = cores[i][1]; }
    }
    var coreCfg = coreZ ? fillAufbau(coreZ, false) : {};
    var parts = [];
    for (i = 0; i < AUFBAU.length; i++) {
      k = AUFBAU[i][0] + AUFBAU[i][1];
      if (config[k] && config[k] !== (coreCfg[k] || 0)) parts.push(k + config[k]);
    }
    return (coreLabel ? coreLabel + " " : "") + parts.join(" ");
  }

  function valenceKeys(config) {
    var z = 0, cores = [2, 10, 18, 36], coreZ = 0, i, k;
    Object.keys(config).forEach(function (key) { z += config[key]; });
    for (i = 0; i < cores.length; i++) if (z > cores[i]) coreZ = cores[i];
    var coreCfg = coreZ ? fillAufbau(coreZ, false) : {};
    var keys = [];
    for (i = 0; i < AUFBAU.length; i++) {
      k = AUFBAU[i][0] + AUFBAU[i][1];
      if (config[k] && config[k] !== (coreCfg[k] || 0)) keys.push(k);
    }
    return keys;
  }

  function occupancy(nOrb, electrons) {
    var occ = [], e;
    for (e = 0; e < nOrb; e++) occ[e] = 0;
    for (e = 0; e < Math.min(electrons, nOrb); e++) occ[e] = 1;
    for (e = nOrb; e < electrons; e++) occ[e - nOrb] = 2;
    return occ;
  }

  function fitCanvas(canvas, cssH) {
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth || 200;
    var h = cssH || Math.round(w * 0.75);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.height = h + "px";
    var g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { g: g, w: w, h: h };
  }

  function drawOrbitalShape(canvas, kind) {
    var fit = fitCanvas(canvas, 176);
    var g = fit.g, w = fit.w, h = fit.h;
    var ink = cssVar("--ink", "#000");
    var soft = cssVar("--ink-soft", "#666");
    var accent = cssVar("--accent", "#b4341f");
    var pCol = "#2f6f8f";
    g.clearRect(0, 0, w, h);
    // Leave room for axis labels at the edges (esp. x on px).
    var cx = w / 2 - 2, cy = h / 2 + 4;
    var S = Math.min(w, h);

    // x and y form a square of half-side L; z runs to that square's corner.
    var inv = 1 / Math.SQRT2;
    var axes = {
      x: { dx: 1, dy: 0, label: "x", scale: 1 },
      y: { dx: 0, dy: -1, label: "y", scale: 1 },
      z: { dx: inv, dy: -inv, label: "z", scale: Math.SQRT2 }
    };

    function drawAxisLines(len, emphasize) {
      Object.keys(axes).forEach(function (name) {
        var a = axes[name];
        var hot = emphasize === name;
        var L = len * a.scale * (hot ? 1.0 : 0.92);
        var x2 = cx + a.dx * L;
        var y2 = cy + a.dy * L;
        g.strokeStyle = hot ? ink : soft;
        g.globalAlpha = hot ? 1 : 0.5;
        g.lineWidth = hot ? 1.7 : 1.1;
        g.beginPath();
        g.moveTo(cx - a.dx * L * 0.9, cy - a.dy * L * 0.9);
        g.lineTo(x2, y2);
        g.stroke();
        var ang = Math.atan2(a.dy, a.dx);
        g.beginPath();
        g.moveTo(x2, y2);
        g.lineTo(x2 - 7 * Math.cos(ang - 0.4), y2 - 7 * Math.sin(ang - 0.4));
        g.lineTo(x2 - 7 * Math.cos(ang + 0.4), y2 - 7 * Math.sin(ang + 0.4));
        g.closePath();
        g.fillStyle = hot ? ink : soft;
        g.fill();
        g.globalAlpha = 1;
      });
    }

    function drawAxisLabels(len, emphasize) {
      Object.keys(axes).forEach(function (name) {
        var a = axes[name];
        var hot = emphasize === name;
        var L = len * a.scale * (hot ? 1.0 : 0.92);
        var x2 = cx + a.dx * L;
        var y2 = cy + a.dy * L;
        g.fillStyle = hot ? ink : soft;
        g.font = (hot ? "700 " : "600 ") + "12px ui-sans-serif, system-ui, sans-serif";
        if (name === "x") {
          g.textAlign = "left";
          g.textBaseline = "middle";
          g.fillText(a.label, Math.min(w - 14, x2 + 6), y2);
        } else if (name === "y") {
          g.textAlign = "center";
          g.textBaseline = "bottom";
          g.fillText(a.label, x2, y2 - 6);
        } else {
          g.textAlign = "left";
          g.textBaseline = "bottom";
          g.fillText(a.label, x2 + 4, y2 - 2);
        }
      });
    }

    function drawLobeAlong(dirX, dirY, color, R) {
      var axisAng = Math.atan2(-dirY, dirX);
      function oneLobe(sign) {
        var base = axisAng + (sign < 0 ? Math.PI : 0);
        g.beginPath();
        var started = false;
        for (var deg = -90; deg <= 90; deg += 1.5) {
          var phi = deg * Math.PI / 180;
          var c = Math.cos(phi);
          if (c <= 0) continue;
          var r = R * Math.pow(c, 3) * (0.35 + 0.65 * c);
          var ang = base + phi;
          var x = cx + r * Math.cos(ang);
          var y = cy - r * Math.sin(ang);
          if (!started) { g.moveTo(cx, cy); started = true; }
          g.lineTo(x, y);
        }
        g.lineTo(cx, cy);
        g.closePath();
        g.fillStyle = color; g.globalAlpha = 0.4; g.fill();
        g.globalAlpha = 1; g.strokeStyle = ink; g.lineWidth = 1.35; g.stroke();
      }
      oneLobe(1);
      oneLobe(-1);
    }

    var axisLen = S * 0.36;
    if (kind === "s") {
      drawAxisLines(axisLen, null);
      g.beginPath();
      g.arc(cx, cy, S * 0.26, 0, Math.PI * 2);
      g.fillStyle = accent; g.globalAlpha = 0.28; g.fill();
      g.globalAlpha = 1; g.strokeStyle = ink; g.lineWidth = 1.5; g.stroke();
      g.beginPath(); g.fillStyle = ink; g.arc(cx, cy, 2.8, 0, Math.PI * 2); g.fill();
      drawAxisLabels(axisLen, null);
      return;
    }

    var along = kind === "px" ? "x" : kind === "py" ? "y" : "z";
    var lobeR = kind === "px" ? S * 0.34 : S * 0.38;
    drawAxisLines(axisLen, along);
    var a = axes[along];
    drawLobeAlong(a.dx, a.dy, pCol, lobeR);
    g.beginPath(); g.fillStyle = ink; g.arc(cx, cy, 2.8, 0, Math.PI * 2); g.fill();
    drawAxisLabels(axisLen, along);
  }

  // Elements that fill each subshell (teaching ranges).
  var SUBSHELL_ELEMENTS = {
    "1s": "H–He", "2s": "Li–Be", "2p": "B–Ne",
    "3s": "Na–Mg", "3p": "Al–Ar",
    "4s": "K–Ca", "3d": "Sc–Zn", "4p": "Ga–Kr",
    "5s": "Rb–Sr", "4d": "Y–Cd", "5p": "In–Xe",
    "6s": "Cs–Ba", "4f": "Ce–Lu", "5d": "Hf–Hg", "6p": "Tl–Rn",
    "7s": "Fr–Ra", "5f": "Th–Lr", "6d": "Rf–Cn", "7p": "Nh–Og"
  };

  function drawDiagonalChart(canvas, fillStep) {
    var fit = fitCanvas(canvas, 460);
    var g = fit.g, w = fit.w, h = fit.h;
    var ink = cssVar("--ink", "#000");
    var soft = cssVar("--ink-soft", "#666");
    var accent = cssVar("--accent", "#b4341f");
    var border = cssVar("--border", "#ddd");
    var surface = cssVar("--surface", "#fff");
    var accentSoft = cssVar("--accent-soft", "#fbeeeb");
    g.clearRect(0, 0, w, h);

    var diagonals = [
      ["1s"],
      ["2s"],
      ["2p", "3s"],
      ["3p", "4s"],
      ["3d", "4p", "5s"],
      ["4d", "5p", "6s"],
      ["4f", "5d", "6p", "7s"],
      ["5f", "6d", "7p"]
    ];

    var fillOrder = [];
    diagonals.forEach(function (d) {
      d.forEach(function (k) { fillOrder.push(k); });
    });
    var orderIndex = {};
    fillOrder.forEach(function (k, i) { orderIndex[k] = i + 1; });

    var colOf = { s: 0, p: 1, d: 2, f: 3 };
    var bw = 58, bh = 40;
    var gapX = 26, gapY = 16;
    var gridW = 4 * bw + 3 * gapX;
    var left = Math.max(40, (w - gridW) / 2);
    var top = 28;

    var pos = {};
    var hits = [];
    fillOrder.forEach(function (key) {
      var n = parseInt(key.charAt(0), 10);
      var letter = key.charAt(1);
      var x = left + colOf[letter] * (bw + gapX) + bw / 2;
      var y = top + (n - 1) * (bh + gapY) + bh / 2;
      pos[key] = { x: x, y: y };
      hits.push({ key: key, order: orderIndex[key], x: x - bw / 2, y: y - bh / 2, w: bw, h: bh });
    });
    canvas._orbHits = hits;

    function cellState(key) {
      var idx = orderIndex[key] - 1;
      return { done: idx < fillStep, cur: fillStep > 0 && idx === fillStep - 1 };
    }

    diagonals.forEach(function (group) {
      if (group.length < 2) return;
      var a = pos[group[0]];
      var b = pos[group[group.length - 1]];
      var dx = b.x - a.x, dy = b.y - a.y;
      var len = Math.hypot(dx, dy) || 1;
      var ux = dx / len, uy = dy / len;
      var reach = Math.hypot(bw, bh) * 0.5;
      var x0 = a.x - ux * reach;
      var y0 = a.y - uy * reach;
      var x1 = b.x + ux * reach;
      var y1 = b.y + uy * reach;

      var lit = group.some(function (k) {
        return cellState(k).done || cellState(k).cur;
      });

      g.save();
      g.strokeStyle = accent;
      g.fillStyle = accent;
      g.globalAlpha = lit ? 0.95 : 0.45;
      g.lineWidth = 2.2;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
      var ang = Math.atan2(uy, ux);
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x1 - 10 * Math.cos(ang - 0.4), y1 - 10 * Math.sin(ang - 0.4));
      g.lineTo(x1 - 10 * Math.cos(ang + 0.4), y1 - 10 * Math.sin(ang + 0.4));
      g.closePath();
      g.fill();
      g.restore();
    });

    g.fillStyle = soft;
    g.font = "600 12px ui-sans-serif, system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "bottom";
    ["s", "p", "d", "f"].forEach(function (letter, i) {
      g.fillText(letter, left + i * (bw + gapX) + bw / 2, top - 8);
    });

    g.textAlign = "right";
    g.textBaseline = "middle";
    g.font = "600 11px ui-sans-serif, system-ui, sans-serif";
    for (var n = 1; n <= 7; n++) {
      g.fillText(String(n), left - 14, top + (n - 1) * (bh + gapY) + bh / 2);
    }

    fillOrder.forEach(function (key) {
      var p = pos[key];
      var st = cellState(key);
      var ord = orderIndex[key];
      var els = SUBSHELL_ELEMENTS[key] || "";

      g.fillStyle = st.cur ? accent : st.done ? accentSoft : surface;
      g.strokeStyle = st.cur || st.done ? accent : border;
      g.lineWidth = st.cur ? 2.3 : 1.2;
      roundRect(g, p.x - bw / 2, p.y - bh / 2, bw, bh, 7);
      g.fill();
      g.stroke();

      var bx = p.x - bw / 2 + 11;
      var by = p.y - 6;
      g.beginPath();
      g.arc(bx, by, 8, 0, Math.PI * 2);
      g.fillStyle = st.cur ? "#fff" : accent;
      g.globalAlpha = st.cur || st.done ? 1 : 0.85;
      g.fill();
      g.globalAlpha = 1;
      g.fillStyle = st.cur ? accent : "#fff";
      g.font = "700 8px ui-sans-serif, system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(String(ord), bx, by + 0.5);

      g.fillStyle = st.cur ? "#fff" : ink;
      g.font = "700 12px ui-sans-serif, system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(key, p.x + 6, p.y - 7);

      g.fillStyle = st.cur ? "rgba(255,255,255,0.9)" : soft;
      g.font = "600 9px ui-sans-serif, system-ui, sans-serif";
      g.fillText(els, p.x + 2, p.y + 10);
    });
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function demoOrbitals(ctx) {
    var host = ctx.canvas.parentElement; // .demo
    host.innerHTML = "";
    host.classList.add("orb-demo");

    var selectedShape = "s";
    var paired = 0;
    var fillStep = 0;
    var selectedZ = 26;
    var selectedMetal = 1; // Cr — lead with the exception

    function section(title, lead) {
      var sec = document.createElement("section");
      sec.className = "orb-section";
      var h = document.createElement("h3");
      h.textContent = title;
      var p = document.createElement("p");
      p.className = "orb-lead";
      p.innerHTML = lead;
      sec.append(h, p);
      host.appendChild(sec);
      return sec;
    }

    function configHTML(z, applyEx) {
      return configString(fillAufbau(z, applyEx));
    }

    function endingSubshell(z) {
      var cfg = fillAufbau(z, true);
      var keys = valenceKeys(cfg);
      if (!keys.length) return "";
      var last = keys[keys.length - 1];
      return last + cfg[last];
    }

    /* ---------- 1. shapes ---------- */
    var s1 = section(
      "1. The shapes — s and the three p orbitals",
      "An <b>s</b> orbital is a sphere around the nucleus. Each <b>p</b> orbital is a dumbbell " +
      "of two lobes along one axis (x, y or z). Click one to focus it. " +
      "Every orbital — s or p — holds at most <b>two electrons of opposite spin</b> (↑↓)."
    );
    var shapeRow = document.createElement("div");
    shapeRow.className = "orb-shape-row";
    var shapeCanvases = {};
    ["s", "px", "py", "pz"].forEach(function (kind) {
      var card = document.createElement("button");
      card.type = "button";
      card.className = "orb-shape-card";
      card.dataset.kind = kind;
      var label = document.createElement("span");
      label.className = "orb-shape-label";
      label.textContent = { s: "s", px: "pₓ", py: "pᵧ", pz: "p_z" }[kind];
      var c = document.createElement("canvas");
      c.width = 200; c.height = 160;
      card.append(c, label);
      card.addEventListener("click", function () {
        selectedShape = kind;
        paintShapes();
        shapeNote.innerHTML = shapeBlurb(kind);
      });
      shapeRow.appendChild(card);
      shapeCanvases[kind] = c;
    });
    s1.appendChild(shapeRow);
    var shapeNote = document.createElement("p");
    shapeNote.className = "orb-note";
    s1.appendChild(shapeNote);

    function shapeBlurb(kind) {
      if (kind === "s") {
        return "<b>s</b>: spherical — no preferred axis. One orbital per shell (1s, 2s, 3s…). " +
          "Holds up to <b>two electrons of opposite spin</b> (↑↓).";
      }
      if (kind === "px") {
        return "<b>pₓ</b>: lobes along the <b>x</b>-axis. With pᵧ and p_z → the p sublevel " +
          "(3 orbitals × 2 e⁻ = <b>6</b>). Each orbital holds two electrons of opposite spin.";
      }
      if (kind === "py") {
        return "<b>pᵧ</b>: lobes along the <b>y</b>-axis. Same energy as pₓ and p_z in a free atom. " +
          "Holds up to <b>two electrons of opposite spin</b>.";
      }
      return "<b>p_z</b>: lobes along the <b>z</b>-axis. The three p orbitals are mutually perpendicular. " +
        "Holds up to <b>two electrons of opposite spin</b>.";
    }

    function paintShapes() {
      ["s", "px", "py", "pz"].forEach(function (kind) {
        var card = shapeRow.querySelector('[data-kind="' + kind + '"]');
        card.setAttribute("aria-pressed", String(kind === selectedShape));
        drawOrbitalShape(shapeCanvases[kind], kind);
      });
    }
    shapeNote.innerHTML = shapeBlurb("s");

    /* ---------- 2. two electrons ---------- */
    var s2 = section(
      "2. Two electrons per orbital",
      "Each orbital is one box. <b>Pauli</b>: at most two electrons, opposite spins (↑↓). " +
      "Click the box to add or clear. <b>Hund</b>: for p/d/f, one electron per box before pairing."
    );
    var pairWrap = document.createElement("div");
    pairWrap.className = "orb-pair-wrap";
    var pairBtn = document.createElement("button");
    pairBtn.type = "button";
    pairBtn.className = "orb-box-big";
    pairBtn.setAttribute("aria-label", "Toggle electrons in orbital");
    var pairCap = document.createElement("canvas");
    pairCap.width = 120; pairCap.height = 140;
    pairBtn.appendChild(pairCap);
    var pairHint = document.createElement("p");
    pairHint.className = "orb-note";
    pairWrap.append(pairBtn, pairHint);
    s2.appendChild(pairWrap);

    function paintPair() {
      var fit = fitCanvas(pairCap, 140);
      var g = fit.g, w = fit.w, h = fit.h;
      var ink = cssVar("--ink", "#000");
      var soft = cssVar("--ink-soft", "#666");
      var accent = cssVar("--accent", "#b4341f");
      g.clearRect(0, 0, w, h);
      var bx = w / 2 - 28, by = 24, bw = 56, bh = 90;
      g.strokeStyle = accent; g.lineWidth = 2.5;
      g.strokeRect(bx, by, bw, bh);
      function arrow(up, x) {
        g.beginPath(); g.strokeStyle = ink; g.lineWidth = 2.2;
        if (up) {
          g.moveTo(x, by + bh - 16); g.lineTo(x, by + 18);
          g.lineTo(x - 7, by + 30); g.moveTo(x, by + 18); g.lineTo(x + 7, by + 30);
        } else {
          g.moveTo(x, by + 18); g.lineTo(x, by + bh - 16);
          g.lineTo(x - 7, by + bh - 28); g.moveTo(x, by + bh - 16); g.lineTo(x + 7, by + bh - 28);
        }
        g.stroke();
      }
      if (paired >= 1) arrow(true, w / 2 - (paired === 2 ? 10 : 0));
      if (paired === 2) arrow(false, w / 2 + 10);
      g.fillStyle = soft; g.font = "12px ui-sans-serif, system-ui, sans-serif";
      g.textAlign = "center"; g.textBaseline = "top";
      g.fillText(paired + " / 2 electrons", w / 2, by + bh + 10);

      if (paired === 0) pairHint.innerHTML = "Empty orbital. Click to add the first electron (↑).";
      else if (paired === 1) pairHint.innerHTML = "One electron. A second is allowed only with <b>opposite spin</b> (↓). Click again.";
      else pairHint.innerHTML = "Full. Two electrons, paired spins — this orbital is done. Click to clear.";
    }
    pairBtn.addEventListener("click", function () {
      paired = (paired + 1) % 3;
      paintPair();
    });

    /* ---------- 3. blocks + configs + diagonal ---------- */
    var s3 = section(
      "3. Blocks, configurations, and the diagonal fill order",
      "Click an element to see its <b>electron configuration</b>. Colour = which block is " +
      "being filled (s / p / d). Below that, step through the <b>diagonal Aufbau rule</b> — " +
      "electrons do not fill in simple left-to-right table order."
    );

    var legend = document.createElement("div");
    legend.className = "orb-legend";
    [
      ["s", "s-block · filling ns"],
      ["p", "p-block · filling np"],
      ["d", "d-block · filling (n−1)d"]
    ].forEach(function (pair) {
      var item = document.createElement("span");
      item.className = "orb-legend-item";
      item.innerHTML = '<i style="background:' + BLOCK_COLORS[pair[0]] + '"></i>' + pair[1];
      legend.appendChild(item);
    });
    s3.appendChild(legend);

    var pt = document.createElement("div");
    pt.className = "orb-pt";
    PT_ELEMENTS.forEach(function (el) {
      var cell = document.createElement("button");
      cell.type = "button";
      cell.className = "orb-pt-cell block-" + el.block;
      cell.style.gridColumn = String(el.col);
      cell.style.gridRow = String(el.row);
      cell.innerHTML = "<small>" + el.z + "</small><strong>" + el.sym + "</strong>";
      cell.title = el.sym + ": " + configHTML(el.z, true);
      cell.addEventListener("click", function () {
        selectedZ = el.z;
        paintPt();
        paintConfigCard();
      });
      pt.appendChild(cell);
    });
    s3.appendChild(pt);

    var configCard = document.createElement("div");
    configCard.className = "orb-config-card";
    s3.appendChild(configCard);

    var configBoxesHost = document.createElement("div");
    configBoxesHost.className = "orb-config-boxes";
    s3.appendChild(configBoxesHost);

    function paintPt() {
      Array.prototype.forEach.call(pt.children, function (cell, i) {
        cell.setAttribute("aria-pressed", String(PT_ELEMENTS[i].z === selectedZ));
      });
    }

    function paintConfigCard() {
      var el = PT_ELEMENTS.filter(function (e) { return e.z === selectedZ; })[0];
      if (!el) return;
      var actual = fillAufbau(el.z, true);
      var naive = fillAufbau(el.z, false);
      var isEx = !!ORB_EXCEPTIONS[el.z];
      var end = endingSubshell(el.z);
      configCard.innerHTML =
        "<div class='orb-config-main'>" +
          "<span class='orb-config-sym'>" + el.sym + "</span>" +
          "<span class='orb-config-z'>Z = " + el.z + " · " + el.block + "-block</span>" +
        "</div>" +
        "<code class='orb-config-str'>" + configString(actual) + "</code>" +
        "<p class='orb-config-end'>Last filled: <b>" + end + "</b>" +
          (isEx
            ? " · <span class='orb-warn'>exception</span> — Aufbau alone would give <code>" +
              configString(naive) + "</code>"
            : " · matches Aufbau") +
        "</p>";

      // valence boxes for this element
      configBoxesHost.innerHTML = "";
      var row = document.createElement("div");
      row.className = "orb-boxes";
      var nOrbOf = { s: 1, p: 3, d: 5, f: 7 };
      valenceKeys(actual).forEach(function (key) {
        var group = document.createElement("div");
        group.className = "orb-box-group";
        if (isEx && (key === "4s" || key === "3d")) group.classList.add("is-hot");
        var lab = document.createElement("div");
        lab.className = "orb-box-lab";
        lab.textContent = key;
        group.appendChild(lab);
        var boxes = document.createElement("div");
        boxes.className = "orb-box-row";
        occupancy(nOrbOf[key.charAt(1)], actual[key] || 0).forEach(function (n) {
          var box = document.createElement("div");
          box.className = "orb-box";
          if (n >= 1) box.innerHTML += "<span class='up'>↑</span>";
          if (n === 2) box.innerHTML += "<span class='dn'>↓</span>";
          boxes.appendChild(box);
        });
        group.appendChild(boxes);
        row.appendChild(group);
      });
      configBoxesHost.appendChild(row);
    }

    var diagHead = document.createElement("div");
    diagHead.className = "orb-diag-head";
    var diagTitle = document.createElement("h4");
    diagTitle.textContent = "Diagonal Aufbau rule";
    var diagBtns = document.createElement("div");
    diagBtns.className = "ctl-row";
    var nextBtn = document.createElement("button");
    nextBtn.type = "button"; nextBtn.className = "btn primary";
    nextBtn.textContent = "Next";
    var backBtn = document.createElement("button");
    backBtn.type = "button"; backBtn.className = "btn";
    backBtn.textContent = "Previous";
    var resetBtn = document.createElement("button");
    resetBtn.type = "button"; resetBtn.className = "btn";
    resetBtn.textContent = "Reset";
    diagBtns.append(nextBtn, backBtn, resetBtn);
    diagHead.append(diagTitle, diagBtns);
    s3.appendChild(diagHead);

    var diagHint = document.createElement("p");
    diagHint.className = "orb-diag-hint";
    diagHint.innerHTML =
      "Follow the red arrows ↘. Circled numbers = fill order. " +
      "Each box also shows which elements fill that subshell. " +
      "Click any box, or use <b>Next</b> / <b>Previous</b>.";
    s3.appendChild(diagHint);

    var diagCanvas = document.createElement("canvas");
    diagCanvas.className = "orb-diag-canvas";
    diagCanvas.width = 720;
    diagCanvas.height = 460;
    diagCanvas.style.cursor = "pointer";
    s3.appendChild(diagCanvas);

    var diagNote = document.createElement("p");
    diagNote.className = "orb-note";
    s3.appendChild(diagNote);

    function paintDiagonal() {
      drawDiagonalChart(diagCanvas, fillStep);
      if (fillStep === 0) {
        diagNote.innerHTML =
          "Start at <b>1s</b> (H–He). Read ↘ along each arrow, then jump to the next diagonal. " +
          "Critical step: <b>4s (K–Ca) before 3d (Sc–Zn)</b>.";
      } else {
        var key = FILL_ORDER[fillStep - 1];
        var cap = AUFBAU[fillStep - 1][2];
        var els = SUBSHELL_ELEMENTS[key] || "";
        var path = FILL_ORDER.slice(0, fillStep).join(" → ");
        diagNote.innerHTML =
          "Step " + fillStep + ": filling <b>" + key + "</b> (" + els + ", up to " + cap + " e⁻).<br>" +
          "<span class='orb-path'>" + path + "</span>" +
          (key === "4s" ? "<br>↑ This is why Ca is <code>[Ar] 4s²</code> and Sc begins the d-block with 3d." :
           key === "3d" ? "<br>↑ d-block starts: Sc → Zn fill 3d while 4s is already occupied." : "");
      }
      nextBtn.disabled = fillStep >= FILL_ORDER.length;
      backBtn.disabled = fillStep <= 0;
    }
    nextBtn.addEventListener("click", function () {
      if (fillStep < FILL_ORDER.length) { fillStep++; paintDiagonal(); }
    });
    backBtn.addEventListener("click", function () {
      if (fillStep > 0) { fillStep--; paintDiagonal(); }
    });
    resetBtn.addEventListener("click", function () { fillStep = 0; paintDiagonal(); });

    diagCanvas.addEventListener("click", function (ev) {
      var hits = diagCanvas._orbHits;
      if (!hits) return;
      var rect = diagCanvas.getBoundingClientRect();
      var x = (ev.clientX - rect.left) * (diagCanvas.clientWidth / rect.width);
      var y = (ev.clientY - rect.top) * (diagCanvas.clientHeight / rect.height);
      for (var i = 0; i < hits.length; i++) {
        var hit = hits[i];
        if (x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h) {
          fillStep = hit.order;
          paintDiagonal();
          return;
        }
      }
    });

    /* ---------- 4. metals & exceptions ---------- */
    var s4 = section(
      "4. Why Cr and Cu break the pattern",
      "After Ca (<code>[Ar] 4s²</code>), electrons enter <b>3d</b>. For most period-4 metals the " +
      "ground state is still <code>4s² 3dⁿ</code>. <b>Cr</b> and <b>Cu</b> are different: moving one " +
      "electron from 4s into 3d reaches a half-full (d⁵) or full (d¹⁰) sublevel, and that is " +
      "lower in energy than the Aufbau guess."
    );

    var whyPrimer = document.createElement("div");
    whyPrimer.className = "orb-why-primer";
    whyPrimer.innerHTML =
      "<h4>Why a half-full or full d sublevel is special</h4>" +
      "<div class='orb-why-grid'>" +
        "<div class='orb-why-card'>" +
          "<strong>1. 4s and 3d are almost the same energy</strong>" +
          "<p>Once the atom has more than 20 electrons, 3d drops close to 4s. " +
          "Shifting one electron between them costs very little — so a small " +
          "stabilising effect can tip the balance.</p>" +
        "</div>" +
        "<div class='orb-why-card'>" +
          "<strong>2. Exchange energy (Hund)</strong>" +
          "<p>Electrons in different orbitals with the <em>same</em> spin avoid each other " +
          "better (exchange stabilisation). A half-full d⁵ has <b>five</b> unpaired, " +
          "parallel-spin electrons — maximum exchange for the d set. A full d¹⁰ is a " +
          "closed sublevel with a symmetrical, low-repulsion cloud.</p>" +
        "</div>" +
        "<div class='orb-why-card'>" +
          "<strong>3. The energy tradeoff</strong>" +
          "<p>Promoting / moving one e⁻ from 4s → 3d costs a little. Reaching d⁵ or d¹⁰ " +
          "pays that back (and more) via exchange + lower repulsion. For Cr and Cu the " +
          "payback wins; for neighbours like V, Mn, Ni, Zn it does not.</p>" +
        "</div>" +
      "</div>" +
      "<p class='orb-why-note'>IB shorthand: <b>half-full and full sublevels are especially stable</b> — " +
      "but only Cr (d⁵) and Cu (d¹⁰) in period 4 gain enough to rewrite the configuration.</p>";
    s4.appendChild(whyPrimer);

    var metalRow = document.createElement("div");
    metalRow.className = "ctl-row orb-metal-row";
    METAL_CASES.forEach(function (m, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "btn" + (ORB_EXCEPTIONS[m.z] ? " orb-ex-btn" : "");
      b.textContent = m.sym + (ORB_EXCEPTIONS[m.z] ? " ★" : "");
      b.addEventListener("click", function () {
        selectedMetal = i;
        paintMetals();
      });
      metalRow.appendChild(b);
    });
    s4.appendChild(metalRow);

    var transfer = document.createElement("div");
    transfer.className = "orb-transfer";
    s4.appendChild(transfer);

    var metalGrid = document.createElement("div");
    metalGrid.className = "orb-metal-grid";
    var naivePanel = document.createElement("div");
    naivePanel.className = "orb-metal-panel";
    var actualPanel = document.createElement("div");
    actualPanel.className = "orb-metal-panel";
    metalGrid.append(naivePanel, actualPanel);
    s4.appendChild(metalGrid);

    var metalNote = document.createElement("div");
    metalNote.className = "orb-metal-explain";
    s4.appendChild(metalNote);

    function countUnpaired(config) {
      var nOrbOf = { s: 1, p: 3, d: 5, f: 7 };
      var total = 0;
      valenceKeys(config).forEach(function (key) {
        occupancy(nOrbOf[key.charAt(1)], config[key] || 0).forEach(function (n) {
          if (n === 1) total++;
        });
      });
      return total;
    }

    function drawBoxes(panel, config, title, highlight) {
      panel.innerHTML = "";
      var h = document.createElement("h4");
      h.textContent = title;
      panel.appendChild(h);
      var row = document.createElement("div");
      row.className = "orb-boxes";
      var nOrbOf = { s: 1, p: 3, d: 5, f: 7 };
      valenceKeys(config).forEach(function (key) {
        var group = document.createElement("div");
        group.className = "orb-box-group";
        if (highlight && highlight.indexOf(key) >= 0) group.classList.add("is-hot");
        var lab = document.createElement("div");
        lab.className = "orb-box-lab";
        lab.textContent = key;
        group.appendChild(lab);
        var boxes = document.createElement("div");
        boxes.className = "orb-box-row";
        occupancy(nOrbOf[key.charAt(1)], config[key] || 0).forEach(function (n) {
          var box = document.createElement("div");
          box.className = "orb-box";
          if (n >= 1) box.innerHTML += "<span class='up'>↑</span>";
          if (n === 2) box.innerHTML += "<span class='dn'>↓</span>";
          boxes.appendChild(box);
        });
        group.appendChild(boxes);
        row.appendChild(group);
      });
      panel.appendChild(row);
      var cfg = document.createElement("code");
      cfg.textContent = configString(config);
      panel.appendChild(cfg);
      var up = document.createElement("p");
      up.className = "orb-unpaired";
      up.innerHTML = "Unpaired electrons in valence: <b>" + countUnpaired(config) + "</b>";
      panel.appendChild(up);
    }

    function paintMetals() {
      Array.prototype.forEach.call(metalRow.children, function (b, i) {
        b.setAttribute("aria-pressed", String(i === selectedMetal));
      });
      var m = METAL_CASES[selectedMetal];
      var naive = fillAufbau(m.z, false);
      var actual = fillAufbau(m.z, true);
      var isEx = !!ORB_EXCEPTIONS[m.z];

      drawBoxes(naivePanel, naive, "Aufbau prediction", isEx ? ["4s", "3d"] : null);
      drawBoxes(actualPanel, actual, "Real ground state", isEx ? ["4s", "3d"] : null);

      if (isEx) {
        var from = configString(naive).replace("[Ar] ", "");
        var to = configString(actual).replace("[Ar] ", "");
        transfer.innerHTML =
          "<div class='orb-transfer-eq'>" +
            "<code>[Ar] " + from + "</code>" +
            "<span class='orb-transfer-arrow'>→ one e⁻ from 4s into 3d →</span>" +
            "<code>[Ar] " + to + "</code>" +
          "</div>";
        if (m.z === 24) {
          metalNote.innerHTML =
            "<p><b>Chromium (Z = 24) — chasing half-full 3d⁵</b></p>" +
            "<ul>" +
            "<li><b>Aufbau guess:</b> <code>4s² 3d⁴</code>. Four 3d orbitals have one e⁻ each; " +
            "one 3d orbital is empty; 4s is paired. That is <b>4 unpaired</b> in 3d, and the " +
            "d set is neither half-full nor full.</li>" +
            "<li><b>What actually happens:</b> one 4s electron drops into the empty 3d orbital → " +
            "<code>4s¹ 3d⁵</code>. Now every 3d orbital has exactly one electron (↑↑↑↑↑). " +
            "That is <b>5 unpaired</b> in 3d — half-full.</li>" +
            "<li><b>Why that wins:</b> five parallel-spin d electrons maximise exchange energy. " +
            "The 4s–3d gap is tiny, so the exchange payoff outweighs leaving 4s half-occupied. " +
            "Count the unpaired electrons in the panels above: Aufbau gives fewer.</li>" +
            "<li><b>Exam line:</b> Cr is <code>[Ar] 4s¹ 3d⁵</code> because a half-full d sublevel " +
            "is particularly stable.</li>" +
            "</ul>";
        } else {
          metalNote.innerHTML =
            "<p><b>Copper (Z = 29) — chasing full 3d¹⁰</b></p>" +
            "<ul>" +
            "<li><b>Aufbau guess:</b> <code>4s² 3d⁹</code>. Nine electrons in five 3d orbitals " +
            "means four orbitals are paired and one has a single e⁻ — a <em>hole</em> short of " +
            "a full d set.</li>" +
            "<li><b>What actually happens:</b> one 4s electron fills that hole → " +
            "<code>4s¹ 3d¹⁰</code>. The 3d sublevel is completely full; 4s keeps one electron.</li>" +
            "<li><b>Why that wins:</b> a full d¹⁰ sublevel is a closed, symmetrical shell with " +
            "lower electron–electron repulsion. Again 4s and 3d are close in energy, so " +
            "completing d¹⁰ is worth thinning 4s to one electron.</li>" +
            "<li><b>Exam line:</b> Cu is <code>[Ar] 4s¹ 3d¹⁰</code> because a full d sublevel " +
            "is particularly stable (the Cu analogue of Cr’s half-full case).</li>" +
            "</ul>";
        }
      } else {
        transfer.innerHTML =
          "<div class='orb-transfer-eq orb-transfer-ok'>" +
            "<span>No electron shift — Aufbau matches the real configuration.</span>" +
          "</div>";
        var extra = "";
        if (m.z === 21) {
          extra =
            "<p><b>Why Sc does not exception:</b> Aufbau gives <code>4s² 3d¹</code>. Moving the " +
            "4s pair into 3d would not create d⁵ or d¹⁰ — there is no half-full/full prize to " +
            "claim, so the atom keeps the Aufbau arrangement.</p>";
        } else if (m.z === 26) {
          extra =
            "<p><b>Why Fe does not exception:</b> <code>4s² 3d⁶</code> already has a paired d " +
            "orbital. Shifting one 4s electron into 3d would give <code>4s¹ 3d⁷</code> — still " +
            "not d⁵ or d¹⁰ — so there is no special stability jackpot. Aufbau wins.</p>";
        } else if (m.z === 30) {
          extra =
            "<p><b>Why Zn needs no exception:</b> it already has <code>4s² 3d¹⁰</code> — full d " +
            "<em>and</em> full 4s. Both goals are satisfied without moving electrons.</p>";
        }
        metalNote.innerHTML =
          "<p><b>" + m.sym + " (Z = " + m.z + ")</b> — " + m.blurb + "</p>" +
          extra +
          "<p>Open <b>Cr★</b> or <b>Cu★</b> to see the cases where the half-full / full payoff " +
          "is large enough to rewrite the configuration.</p>";
      }
    }

    function paintAll() {
      paintShapes();
      paintPair();
      paintPt();
      paintConfigCard();
      paintDiagonal();
      paintMetals();
    }

    function onResize() {
      paintShapes();
      paintPair();
      paintDiagonal();
    }

    paintAll();
    window.addEventListener("resize", onResize);

    if (ctx.readout) ctx.readout.hidden = true;

    return {
      draw: paintAll,
      tick: function () {},
      plot: { resize: onResize },
      destroy: function () {
        window.removeEventListener("resize", onResize);
        host.classList.remove("orb-demo");
        if (ctx.readout) ctx.readout.hidden = false;
      }
    };
  }

  /* ---------------------------------------------------------- registry */
  var BUILDERS = {
    taylor: demoTaylor,
    projectile: demoProjectile,
    boltzmann: demoBoltzmann,
    orbitals: demoOrbitals
  };

  // app.js asks this before mounting, so a topic without a browser port gets
  // a page without an empty canvas. Removing it silently disables every demo.
  window.hasDemo = function (name) {
    return !!(name && BUILDERS[name]);
  };

  window.mountDemo = function (name, canvas, controls, readout) {
    var build = BUILDERS[name];
    if (!build) return null;

    var ctx = {
      canvas: canvas,
      controls: controls,
      readout: readout,
      say: function (html) { readout.innerHTML = html; },
      setAlt: function (text) { canvas.setAttribute("aria-label", text); },
      setLive: function (on) { readout.setAttribute("aria-live", on ? "polite" : "off"); }
    };

    var demo = build(ctx);
    var raf = null, last = null, stopped = false, visible = true;

    function loop(ts) {
      if (stopped) return;
      if (last === null) last = ts;
      var dt = Math.min(ts - last, 60);
      last = ts;
      // Off-screen or backgrounded demos keep their RAF slot but skip the
      // work - no reason to integrate trajectories nobody is looking at.
      if (visible && !document.hidden) demo.tick(dt, ts);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    var io = null;
    if (window.IntersectionObserver) {
      io = new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
      }, { threshold: 0 });
      io.observe(canvas);
    }

    // Guard on clientWidth: resize() writes style.height, which would
    // otherwise re-trigger the observer forever.
    var lastW = canvas.clientWidth;
    function onResize() {
      var w = canvas.clientWidth;
      if (w === lastW || !w) return;
      lastW = w;
      if (demo.plot) demo.plot.resize();
      demo.draw();
    }
    var ro = null;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(onResize);
      ro.observe(canvas);
    } else {
      window.addEventListener("resize", onResize);
    }

    return {
      destroy: function () {
        stopped = true;
        if (raf) cancelAnimationFrame(raf);
        if (io) io.disconnect();
        if (ro) ro.disconnect(); else window.removeEventListener("resize", onResize);
        if (demo.destroy) demo.destroy();
      }
    };
  };
})();
