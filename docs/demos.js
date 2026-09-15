/* Browser ports of the three Python visualisations.
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
    var ratio = w < 560 ? 0.82 : w < 760 ? 0.66 : 480 / 900;
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

    var n = 1, playing = !REDUCED, lastStep = 0;

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
      n = 1; nSlider.set(1); play.stop(); draw();
    });

    function draw() {
      plot.frame();
      plot.line(xs, exact, cssVar("--ink", "#000"), 2);
      var approx = xs.map(function (x) { return taylorSin(x, n); });
      plot.line(xs, approx, cssVar("--accent", "#b4341f"), 2.5);
      plot.legend([
        { label: "sin(x)", color: cssVar("--ink", "#000") },
        { label: n + " term" + (n === 1 ? "" : "s"), color: cssVar("--accent", "#b4341f") }
      ]);

      var good = 0;
      for (var i = 0; i < xs.length; i++) {
        if (xs[i] < 0) continue;
        if (Math.abs(approx[i] - exact[i]) > 0.05) break;
        good = xs[i];
      }
      ctx.say(
        "Polynomial up to <b>x<sup>" + (2 * n - 1) + "</sup></b>. " +
        "It tracks sin(x) to within 0.05 out to about <b>x = ±" + good.toFixed(1) + "</b>" +
        " — then it escapes to infinity."
      );
      ctx.setAlt(
        "Plot of sin(x) against its Maclaurin polynomial with " + n +
        " term" + (n === 1 ? "" : "s") + ". The polynomial follows the curve out to " +
        "about x = plus or minus " + good.toFixed(1) + ", then diverges."
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

    draw();
    return { draw: draw, tick: tick, plot: plot };
  }

  /* ------------------------------------------------------ 2. Projectile */
  var G = 9.81, MASS = 0.145, DT = 0.001, SEARCH_DT = 0.004, STRIDE = 4;

  // Full integration, kept at DT so the drawn curve matches the Python.
  // Points are decimated for drawing and the ground hit is interpolated,
  // so the reported range is the real crossing rather than one step past it.
  function simulate(speed, angleDeg, dragK) {
    var th = angleDeg * Math.PI / 180;
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

  // Range only: no arrays, coarser step. Used for the optimum-angle sweep,
  // which is the expensive part and never needs the drawn resolution.
  function rangeOnly(speed, angleDeg, dragK) {
    var th = angleDeg * Math.PI / 180;
    var vx = speed * Math.cos(th), vy = speed * Math.sin(th);
    var x = 0, y = 0, px = 0, py = 0, guard = 0;
    while (y >= 0 && guard++ < 60000) {
      px = x; py = y;
      var v = Math.hypot(vx, vy);
      vx += (-dragK * v * vx / MASS) * SEARCH_DT;
      vy += (-G - dragK * v * vy / MASS) * SEARCH_DT;
      x += vx * SEARCH_DT; y += vy * SEARCH_DT;
    }
    return py > y ? px + (x - px) * (py / (py - y)) : x;
  }

  // Coarse 5-degree sweep, then refine. ~24 flights instead of 71.
  function bestAngle(speed, dragK) {
    var best = 45, bestR = -1, a, r;
    for (a = 10; a <= 80; a += 5) {
      r = rangeOnly(speed, a, dragK);
      if (r > bestR) { bestR = r; best = a; }
    }
    var lo = Math.max(10, best - 4), hi = Math.min(80, best + 4);
    for (a = lo; a <= hi; a++) {
      r = rangeOnly(speed, a, dragK);
      if (r > bestR) { bestR = r; best = a; }
    }
    return best;
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
       angle is a 24-flight sweep and must not: running it on every input
       event blocked the main thread for 50-130ms a time, which read as the
       page freezing. It is debounced, and the readout says so meanwhile. */
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
        optDrag = bestAngle(speed, dragK);
        optVac = bestAngle(speed, 0);
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
  var K_B = 1.380649e-23, N_A = 6.02214076e23;

  function mbDistribution(v, T, mass) {
    var a = mass / (2 * K_B * T);
    return 4 * Math.PI * v * v * Math.pow(a / Math.PI, 1.5) * Math.exp(-a * v * v);
  }

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
    var D = { T: 300, eaKJ: 50 };
    var T = D.T, eaKJ = D.eaKJ, playing = !REDUCED, dir = 1, logY = true;
    var FLOOR = -14;

    function applyScale() {
      if (logY) {
        plot.set({
          xmin: 0, xmax: 2500, ymin: FLOOR, ymax: -2,
          xlabel: "molecular speed / m s⁻¹",
          ylabel: "fraction of molecules (log scale)",
          ylabelShort: "fraction (log)",
          xticks: 5, yticks: 6, yIntegral: true,
          fmtY: function (v) { return "10" + sup(Math.round(v)); }
        });
      } else {
        plot.set({
          xmin: 0, xmax: 2500, ymin: 0, ymax: 0.0022,
          xlabel: "molecular speed / m s⁻¹",
          ylabel: "fraction of molecules",
          ylabelShort: "fraction",
          xticks: 5, yticks: 4,
          fmtY: function (v) { return v === 0 ? "0" : sciText(v, 1); }
        });
      }
    }

    var plot = new Plot(ctx.canvas, {
      xmin: 0, xmax: 2500, ymin: 0, ymax: 0.0022,
      xlabel: "molecular speed / m s⁻¹", ylabel: "fraction of molecules",
      xticks: 5, yticks: 4
    });
    applyScale();

    function ymap(y) {
      if (!logY) return y;
      return y <= 0 ? FLOOR : Math.max(FLOOR, Math.log(y) / Math.LN10);
    }

    var vs = [];
    for (var i = 0; i <= 600; i++) vs.push(2500 * i / 600);

    var tSlider = slider(ctx.controls, {
      label: "Temperature", min: 250, max: 600, value: T,
      format: function (v) { return v + " K"; },
      onInput: function (v) { T = v; play.stop(); draw(); }
    });
    var eSlider = slider(ctx.controls, {
      label: "Activation energy", min: 10, max: 80, value: eaKJ,
      format: function (v) { return v + " kJ/mol"; },
      onInput: function (v) { eaKJ = v; draw(); }
    });

    var row = buttonRow(ctx.controls);
    var play = playButton(row, ctx,
      function () { return playing; },
      function (v) { playing = v; });
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
      play.stop(); draw();
    });

    function vEa() { return Math.sqrt(2 * (eaKJ * 1000 / N_A) / MASS); }

    function draw() {
      var ve = vEa();
      plot.frame();

      [300, 500].forEach(function (Tref) {
        var ysr = vs.map(function (v) { return ymap(mbDistribution(v, Tref, MASS)); });
        plot.line(vs, ysr, cssVar("--plot-ref", "#999"), 1.5);
      });

      var ys = vs.map(function (v) { return ymap(mbDistribution(v, T, MASS)); });
      // --plot-fill, not --accent-soft: the old fill measured 1.1:1 against
      // the canvas, so the one thing this topic exists to show was invisible.
      plot.fillUnder(vs, ys, cssVar("--plot-fill", "rgba(180,52,31,.3)"), ve);
      plot.line(vs, ys, cssVar("--accent", "#b4341f"), 2.5);
      plot.vline(ve, cssVar("--ink", "#000"), "Ea = " + eaKJ + " kJ/mol");
      plot.legend([
        { label: Math.round(T) + " K", color: cssVar("--accent", "#b4341f") },
        { label: "300 K / 500 K", color: cssVar("--plot-ref", "#999"), width: 1.5 }
      ]);

      var frac = fractionAbove(ve, T, MASS);
      var base = fractionAbove(ve, 300, MASS);
      ctx.say(
        "At <b>" + Math.round(T) + " K</b>, <b>" + sciHTML(frac) +
        "</b> of molecules clear the barrier — that is <b>" +
        (frac / base).toFixed(2) + "×</b> the fraction at 300 K. " +
        (logY
          ? "On this log axis every gridline is 10× — watch the shaded tail climb."
          : "Notice how little the peak moves. The tail past Ea is far too small to see here, which is exactly why it needs a log axis.")
      );
      ctx.setAlt(
        "Maxwell-Boltzmann speed distribution at " + Math.round(T) +
        " kelvin, with the area past the activation energy shaded. " +
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

  /* ---------------------------------------------------------- registry */
  var BUILDERS = {
    taylor: demoTaylor,
    projectile: demoProjectile,
    boltzmann: demoBoltzmann
  };

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
