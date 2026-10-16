// The energy machine: a 3-layer linear predictive coding network drawn as springs.
// Each layer predicts the one below (μ = w · x_above). A prediction error ε = x − μ is a
// stretched spring; the network's energy is the total spring tension E = ½ Σ ε².
// Inference = let the free nodes slide downhill on E. Learning = nudge the weights so the
// springs are less stretched next time (a local, Hebbian rule).
(() => {
  const canvas = document.getElementById('energy-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = 1000, H = 440;
  const ROWS = [
    { key: 'x2', label: 'Layer 2 · hidden cause', y: 78 },
    { key: 'x1', label: 'Layer 1 · hidden feature', y: 196 },
    { key: 'x0', label: 'Sensory input · clamped to the data', y: 314 },
  ];
  const TRACK = { x0: 70, x1: 690, min: -3, max: 3 };
  const CHART = { x: 740, y: 40, w: 230, h: 300 };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const s = { x2: 0.2, x1: 0.1, x0: 1.8, w1: 0.6, w2: 0.5, relaxing: true, learning: false, auto: !reduced };
  let energyTrace = [];
  let settled = [];
  let drag = null;
  let trialClock = 0;
  let colors = {};

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const readColors = () => {
    colors = {
      ink: css('--ink'), muted: css('--muted'), line: css('--line'), err: css('--err'), pred: css('--pred'),
      energy: css('--energy'), accent: css('--accent'), surface: css('--surface'), surface2: css('--surface-2'),
    };
  };

  const errors = () => {
    const e2 = s.x2;                 // prior: the top cause is expected around 0
    const e1 = s.x1 - s.w2 * s.x2;   // layer 1 vs prediction from layer 2
    const e0 = s.x0 - s.w1 * s.x1;   // data vs prediction from layer 1
    return { e0, e1, e2, E: 0.5 * (e0 * e0 + e1 * e1 + e2 * e2) };
  };

  function step(dt) {
    const { e0, e1, e2 } = errors();
    if (s.relaxing) {
      // Gradient descent on E for the free nodes: each node feels its own error (pull towards
      // its prediction) and the error it causes below (pushed through the weight).
      if (drag !== 'x1') s.x1 += dt * (-e1 + s.w1 * e0);
      if (drag !== 'x2') s.x2 += dt * (-e2 + s.w2 * e1);
    }
    if (s.learning) {
      // Weight change = error below × activity above: purely local.
      const eta = 0.18;
      s.w1 += eta * dt * e0 * s.x1;
      s.w2 += eta * dt * e1 * s.x2;
      s.w1 = Math.max(-3, Math.min(3, s.w1));
      s.w2 = Math.max(-3, Math.min(3, s.w2));
    }
  }

  function newInput() {
    const sign = Math.random() < 0.5 ? -1 : 1;
    s.x0 = sign * (1.3 + Math.random() * 1.2);
    trialClock = 0;
  }

  // --- drawing ------------------------------------------------------------------------

  const toX = (v) => TRACK.x0 + ((v - TRACK.min) / (TRACK.max - TRACK.min)) * (TRACK.x1 - TRACK.x0);
  const fromX = (px) => TRACK.min + ((px - TRACK.x0) / (TRACK.x1 - TRACK.x0)) * (TRACK.max - TRACK.min);
  const clampV = (v) => Math.max(TRACK.min, Math.min(TRACK.max, v));

  function mix(a, b, t) {
    const pa = parse(a), pb = parse(b);
    if (!pa || !pb) return b;
    return `rgb(${pa.map((c, i) => Math.round(c + (pb[i] - c) * t)).join(',')})`;
  }
  function parse(c) {
    const m = c.match(/^#([0-9a-f]{6})$/i);
    if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
    const r = c.match(/\d+(\.\d+)?/g);
    return r ? r.slice(0, 3).map(Number) : null;
  }

  function spring(xa, xb, y, tension) {
    const len = xb - xa;
    if (Math.abs(len) < 2) return;
    const coils = Math.max(4, Math.min(14, Math.round(Math.abs(len) / 18)));
    const amp = Math.max(3, 11 - Math.abs(len) / 40);
    ctx.beginPath();
    ctx.moveTo(xa, y);
    for (let i = 1; i < coils * 2; i++) {
      const t = i / (coils * 2);
      ctx.lineTo(xa + len * t, y + (i % 2 ? -amp : amp));
    }
    ctx.lineTo(xb, y);
    ctx.strokeStyle = mix(colors.muted, colors.err, Math.min(1, tension / 1.6));
    ctx.lineWidth = 1.6 + Math.min(2.4, tension);
    ctx.stroke();
  }

  function arrow(x1, y1, x2, y2, label) {
    ctx.strokeStyle = colors.pred;
    ctx.fillStyle = colors.pred;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    const cx = (x1 + x2) / 2 + 40;
    ctx.moveTo(x1, y1 + 14);
    ctx.quadraticCurveTo(cx, (y1 + y2) / 2, x2, y2 - 18);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x2, y2 - 12);
    ctx.lineTo(x2 - 5, y2 - 21);
    ctx.lineTo(x2 + 5, y2 - 21);
    ctx.fill();
    ctx.font = '500 11px "Geist Mono", monospace';
    ctx.fillText(label, cx - 6, (y1 + y2) / 2 + 4);
  }

  function draw() {
    const { e0, e1, e2, E } = errors();
    ctx.clearRect(0, 0, W, H);
    const values = { x2: s.x2, x1: s.x1, x0: s.x0 };
    const preds = { x2: 0, x1: s.w2 * s.x2, x0: s.w1 * s.x1 };
    const errs = { x2: e2, x1: e1, x0: e0 };

    ROWS.forEach((row, i) => {
      ctx.fillStyle = colors.muted;
      ctx.font = '500 11px "Geist Mono", monospace';
      ctx.fillText(row.label.toUpperCase(), TRACK.x0, row.y - 30);
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(TRACK.x0, row.y);
      ctx.lineTo(TRACK.x1, row.y);
      ctx.stroke();
      for (let v = -3; v <= 3; v++) {
        ctx.fillStyle = colors.line;
        ctx.fillRect(toX(v) - 0.5, row.y - 5, 1, 10);
      }
      const xp = toX(clampV(preds[row.key]));
      const xv = toX(clampV(values[row.key]));
      spring(xp, xv, row.y, Math.abs(errs[row.key]));
      // prediction (hollow, dashed)
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = colors.pred;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(xp, row.y, 11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // value node
      ctx.fillStyle = row.key === 'x0' ? colors.ink : colors.accent;
      ctx.beginPath();
      if (row.key === 'x0') ctx.roundRect(xv - 12, row.y - 12, 24, 24, 5);
      else ctx.arc(xv, row.y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colors.muted;
      ctx.font = '11px "Geist Mono", monospace';
      ctx.fillText(`ε = ${errs[row.key] >= 0 ? ' ' : ''}${errs[row.key].toFixed(2)}`, TRACK.x1 - 74, row.y - 30);
      if (i < ROWS.length - 1) {
        const below = ROWS[i + 1];
        arrow(xv, row.y, toX(clampV(preds[below.key])), below.y, `× w${below.key === 'x1' ? '₂' : '₁'} = ${(below.key === 'x1' ? s.w2 : s.w1).toFixed(2)}`);
      }
    });
    ctx.fillStyle = colors.muted;
    ctx.font = '11px "Geist Mono", monospace';
    ctx.fillText('top layer’s prediction = its prior (0)', toX(0) - 92, ROWS[0].y + 32);

    // energy chart
    ctx.fillStyle = colors.surface2;
    ctx.beginPath();
    ctx.roundRect(CHART.x, CHART.y, CHART.w, CHART.h, 10);
    ctx.fill();
    ctx.fillStyle = colors.muted;
    ctx.font = '500 11px "Geist Mono", monospace';
    ctx.fillText('ENERGY  E = ½ Σ ε²', CHART.x + 14, CHART.y + 24);
    ctx.fillStyle = colors.energy;
    ctx.font = '400 34px "Instrument Serif", Georgia, serif';
    ctx.fillText(E.toFixed(3), CHART.x + 14, CHART.y + 60);
    const top = Math.max(2.5, ...energyTrace) * 1.05;
    const px = (i) => CHART.x + 14 + (i / 299) * (CHART.w - 28);
    const py = (v) => CHART.y + CHART.h - 18 - (v / top) * (CHART.h - 100);
    ctx.strokeStyle = colors.energy;
    ctx.lineWidth = 2;
    ctx.beginPath();
    energyTrace.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v))));
    ctx.stroke();
    if (settled.length > 1) {
      ctx.fillStyle = colors.err;
      const n = settled.length;
      settled.forEach((v, i) => {
        ctx.beginPath();
        ctx.arc(CHART.x + 14 + (i / Math.max(1, n - 1)) * (CHART.w - 28), py(v), 2.4, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.fillStyle = colors.muted;
    ctx.font = '10.5px "Geist Mono", monospace';
    ctx.fillText('— energy over time', CHART.x + 14, CHART.y + CHART.h + 18);
    ctx.fillStyle = colors.err;
    ctx.fillText('● left after settling', CHART.x + 14, CHART.y + CHART.h + 34);
  }

  // --- loop ---------------------------------------------------------------------------

  let last = performance.now();
  let visible = true;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (visible) {
      for (let i = 0; i < 6; i++) step(dt * 0.8);
      const { E } = errors();
      energyTrace.push(E);
      if (energyTrace.length > 300) energyTrace.shift();
      if (s.auto && !drag) {
        trialClock += dt;
        if (trialClock > 2.6) {
          settled.push(E);
          if (settled.length > 40) settled.shift();
          newInput();
        }
      }
      draw();
      readout();
    }
    requestAnimationFrame(frame);
  }

  const out = document.getElementById('energy-readout');
  function readout() {
    if (!out) return;
    const { E } = errors();
    out.textContent = `E = ${E.toFixed(3)}   w₁ = ${s.w1.toFixed(2)}   w₂ = ${s.w2.toFixed(2)}`;
  }

  // --- interaction --------------------------------------------------------------------

  function pointer(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * W, y: ((event.clientY - rect.top) / rect.height) * H };
  }
  canvas.addEventListener('pointerdown', (event) => {
    const p = pointer(event);
    const row = ROWS.find((r) => Math.abs(r.y - p.y) < 30 && p.x > TRACK.x0 - 20 && p.x < TRACK.x1 + 20);
    if (!row) return;
    drag = row.key;
    s[drag] = clampV(fromX(p.x));
    canvas.setPointerCapture(event.pointerId);
    trialClock = 0;
  });
  canvas.addEventListener('pointermove', (event) => {
    const p = pointer(event);
    if (drag) { s[drag] = clampV(fromX(p.x)); trialClock = 0; }
    else {
      const over = ROWS.some((r) => Math.abs(r.y - p.y) < 30 && p.x > TRACK.x0 - 20 && p.x < TRACK.x1 + 20);
      canvas.style.cursor = over ? 'grab' : 'default';
    }
  });
  const release = () => { drag = null; };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  const bind = (id, fn) => document.getElementById(id)?.addEventListener('click', fn);
  const press = (id, on) => document.getElementById(id)?.setAttribute('aria-pressed', String(on));
  bind('em-new', () => { newInput(); });
  bind('em-relax', () => { s.relaxing = !s.relaxing; press('em-relax', s.relaxing); });
  bind('em-learn', () => { s.learning = !s.learning; press('em-learn', s.learning); if (s.learning) settled = []; });
  bind('em-auto', () => { s.auto = !s.auto; press('em-auto', s.auto); trialClock = 0; });
  bind('em-reset', () => { Object.assign(s, { x2: 0.2, x1: 0.1, x0: 1.8, w1: 0.6, w2: 0.5 }); energyTrace = []; settled = []; });
  press('em-relax', s.relaxing);
  press('em-learn', s.learning);
  press('em-auto', s.auto);

  // HiDPI canvas
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    readColors();
  }
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('themechange', readColors);
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', readColors);
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
  requestAnimationFrame(frame);
})();
