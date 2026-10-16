// Interactive logic gate network: train in the browser, watch gates sharpen, then freeze to a circuit.
(() => {
  const svg = document.getElementById('lg-net');
  if (!svg || typeof DLGN === 'undefined') return;
  const NS = 'http://www.w3.org/2000/svg';
  const LAYERS = [12, 8, 4, 2, 1];
  const W = 980, H = 470;
  const el = (tag, attrs = {}, parent = svg) => {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    parent.appendChild(node);
    return node;
  };
  const $ = (id) => document.getElementById(id);

  let task = 'diagonal';
  let seed = 3;
  let net = DLGN.create(LAYERS, seed);
  let running = false;
  let hard = false;
  let selected = null; // [layer, index]
  let input = [1, 0, 0, 1];
  let losses = [];

  // --- layout -------------------------------------------------------------------------
  const columns = [4, ...LAYERS];
  const colX = (c) => 110 + c * ((W - 300) / (columns.length - 1));
  const rowY = (c, i) => {
    const n = columns[c];
    const span = Math.min(H - 80, n * 38);
    return H / 2 - span / 2 + (n === 1 ? span / 2 : (i * span) / (n - 1));
  };

  let wires = [], nodes = [], inputs = [];
  function build() {
    svg.innerHTML = '';
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const wireLayer = el('g');
    wires = net.layers.map((layer, L) => layer.map((n, i) => {
      const x2 = colX(L + 1) - 26, y2 = rowY(L + 1, i);
      const make = (src, offset) => {
        const x1 = colX(L) + (L === 0 ? 16 : 26), y1 = rowY(L, src);
        return el('path', { d: `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2 + offset} ${x2},${y2 + offset}`, class: 'lg-wire' }, wireLayer);
      };
      return [make(n.a, -5), make(n.b, 5)];
    }));
    inputs = [0, 1, 2, 3].map((i) => {
      const g = el('g', { class: 'lg-input', tabindex: 0, role: 'button', 'aria-label': `Input pixel ${i + 1}` });
      el('rect', { x: colX(0) - 16, y: rowY(0, i) - 16, width: 32, height: 32, rx: 6 }, g);
      el('text', { x: colX(0) - 30, y: rowY(0, i) + 4, 'text-anchor': 'end', class: 'lg-label' }, g).textContent = ['↖', '↗', '↙', '↘'][i];
      g.addEventListener('click', () => { input[i] ^= 1; render(); });
      return g;
    });
    nodes = net.layers.map((layer, L) => layer.map((n, i) => {
      const g = el('g', { class: 'lg-node', tabindex: 0, role: 'button' });
      el('rect', { x: colX(L + 1) - 26, y: rowY(L + 1, i) - 14, width: 52, height: 28, rx: 7 }, g);
      el('text', { x: colX(L + 1), y: rowY(L + 1, i) + 4, 'text-anchor': 'middle' }, g);
      g.addEventListener('click', () => { selected = [L, i]; render(); });
      return g;
    }));
    const out = el('g', { class: 'lg-out' });
    el('text', { x: colX(columns.length - 1) + 40, y: H / 2 - 10, class: 'lg-label' }, out).textContent = 'output';
    el('text', { x: colX(columns.length - 1) + 40, y: H / 2 + 14, class: 'lg-out-value' }, out);
    ['inputs', ...LAYERS.map((n, i) => (i === LAYERS.length - 1 ? 'output gate' : `layer ${i + 1}`))].forEach((label, c) => {
      el('text', { x: colX(c), y: 20, 'text-anchor': 'middle', class: 'lg-label' }).textContent = label;
    });
    selected = [0, 0];
  }

  // --- rendering ----------------------------------------------------------------------
  const lerp = (a, b, t) => a + (b - a) * t;
  function render() {
    const soft = DLGN.forward(net, input);
    const crisp = DLGN.hardForward(net, input);
    const acts = hard ? crisp.acts : soft.acts;
    inputs.forEach((g, i) => g.classList.toggle('on', !!input[i]));
    net.layers.forEach((layer, L) => layer.forEach((n, i) => {
      const p = DLGN.softmax(n.theta);
      const k = DLGN.argmax(n.theta);
      const conf = p[k];
      const node = nodes[L][i];
      node.querySelector('text').textContent = DLGN.GATES[k].name;
      node.style.setProperty('--conf', hard ? 1 : conf);
      node.classList.toggle('selected', !!selected && selected[0] === L && selected[1] === i);
      const v = acts[L + 1][i];
      node.style.setProperty('--signal', v);
      [n.a, n.b].forEach((src, j) => {
        const sv = acts[L][src];
        wires[L][i][j].style.setProperty('--signal', sv);
        wires[L][i][j].style.opacity = lerp(0.18, 1, hard ? (sv ? 1 : 0.25) : sv * 0.8 + 0.2);
      });
    }));
    const target = DLGN.TASKS[task].target(input);
    const y = hard ? crisp.y : soft.y;
    const outText = svg.querySelector('.lg-out-value');
    outText.textContent = hard ? (y ? '1  (yes)' : '0  (no)') : `${(y * 100).toFixed(0)}% yes`;
    outText.classList.toggle('wrong', (hard ? y : Math.round(y)) !== target);
    $('lg-target').textContent = target ? 'yes' : 'no';
    $('lg-accuracy').textContent = `${DLGN.hardAccuracy(net, task)}/16 patterns right after freezing`;
    $('lg-step').textContent = net.step;
    renderGateBars();
    renderLoss();
  }

  function renderGateBars() {
    const box = $('lg-gates');
    if (!selected) return;
    const n = net.layers[selected[0]][selected[1]];
    const p = DLGN.softmax(n.theta);
    const best = DLGN.argmax(n.theta);
    box.innerHTML = `<div class="small muted" style="margin-bottom:6px">Layer ${selected[0] + 1}, neuron ${selected[1] + 1}: probability of each of the 16 gates</div>` +
      DLGN.GATES.map((g, k) => `<div class="lg-bar${k === best ? ' best' : ''}"><span>${g.name}</span><i style="width:${(p[k] * 100).toFixed(1)}%"></i><b>${(p[k] * 100).toFixed(0)}%</b></div>`).join('');
  }

  function renderLoss() {
    const c = $('lg-loss');
    if (!c) return;
    const w = 220, h = 60;
    const max = Math.max(0.3, ...losses);
    const pts = losses.map((l, i) => `${(i / Math.max(1, losses.length - 1)) * w},${h - (l / max) * (h - 4) - 2}`).join(' ');
    c.innerHTML = `<polyline points="${pts}" fill="none" stroke="var(--energy)" stroke-width="2"/>`;
    $('lg-loss-value').textContent = losses.length ? losses[losses.length - 1].toFixed(3) : '—';
  }

  // --- training loop ------------------------------------------------------------------
  function tick() {
    if (running) {
      let loss = 0;
      for (let i = 0; i < 4; i++) loss = DLGN.train(net, task, 0.08);
      losses.push(loss);
      if (losses.length > 160) losses = losses.filter((_, i) => i % 2 === 0);
      if (DLGN.hardAccuracy(net, task) === 16 && loss < 0.02) {
        running = false;
        $('lg-train').textContent = 'Train';
        $('lg-status').textContent = 'Solved — freeze it to get a pure logic circuit.';
      }
      render();
    }
    requestAnimationFrame(tick);
  }

  function reset(newSeed) {
    if (newSeed) seed += 1;
    net = DLGN.create(LAYERS, seed);
    losses = [];
    hard = false;
    running = false;
    $('lg-train').textContent = 'Train';
    $('lg-freeze').setAttribute('aria-pressed', 'false');
    $('lg-status').textContent = 'Untrained: every neuron is a random mix of the 16 gates.';
    build();
    render();
  }

  $('lg-train').addEventListener('click', () => {
    running = !running;
    hard = false;
    $('lg-freeze').setAttribute('aria-pressed', 'false');
    $('lg-train').textContent = running ? 'Pause' : 'Train';
    $('lg-status').textContent = running ? 'Training: gradient descent on the relaxed (soft) gates…' : 'Paused.';
  });
  $('lg-freeze').addEventListener('click', () => {
    hard = !hard;
    running = false;
    $('lg-train').textContent = 'Train';
    $('lg-freeze').setAttribute('aria-pressed', String(hard));
    $('lg-status').textContent = hard
      ? 'Frozen: each neuron keeps its most likely gate. The network is now a plain logic circuit — toggle the pixels.'
      : 'Back to the soft network.';
    render();
  });
  $('lg-rewire').addEventListener('click', () => reset(true));
  $('lg-task').addEventListener('change', (e) => { task = e.target.value; reset(false); });
  $('lg-task').innerHTML = Object.entries(DLGN.TASKS).map(([k, t]) => `<option value="${k}">${t.label}</option>`).join('');
  $('lg-task').value = task;

  reset(false);
  requestAnimationFrame(tick);
})();

// The 16 gates and their relaxations, as a reference table.
(() => {
  const table = document.getElementById('gate-table');
  if (!table || typeof DLGN === 'undefined') return;
  const formulas = ['0', 'a·b', 'a − a·b', 'a', 'b − a·b', 'b', 'a + b − 2a·b', 'a + b − a·b', '1 − (a + b − a·b)',
    '1 − (a + b − 2a·b)', '1 − b', '1 − b + a·b', '1 − a', '1 − a + a·b', '1 − a·b', '1'];
  const truth = (k) => [[0, 0], [0, 1], [1, 0], [1, 1]].map(([a, b]) => Math.round(DLGN.GATES[k].f(a, b))).join('');
  table.innerHTML = '<tr><th>Gate</th><th>Truth table (00 01 10 11)</th><th>Relaxation used for training</th></tr>' +
    DLGN.GATES.map((g, k) => `<tr><td><b>${g.name}</b></td><td><code>${truth(k).split('').join(' ')}</code></td><td><code>${formulas[k]}</code></td></tr>`).join('');
})();
