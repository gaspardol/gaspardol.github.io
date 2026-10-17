// Predictive coding that learns, as an analog circuit.
//   Two sensors y = (y₁, y₂) are explained by one cause x through two weights w = (w₁, w₂).
//   inference (fast)   C·dx/dt  = w·ε − x          the capacitor settles on the belief
//   learning  (slow)   τ·dwᵢ/dt = εᵢ·x − α·wᵢ      each crossing updates its own conductance
// Both are gradient descent on E = ½|ε|² + ½x² + ½α|w|², with ε = y − w·x.
// Readings stream in from a cloud stretched along a hidden direction. w turns to point along it
// (the cloud's first principal component) using only the voltages present at each crossing.
(() => {
  const svg = document.getElementById('learn-circuit');
  if (!svg) return;
  const plane = document.getElementById('learn-plane');
  const plot = document.getElementById('learn-plot');
  const $ = (id) => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const add = (parent, tag, attrs = {}, text) => {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text != null) node.textContent = text;
    parent.appendChild(node);
    return node;
  };

  // kx: inference speed (1/C), alpha: weight leak, hold: seconds each reading stays on the sensors.
  const P = { kx: 10, alpha: 0.2, hold: 0.45, major: 1.3, minor: 0.28 };
  const s = { y: [0, 0], x: 0, w: [-0.35, 0.45], eta: 0.6, theta: Math.PI / 6, clock: 0, hold: P.hold };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
  const draw = () => {
    const a = gauss() * P.major, b = gauss() * P.minor, c = Math.cos(s.theta), d = Math.sin(s.theta);
    return [a * c - b * d, a * d + b * c].map((v) => Math.max(-2.9, Math.min(2.9, v)));
  };
  const err = () => [s.y[0] - s.w[0] * s.x, s.y[1] - s.w[1] * s.x];
  const offAxis = () => {
    const d = Math.abs(Math.atan2(s.w[1], s.w[0]) - s.theta) % Math.PI;
    return (Math.min(d, Math.PI - d) * 180) / Math.PI;
  };
  const sub = (i) => '₁₂'[i];

  // --- schematic ----------------------------------------------------------------------
  svg.setAttribute('viewBox', '0 0 700 380');
  const g = add(svg, 'g');
  const wire = (d, cls = '') => add(g, 'path', { d, class: `ckt-wire ${cls}` });
  const ROWS = [104, 246], COL = 470, NODE = [604, 175];
  add(g, 'text', { x: 24, y: 34, class: 'ckt-note' }, 'readings stream in →');
  add(g, 'text', { x: COL - 46, y: 34, class: 'ckt-note' }, 'belief column x');
  add(g, 'path', { d: `M${COL},50 L${COL},${ROWS[1] + 74}`, class: 'ckt-wire', 'stroke-dasharray': '2 4' });
  const cells = ROWS.map((ry, i) => {
    // sensor
    add(g, 'circle', { cx: 56, cy: ry, r: 22, class: 'ckt-source' });
    add(g, 'text', { x: 56, y: ry + 6, 'text-anchor': 'middle', class: 'ckt-amp-label' }, `y${sub(i)}`);
    wire(`M78,${ry} L160,${ry} L160,${ry - 14} L178,${ry - 14}`);
    // error amplifier: εᵢ = yᵢ − ŷᵢ
    add(g, 'path', { d: `M178,${ry - 32} L238,${ry} L178,${ry + 32} Z`, class: 'ckt-amp' });
    add(g, 'text', { x: 192, y: ry + 6, class: 'ckt-amp-label' }, 'Σ');
    add(g, 'text', { x: 183, y: ry - 9, class: 'ckt-sign' }, '+');
    add(g, 'text', { x: 183, y: ry + 22, class: 'ckt-sign' }, '−');
    // error row into the crossing, prediction row back out of it
    wire(`M238,${ry} L${COL},${ry}`);
    wire(`M${COL},${ry + 42} L148,${ry + 42} L148,${ry + 14} L178,${ry + 14}`);
    add(g, 'text', { x: 252, y: ry - 10, class: 'ckt-value', fill: 'var(--err)', id: `lc-e${i}` });
    add(g, 'text', { x: 252, y: ry + 60, class: 'ckt-value', fill: 'var(--pred)', id: `lc-p${i}` });
    add(g, 'text', { x: 24, y: ry + 46, class: 'ckt-value', fill: 'var(--ink)', id: `lc-y${i}` });
    // the crossing: one plastic conductance
    const glow = add(g, 'rect', { x: COL - 24, y: ry - 22, width: 48, height: 86, rx: 10, fill: 'none', stroke: 'var(--gold)', 'stroke-width': 6, opacity: 0 });
    const cell = add(g, 'rect', { x: COL - 18, y: ry - 16, width: 36, height: 74, rx: 7, stroke: 'var(--ink)', 'stroke-width': 1.8 });
    add(g, 'text', { x: COL, y: ry + 26, 'text-anchor': 'middle', class: 'ckt-amp-label' }, `w${sub(i)}`);
    const value = add(g, 'text', { x: COL + 30, y: ry + 4, class: 'ckt-value', fill: 'var(--ink)' });
    add(g, 'text', { x: COL + 30, y: ry + 22, class: 'ckt-note' }, `Δw${sub(i)} ∝ ε${sub(i)}·x`);
    return { cell, glow, value };
  });
  // belief column: the crossings' currents add up (Kirchhoff) and charge the capacitor
  wire(`M${COL},${ROWS[0] + 58} L${COL},${NODE[1]}`, 'flow-1');
  wire(`M${COL},${ROWS[1] - 16} L${COL},${NODE[1]}`, 'flow-2');
  wire(`M${COL},${NODE[1]} L${NODE[0]},${NODE[1]}`, 'flow-in');
  add(g, 'circle', { cx: COL, cy: NODE[1], r: 4.5, class: 'ckt-dot' });
  add(g, 'circle', { cx: NODE[0], cy: NODE[1], r: 5, class: 'ckt-dot' });
  add(g, 'text', { x: COL + 12, y: NODE[1] + 20, class: 'ckt-note' }, 'Σ wᵢ·εᵢ');
  add(g, 'text', { x: NODE[0] - 6, y: NODE[1] - 16, class: 'ckt-value', fill: 'var(--accent)', id: 'lc-x' });
  wire(`M${NODE[0]},${NODE[1]} L${NODE[0]},${NODE[1] + 52}`, 'flow-c');
  add(g, 'path', { d: `M${NODE[0] - 22},${NODE[1] + 52} L${NODE[0] + 22},${NODE[1] + 52} M${NODE[0] - 22},${NODE[1] + 64} L${NODE[0] + 22},${NODE[1] + 64}`, class: 'ckt-cap' });
  wire(`M${NODE[0]},${NODE[1] + 64} L${NODE[0]},${NODE[1] + 104}`);
  add(g, 'path', { d: `M${NODE[0] - 14},${NODE[1] + 104} L${NODE[0] + 14},${NODE[1] + 104} M${NODE[0] - 8},${NODE[1] + 111} L${NODE[0] + 8},${NODE[1] + 111}`, class: 'ckt-wire' });
  add(g, 'text', { x: NODE[0] - 74, y: NODE[1] + 136, class: 'ckt-note' }, 'C · holds x');
  wire(`M${NODE[0]},${NODE[1]} L${NODE[0] + 68},${NODE[1]} L${NODE[0] + 68},${NODE[1] + 30}`, 'flow-r');
  add(g, 'path', { d: `M${NODE[0] + 68},${NODE[1] + 30} l-10,6 l20,10 l-20,10 l20,10 l-20,10 l10,6`, class: 'ckt-res' });
  wire(`M${NODE[0] + 68},${NODE[1] + 82} L${NODE[0] + 68},${NODE[1] + 104}`);
  add(g, 'path', { d: `M${NODE[0] + 54},${NODE[1] + 104} L${NODE[0] + 82},${NODE[1] + 104} M${NODE[0] + 60},${NODE[1] + 111} L${NODE[0] + 76},${NODE[1] + 111}`, class: 'ckt-wire' });
  add(g, 'text', { x: NODE[0] + 34, y: NODE[1] + 136, class: 'ckt-note' }, 'R · prior');

  const flows = [
    { path: g.querySelector('.flow-1'), current: () => s.w[0] * err()[0] },
    { path: g.querySelector('.flow-2'), current: () => s.w[1] * err()[1] },
    { path: g.querySelector('.flow-in'), current: () => s.w[0] * err()[0] + s.w[1] * err()[1] },
    { path: g.querySelector('.flow-c'), current: () => s.w[0] * err()[0] + s.w[1] * err()[1] - s.x },
    { path: g.querySelector('.flow-r'), current: () => s.x },
  ].map((f) => {
    const length = f.path.getTotalLength();
    const dots = [...Array(Math.max(2, Math.round(length / 24)))].map(() => add(g, 'circle', { r: 3, class: 'ckt-charge' }));
    return { ...f, length, dots, phase: 0 };
  });

  // --- data plane: readings, the line of possible predictions, and w --------------------
  const R = 3.2, SIZE = 360, scale = SIZE / (2 * R);
  const px = (v) => SIZE / 2 + v * scale, py = (v) => SIZE / 2 - v * scale;
  plane.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
  const pg = add(plane, 'g');
  for (let k = -3; k <= 3; k++) {
    add(pg, 'line', { x1: px(k), x2: px(k), y1: 0, y2: SIZE, stroke: 'var(--line)', 'stroke-width': k ? 0.6 : 1.2 });
    add(pg, 'line', { y1: py(k), y2: py(k), x1: 0, x2: SIZE, stroke: 'var(--line)', 'stroke-width': k ? 0.6 : 1.2 });
  }
  add(pg, 'text', { x: SIZE - 8, y: py(0) - 8, 'text-anchor': 'end', class: 'ckt-note' }, 'y₁');
  add(pg, 'text', { x: px(0) + 8, y: 16, class: 'ckt-note' }, 'y₂');
  const history = [...Array(80)].map(() => add(pg, 'circle', { r: 3, fill: 'var(--muted)', opacity: 0 }));
  const model = add(pg, 'line', { stroke: 'var(--accent)', 'stroke-width': 1.6, 'stroke-dasharray': '6 5', opacity: 0.8 });
  const errLine = add(pg, 'line', { stroke: 'var(--err)', 'stroke-width': 2.2 });
  const arrow = add(pg, 'line', { x1: px(0), y1: py(0), stroke: 'var(--accent)', 'stroke-width': 3.2, 'stroke-linecap': 'round' });
  const head = add(pg, 'path', { fill: 'var(--accent)' });
  const wLabel = add(pg, 'text', { class: 'ckt-value', fill: 'var(--accent)' }, 'w');
  const pred = add(pg, 'circle', { r: 6, fill: 'var(--surface)', stroke: 'var(--pred)', 'stroke-width': 2.4 });
  const reading = add(pg, 'circle', { r: 6, fill: 'var(--ink)' });
  add(pg, 'text', { x: 10, y: SIZE - 12, class: 'ckt-note' }, 'click to hold your own reading');
  const seen = [];

  function drawPlane() {
    seen.forEach(([a, b], i) => {
      const dot = history[i];
      dot.setAttribute('cx', px(a)); dot.setAttribute('cy', py(b));
      dot.setAttribute('opacity', (0.12 + 0.5 * (i / seen.length)).toFixed(2));
    });
    const n = Math.hypot(s.w[0], s.w[1]) || 1, ux = s.w[0] / n, uy = s.w[1] / n;
    model.setAttribute('x1', px(-ux * 5)); model.setAttribute('y1', py(-uy * 5));
    model.setAttribute('x2', px(ux * 5)); model.setAttribute('y2', py(uy * 5));
    const tip = [px(s.w[0]), py(s.w[1])];
    arrow.setAttribute('x2', tip[0] - ux * 7); arrow.setAttribute('y2', tip[1] + uy * 7);
    const back = [tip[0] - ux * 12, tip[1] + uy * 12], side = [-uy * 6, -ux * 6];
    head.setAttribute('d', `M${tip[0]},${tip[1]} L${back[0] + side[0]},${back[1] + side[1]} L${back[0] - side[0]},${back[1] - side[1]} Z`);
    wLabel.setAttribute('x', tip[0] + ux * 12 - uy * 12 - 4); wLabel.setAttribute('y', tip[1] - uy * 12 - ux * 12 + 4);
    const yh = [s.w[0] * s.x, s.w[1] * s.x];
    pred.setAttribute('cx', px(yh[0])); pred.setAttribute('cy', py(yh[1]));
    reading.setAttribute('cx', px(s.y[0])); reading.setAttribute('cy', py(s.y[1]));
    errLine.setAttribute('x1', px(yh[0])); errLine.setAttribute('y1', py(yh[1]));
    errLine.setAttribute('x2', px(s.y[0])); errLine.setAttribute('y2', py(s.y[1]));
  }

  // --- learning curve: one point per reading --------------------------------------------
  const curve = [];
  let avg = null;
  const marks = [];
  function drawPlot() {
    if (!plot) return;
    const W = Math.max(300, Math.round(plot.getBoundingClientRect().width) || 980), narrow = W < 640;
    const H = narrow ? 132 : 120, top = narrow ? 44 : 28, x0 = narrow ? 16 : 40, x1 = W - (narrow ? 16 : 20), N = 200;
    const fx = (i) => x0 + (i / (N - 1)) * (x1 - x0);
    const fe = (v) => H - 14 - Math.min(1, v / 1.2) * (H - 14 - top);
    const fa = (v) => H - 14 - (v / 90) * (H - 14 - top);
    const es = curve.map((p, i) => `${fx(i).toFixed(1)},${fe(p[0]).toFixed(1)}`).join(' ');
    const as = curve.map((p, i) => `${fx(i).toFixed(1)},${fa(p[1]).toFixed(1)}`).join(' ');
    const ticks = marks.map((i) => `<line x1="${fx(i)}" x2="${fx(i)}" y1="${top - 2}" y2="${H - 14}" stroke="var(--muted)" stroke-dasharray="2 4"/>`).join('');
    plot.setAttribute('viewBox', `0 0 ${W} ${H}`);
    plot.innerHTML = `
      <line x1="${x0}" x2="${x1}" y1="${H - 14}" y2="${H - 14}" stroke="var(--line)"/>${ticks}
      <polyline points="${as}" fill="none" stroke="var(--accent)" stroke-width="2.2"/>
      <polyline points="${es}" fill="none" stroke="var(--err)" stroke-width="1.8" opacity=".85"/>
      <text x="${x0}" y="16" fill="var(--accent)" font-size="12">angle between w and the data (0–90°)</text>
      <text x="${narrow ? x0 : x0 + 300}" y="${narrow ? 32 : 16}" fill="var(--err)" font-size="12">prediction error ½|ε|², averaged over readings</text>`;
  }

  function endReading() {
    const e = err();
    const energy = 0.5 * (e[0] ** 2 + e[1] ** 2);
    avg = avg == null ? energy : avg + 0.12 * (energy - avg);
    curve.push([avg, offAxis()]);
    if (curve.length > 200) { curve.shift(); for (let i = marks.length - 1; i >= 0; i--) if (--marks[i] < 0) marks.splice(i, 1); }
    seen.push(s.y.slice());
    if (seen.length > history.length) seen.shift();
    s.y = draw();
    s.hold = P.hold;
    s.clock = 0;
  }

  // --- simulation ---------------------------------------------------------------------
  let last = performance.now();
  let visible = true;
  s.y = draw();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (visible) {
      const steps = 8, h = dt / steps;
      for (let k = 0; k < steps; k++) {
        const e = err();
        const dx = P.kx * (s.w[0] * e[0] + s.w[1] * e[1] - s.x);
        s.w = s.w.map((w, i) => w + h * s.eta * (e[i] * s.x - P.alpha * w));
        s.x += h * dx;
      }
      s.clock += dt;
      if (s.clock >= s.hold) endReading();
      const e = err();
      flows.forEach((f) => {
        const current = f.current();
        f.phase = (f.phase + current * 60 * dt + f.length * 10) % f.length;
        const spacing = f.length / f.dots.length;
        f.dots.forEach((dot, i) => {
          const p = f.path.getPointAtLength((f.phase + i * spacing) % f.length);
          dot.setAttribute('cx', p.x);
          dot.setAttribute('cy', p.y);
          dot.style.opacity = Math.min(1, Math.abs(current) * 1.4 + 0.08);
        });
      });
      cells.forEach((c, i) => {
        const w = s.w[i], tone = w >= 0 ? 'var(--accent)' : 'var(--pred)';
        c.cell.setAttribute('fill', `color-mix(in srgb, ${tone} ${Math.round(Math.min(1, Math.abs(w) / 1.6) * 85)}%, var(--surface))`);
        c.glow.setAttribute('opacity', Math.min(0.9, Math.abs(e[i] * s.x) * s.eta * 1.6).toFixed(2));
        c.value.textContent = `w${sub(i)} = ${w.toFixed(2)}`;
        $(`lc-e${i}`).textContent = `ε${sub(i)} = ${e[i].toFixed(2)}`;
        $(`lc-p${i}`).textContent = `ŷ${sub(i)} = ${(w * s.x).toFixed(2)}`;
        $(`lc-y${i}`).textContent = `${s.y[i].toFixed(2)} V`;
      });
      $('lc-x').textContent = `x = ${s.x.toFixed(2)} V`;
      $('lc-readout').textContent = `w points ${offAxis().toFixed(0)}° off the data's axis`;
      drawPlane();
      drawPlot();
    }
    requestAnimationFrame(frame);
  }

  const eta = $('lc-eta'), etaOut = $('lc-eta-out');
  const setEta = () => { s.eta = parseFloat(eta.value); etaOut.textContent = s.eta.toFixed(2); };
  eta.addEventListener('input', setEta);
  setEta();
  $('lc-rotate').addEventListener('click', () => {
    s.theta = (s.theta + (Math.PI / 180) * (50 + Math.random() * 80)) % Math.PI;
    seen.length = 0;
    marks.push(curve.length);
    endReading();
  });
  $('lc-scramble').addEventListener('click', () => {
    const a = Math.random() * Math.PI * 2, r = 0.4 + Math.random() * 0.3;
    s.w = [r * Math.cos(a), r * Math.sin(a)];
    marks.push(curve.length);
  });
  plane.addEventListener('pointerdown', (event) => {
    const m = plane.getScreenCTM();
    if (!m) return;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(m.inverse());
    s.y = [(p.x - SIZE / 2) / scale, (SIZE / 2 - p.y) / scale].map((v) => Math.max(-2.9, Math.min(2.9, v)));
    s.clock = 0;
    s.hold = 1.6;
  });
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(svg.closest('figure') || svg);
  requestAnimationFrame(frame);
})();
