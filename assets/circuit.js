// Linear predictive coding as an analog circuit.
//   prediction  ŷ = w·x          (amplifier with gain w)
//   error       ε = y − ŷ        (difference amplifier)
//   update      C·dx/dt = w·ε − x/R   (current w·ε charges the capacitor; R leaks towards the prior 0)
// The capacitor voltage x settles where the currents balance: x* = w·y / (1 + w²), the minimum of
// the energy E = ½ε² + ½x². Physics performs the inference, continuously and without a clock.
(() => {
  const svg = document.getElementById('circuit');
  if (!svg) return;
  const plot = document.getElementById('circuit-plot');
  const $ = (id) => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const add = (parent, tag, attrs = {}, text) => {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text != null) node.textContent = text;
    parent.appendChild(node);
    return node;
  };

  const s = { y: 1.5, w: 1.2, x: -0.8, t: 0 };
  const trace = [];

  // --- schematic ----------------------------------------------------------------------
  svg.setAttribute('viewBox', '0 0 980 350');
  const g = add(svg, 'g', { class: 'ckt' });
  const wire = (d, cls = '') => add(g, 'path', { d, class: `ckt-wire ${cls}` });
  const opamp = (x, y, label, sub) => {
    add(g, 'path', { d: `M${x},${y - 34} L${x + 62},${y} L${x},${y + 34} Z`, class: 'ckt-amp' });
    add(g, 'text', { x: x + 20, y: y + 5, class: 'ckt-amp-label' }, label);
    if (sub) add(g, 'text', { x: x + 6, y: y + 52, class: 'ckt-note' }, sub);
  };

  // sensor source y
  add(g, 'circle', { cx: 80, cy: 110, r: 26, class: 'ckt-source' });
  add(g, 'text', { x: 80, y: 116, 'text-anchor': 'middle', class: 'ckt-amp-label' }, 'y');
  add(g, 'text', { x: 80, y: 72, 'text-anchor': 'middle', class: 'ckt-note' }, 'sensor');
  wire('M80,136 L80,290 L60,290 M80,290 L100,290'); // ground
  add(g, 'path', { d: 'M66,298 L94,298 M72,305 L88,305', class: 'ckt-wire' });

  // difference amplifier: ε = y − ŷ
  wire('M106,110 L250,110 L250,96 L290,96', 'flow-y');
  opamp(290, 110, 'Σ', 'error  ε = y − ŷ');
  add(g, 'text', { x: 296, y: 100, class: 'ckt-sign' }, '+');
  add(g, 'text', { x: 296, y: 130, class: 'ckt-sign' }, '−');

  // weight amplifier for the update current w·ε
  wire('M352,110 L460,110', 'flow-e');
  opamp(460, 110, '×w', 'current  I = w·ε');
  wire('M522,110 L640,110', 'flow-in');

  // node x with capacitor and leak
  add(g, 'circle', { cx: 640, cy: 110, r: 5, class: 'ckt-dot' });
  wire('M640,110 L640,170', 'flow-c');
  add(g, 'path', { d: 'M618,170 L662,170 M618,182 L662,182', class: 'ckt-cap' });
  wire('M640,182 L640,232');
  add(g, 'path', { d: 'M626,232 L654,232 M632,239 L648,239', class: 'ckt-wire' });
  add(g, 'text', { x: 668, y: 200, class: 'ckt-note' }, 'C · memory');
  add(g, 'text', { x: 668, y: 216, class: 'ckt-note' }, '(holds x)');
  wire('M640,110 L760,110 L760,140', 'flow-r');
  add(g, 'path', { d: 'M760,140 l-10,6 l20,10 l-20,10 l20,10 l-20,10 l10,6', class: 'ckt-res' });
  wire('M760,192 L760,232');
  add(g, 'path', { d: 'M746,232 L774,232 M752,239 L768,239', class: 'ckt-wire' });
  add(g, 'text', { x: 782, y: 160, class: 'ckt-note' }, 'R · prior');
  add(g, 'text', { x: 782, y: 176, class: 'ckt-note' }, '(leaks x → 0)');

  // feedback: prediction ŷ = w·x (amplifier facing left, back towards the error amplifier)
  wire('M760,110 L940,110 L940,300 L482,300', 'flow-fb');
  add(g, 'path', { d: 'M482,266 L420,300 L482,334 Z', class: 'ckt-amp' });
  add(g, 'text', { x: 440, y: 305, class: 'ckt-amp-label' }, '×w');
  wire('M420,300 L250,300 L250,124 L290,124', 'flow-pred');
  add(g, 'text', { x: 506, y: 290, class: 'ckt-note' }, 'prediction  ŷ = w·x  (same weight, used top-down)');

  // live labels
  const label = (x, y, id, color) => add(g, 'text', { x, y, id, class: 'ckt-value', fill: color });
  label(130, 96, 'v-y', 'var(--ink)');
  label(366, 96, 'v-e', 'var(--err)');
  label(560, 96, 'v-i', 'var(--energy)');
  label(660, 96, 'v-x', 'var(--accent)');
  label(270, 290, 'v-p', 'var(--pred)');

  // moving charge carriers along the current-carrying wires
  const flows = [
    { path: g.querySelector('.flow-in'), current: () => s.w * (s.y - s.w * s.x) },
    { path: g.querySelector('.flow-c'), current: () => s.w * (s.y - s.w * s.x) - s.x },
    { path: g.querySelector('.flow-r'), current: () => s.x },
  ].map((f) => {
    const length = f.path.getTotalLength();
    const dots = [...Array(Math.max(2, Math.round(length / 26)))].map(() => add(g, 'circle', { r: 3.2, class: 'ckt-charge' }));
    return { ...f, length, dots, phase: 0 };
  });

  // --- simulation ---------------------------------------------------------------------
  const energy = () => 0.5 * (s.y - s.w * s.x) ** 2 + 0.5 * s.x ** 2;
  const target = () => (s.w * s.y) / (1 + s.w * s.w);

  let last = performance.now();
  let visible = true;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (visible) {
      for (let i = 0; i < 4; i++) {
        const e = s.y - s.w * s.x;
        s.x += (dt / 4) * 1.6 * (s.w * e - s.x); // C = 1/1.6 for a pleasant settling time
      }
      s.t += dt;
      trace.push([s.x, energy()]);
      if (trace.length > 360) trace.shift();
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
      const e = s.y - s.w * s.x;
      $('v-y').textContent = `y = ${s.y.toFixed(2)} V`;
      $('v-e').textContent = `ε = ${e.toFixed(2)} V`;
      $('v-i').textContent = `I = ${(s.w * e).toFixed(2)}`;
      $('v-x').textContent = `x = ${s.x.toFixed(2)} V`;
      $('v-p').textContent = `ŷ = ${(s.w * s.x).toFixed(2)}`;
      drawPlot();
    }
    requestAnimationFrame(frame);
  }

  function drawPlot() {
    if (!plot) return;
    const W = 980, H = 150, x0 = 40, x1 = 960;
    const range = 3;
    const y = (v) => H / 2 - (v / range) * (H / 2 - 14);
    const px = (i) => x0 + (i / 359) * (x1 - x0);
    const xs = trace.map((p, i) => `${px(i)},${y(p[0])}`).join(' ');
    const es = trace.map((p, i) => `${px(i)},${y(p[1])}`).join(' ');
    const ty = y(target());
    plot.setAttribute('viewBox', `0 0 ${W} ${H}`);
    plot.innerHTML = `
      <line x1="${x0}" x2="${x1}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line)"/>
      <line x1="${x0}" x2="${x1}" y1="${ty}" y2="${ty}" stroke="var(--accent)" stroke-dasharray="5 5" opacity=".7"/>
      <text x="${x1}" y="${ty - 6}" text-anchor="end" fill="var(--accent)" font-size="12">x* = w·y / (1 + w²) = ${target().toFixed(2)}</text>
      <polyline points="${es}" fill="none" stroke="var(--energy)" stroke-width="1.6" opacity=".8"/>
      <polyline points="${xs}" fill="none" stroke="var(--accent)" stroke-width="2.4"/>
      <text x="${x0}" y="16" fill="var(--accent)" font-size="12">x(t): capacitor voltage</text>
      <text x="${x0 + 170}" y="16" fill="var(--energy)" font-size="12">E(t) = ½ε² + ½x²: only goes down</text>`;
  }

  const bindRange = (id, key) => {
    const input = $(id), out = $(`${id}-out`);
    const update = () => { s[key] = parseFloat(input.value); out.textContent = s[key].toFixed(2); };
    input.addEventListener('input', update);
    update();
  };
  bindRange('ck-y', 'y');
  bindRange('ck-w', 'w');
  $('ck-kick').addEventListener('click', () => { s.x = (Math.random() * 2 - 1) * 2.5; });
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(svg);
  requestAnimationFrame(frame);
})();
