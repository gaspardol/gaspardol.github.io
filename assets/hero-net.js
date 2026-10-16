// Home hero: an organic network of neurons drawn in ink on the mint block.
// Gold pulses travel along the branches like messages; the cursor pushes neurons away and
// springs pull them back to rest, so the network keeps relaxing towards its lowest energy.
(() => {
  const canvas = document.getElementById('hero-net');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, nodes = [], edges = [], pulses = [], colors = {};
  const mouse = { x: -1e4, y: -1e4, active: false };

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const readColors = () => { colors = { ink: css('--on-block') || '#2b231c', pulse: css('--gold') || '#c98800' }; };

  // Deterministic randomness so the network looks the same on every visit.
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  function build() {
    seed = 7;
    nodes = [];
    edges = [];
    pulses = [];
    const count = Math.round(Math.min(64, Math.max(26, (W * H) / 9000)));
    const pad = 30;
    // Best-candidate sampling gives evenly spread but organic positions.
    for (let i = 0; i < count; i++) {
      let best = null, bestDist = -1;
      for (let k = 0; k < 14; k++) {
        const x = pad + rand() * (W - 2 * pad), y = pad + rand() * (H - 2 * pad - 30);
        const d = nodes.reduce((m, n) => Math.min(m, Math.hypot(n.rx - x, n.ry - y)), Infinity);
        if (d > bestDist) { bestDist = d; best = { x, y }; }
      }
      nodes.push({ rx: best.x, ry: best.y, x: best.x, y: best.y, vx: 0, vy: 0, phase: rand() * Math.PI * 2, flash: 0, degree: 0 });
    }
    const has = new Set();
    nodes.forEach((n, i) => {
      const near = nodes.map((m, j) => [j, Math.hypot(m.rx - n.rx, m.ry - n.ry)]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]);
      const links = 1 + Math.floor(rand() * 2.4);
      for (const [j] of near.slice(0, links)) {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (has.has(key)) continue;
        has.add(key);
        edges.push({ a: i, b: j, bend: (rand() - 0.5) * 0.5 });
        n.degree++; nodes[j].degree++;
      }
    });
    nodes.forEach((n) => { n.r = 2.2 + Math.min(5.5, n.degree * 1.1); });
  }

  function point(edge, t) {
    const a = nodes[edge.a], b = nodes[edge.b];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const dx = b.x - a.x, dy = b.y - a.y;
    const cx = mx - dy * edge.bend, cy = my + dx * edge.bend;
    const u = 1 - t;
    return [u * u * a.x + 2 * u * t * cx + t * t * b.x, u * u * a.y + 2 * u * t * cy + t * t * b.y];
  }

  function spawn(from) {
    const options = edges.filter((e) => from == null || e.a === from || e.b === from);
    if (!options.length) return;
    const edge = options[Math.floor(Math.random() * options.length)];
    const forward = from == null ? Math.random() < 0.5 : edge.a === from;
    pulses.push({ edge, t: 0, forward, speed: 0.35 + Math.random() * 0.45, hops: from == null ? 0 : 1 });
  }

  let last = performance.now(), spawnClock = 0, t = 0;
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    t += dt;
    if (!reduced) {
      for (const n of nodes) {
        // Spring to rest + gentle breathing + push from the cursor.
        let fx = (n.rx + Math.sin(t * 0.6 + n.phase) * 3 - n.x) * 14;
        let fy = (n.ry + Math.cos(t * 0.5 + n.phase) * 3 - n.y) * 14;
        if (mouse.active) {
          const dx = n.x - mouse.x, dy = n.y - mouse.y, d = Math.hypot(dx, dy);
          if (d < 130 && d > 0.1) { const push = (1 - d / 130) ** 2 * 2600; fx += (dx / d) * push; fy += (dy / d) * push; }
        }
        n.vx = (n.vx + fx * dt) * 0.88;
        n.vy = (n.vy + fy * dt) * 0.88;
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        n.flash = Math.max(0, n.flash - dt * 2.2);
      }
      spawnClock += dt;
      if (spawnClock > 0.28) { spawnClock = 0; spawn(null); }
      pulses = pulses.filter((p) => {
        p.t += p.speed * dt;
        if (p.t < 1) return true;
        const target = p.forward ? p.edge.b : p.edge.a;
        nodes[target].flash = 1;
        if (p.hops < 3 && Math.random() < 0.55) {
          spawn(target);
          pulses[pulses.length - 1].hops = p.hops + 1;
        }
        return false;
      });
    }
    draw();
    if (!reduced) requestAnimationFrame(frame);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = colors.ink;
    ctx.lineCap = 'round';
    for (const e of edges) {
      const a = nodes[e.a], b = nodes[e.b];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y;
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(mx - dy * e.bend, my + dx * e.bend, b.x, b.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors.pulse;
    for (const p of pulses) {
      const [x, y] = point(p.edge, p.forward ? p.t : 1 - p.t);
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const n of nodes) {
      ctx.fillStyle = colors.ink;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + n.flash * 3, 0, Math.PI * 2);
      ctx.fill();
      if (n.flash > 0.05) {
        ctx.strokeStyle = colors.pulse;
        ctx.globalAlpha = n.flash;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + 6 + (1 - n.flash) * 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = colors.ink;
      }
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    readColors();
    build();
    if (reduced) draw();
  }

  const host = canvas.parentElement;
  host.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left; mouse.y = e.clientY - rect.top; mouse.active = true;
  });
  host.addEventListener('pointerleave', () => { mouse.active = false; });
  host.addEventListener('pointerdown', (e) => {
    // Clicking sends a burst of messages from the nearest neuron.
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    let best = 0, bd = Infinity;
    nodes.forEach((n, i) => { const d = Math.hypot(n.x - x, n.y - y); if (d < bd) { bd = d; best = i; } });
    nodes[best].flash = 1;
    for (let i = 0; i < 4; i++) spawn(best);
  });
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas); else resize();
  window.addEventListener('themechange', () => { readColors(); if (reduced) draw(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { readColors(); if (reduced) draw(); });
  resize();
  if (!reduced) requestAnimationFrame(frame);
})();
