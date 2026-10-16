// Tiny differentiable logic gate network (after Petersen et al., NeurIPS 2022), trained in the browser.
// Every neuron has two inputs and a learnable distribution over the 16 two-input logic gates.
// Training uses real-valued relaxations of the gates (AND → a·b, OR → a+b−ab, …); afterwards each
// neuron keeps its most likely gate and the network becomes a plain logic circuit.
const DLGN = (() => {
  const GATES = [
    { name: 'FALSE', f: () => 0, da: () => 0, db: () => 0 },
    { name: 'AND', f: (a, b) => a * b, da: (a, b) => b, db: (a) => a },
    { name: 'A∧¬B', f: (a, b) => a - a * b, da: (a, b) => 1 - b, db: (a) => -a },
    { name: 'A', f: (a) => a, da: () => 1, db: () => 0 },
    { name: '¬A∧B', f: (a, b) => b - a * b, da: (a, b) => -b, db: (a) => 1 - a },
    { name: 'B', f: (a, b) => b, da: () => 0, db: () => 1 },
    { name: 'XOR', f: (a, b) => a + b - 2 * a * b, da: (a, b) => 1 - 2 * b, db: (a) => 1 - 2 * a },
    { name: 'OR', f: (a, b) => a + b - a * b, da: (a, b) => 1 - b, db: (a) => 1 - a },
    { name: 'NOR', f: (a, b) => 1 - (a + b - a * b), da: (a, b) => b - 1, db: (a) => a - 1 },
    { name: 'XNOR', f: (a, b) => 1 - (a + b - 2 * a * b), da: (a, b) => 2 * b - 1, db: (a) => 2 * a - 1 },
    { name: '¬B', f: (a, b) => 1 - b, da: () => 0, db: () => -1 },
    { name: 'A∨¬B', f: (a, b) => 1 - b + a * b, da: (a, b) => b, db: (a) => a - 1 },
    { name: '¬A', f: (a) => 1 - a, da: () => -1, db: () => 0 },
    { name: '¬A∨B', f: (a, b) => 1 - a + a * b, da: (a, b) => b - 1, db: (a) => a },
    { name: 'NAND', f: (a, b) => 1 - a * b, da: (a, b) => -b, db: (a) => -a },
    { name: 'TRUE', f: () => 1, da: () => 0, db: () => 0 },
  ];
  const HARD = [
    () => 0, (a, b) => a & b, (a, b) => a & ~b & 1, (a) => a, (a, b) => ~a & b & 1, (a, b) => b,
    (a, b) => a ^ b, (a, b) => a | b, (a, b) => ~(a | b) & 1, (a, b) => ~(a ^ b) & 1, (a, b) => ~b & 1,
    (a, b) => (a | ~b) & 1, (a) => ~a & 1, (a, b) => (~a | b) & 1, (a, b) => ~(a & b) & 1, () => 1,
  ];

  const pixels = (n) => [(n >> 0) & 1, (n >> 1) & 1, (n >> 2) & 1, (n >> 3) & 1]; // [top-left, top-right, bottom-left, bottom-right]
  const TASKS = {
    diagonal: { label: 'Is it a diagonal?', target: ([a, b, c, d]) => +((a && d && !b && !c) || (b && c && !a && !d)) },
    vertical: { label: 'Is there a vertical bar?', target: ([a, b, c, d]) => +((a && c) || (b && d)) },
    majority: { label: 'Are at least 3 pixels on?', target: (p) => +(p.reduce((s, x) => s + x, 0) >= 3) },
    parity: { label: 'Is an odd number of pixels on?', target: (p) => p.reduce((s, x) => s ^ x, 0) },
  };

  function rng(seed) {
    let t = seed >>> 0;
    return () => {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function create(layers = [8, 6, 4, 2, 1], seed = 1) {
    const rand = rng(seed);
    const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
    let width = 4;
    const net = { layers: [], seed, step: 0 };
    for (const size of layers) {
      // Spread connections so every output of the previous layer is used.
      const pool = [];
      while (pool.length < size * 2) {
        const order = [...Array(width).keys()].sort(() => rand() - 0.5);
        pool.push(...order);
      }
      const neurons = [];
      for (let i = 0; i < size; i++) {
        let a = pool[2 * i], b = pool[2 * i + 1];
        if (a === b) b = (b + 1 + Math.floor(rand() * (width - 1))) % width;
        neurons.push({ a, b, theta: GATES.map(() => gauss()), m: new Array(16).fill(0), v: new Array(16).fill(0) });
      }
      net.layers.push(neurons);
      width = size;
    }
    return net;
  }

  const softmax = (theta) => {
    const max = Math.max(...theta);
    const e = theta.map((t) => Math.exp(t - max));
    const sum = e.reduce((s, x) => s + x, 0);
    return e.map((x) => x / sum);
  };

  /// Soft forward pass for one input pattern; returns activations per layer (and caches).
  function forward(net, input) {
    const acts = [input];
    const cache = [];
    let prev = input;
    for (const layer of net.layers) {
      const out = [], c = [];
      for (const n of layer) {
        const p = softmax(n.theta);
        const a = prev[n.a], b = prev[n.b];
        let y = 0;
        const g = GATES.map((gate) => gate.f(a, b));
        for (let k = 0; k < 16; k++) y += p[k] * g[k];
        out.push(y);
        c.push({ p, g, a, b });
      }
      acts.push(out);
      cache.push(c);
      prev = out;
    }
    return { acts, cache, y: prev[0] };
  }

  /// One Adam step on all 16 patterns of the task. Returns the mean squared error.
  function train(net, task, lr = 0.08) {
    const grads = net.layers.map((layer) => layer.map(() => new Array(16).fill(0)));
    let loss = 0;
    for (let n = 0; n < 16; n++) {
      const x = pixels(n), t = TASKS[task].target(x);
      const { cache, y } = forward(net, x);
      loss += (y - t) ** 2 / 16;
      let upstream = [(2 * (y - t)) / 16];
      for (let L = net.layers.length - 1; L >= 0; L--) {
        const layer = net.layers[L];
        const below = new Array(L === 0 ? 4 : net.layers[L - 1].length).fill(0);
        layer.forEach((neuron, i) => {
          const { p, g, a, b } = cache[L][i];
          const d = upstream[i];
          if (!d) return;
          let out = 0;
          for (let k = 0; k < 16; k++) out += p[k] * g[k];
          for (let k = 0; k < 16; k++) grads[L][i][k] += d * p[k] * (g[k] - out);
          let da = 0, db = 0;
          for (let k = 0; k < 16; k++) { da += p[k] * GATES[k].da(a, b); db += p[k] * GATES[k].db(a, b); }
          below[neuron.a] += d * da;
          below[neuron.b] += d * db;
        });
        upstream = below;
      }
    }
    net.step++;
    const b1 = 0.9, b2 = 0.999, eps = 1e-8;
    net.layers.forEach((layer, L) => layer.forEach((neuron, i) => {
      for (let k = 0; k < 16; k++) {
        const g = grads[L][i][k];
        neuron.m[k] = b1 * neuron.m[k] + (1 - b1) * g;
        neuron.v[k] = b2 * neuron.v[k] + (1 - b2) * g * g;
        const mh = neuron.m[k] / (1 - b1 ** net.step), vh = neuron.v[k] / (1 - b2 ** net.step);
        neuron.theta[k] -= (lr * mh) / (Math.sqrt(vh) + eps);
      }
    }));
    return loss;
  }

  const argmax = (theta) => theta.reduce((best, t, k) => (t > theta[best] ? k : best), 0);

  /// Discrete forward pass using each neuron's most likely gate. Returns bits per layer.
  function hardForward(net, input) {
    const acts = [input];
    let prev = input;
    for (const layer of net.layers) {
      prev = layer.map((n) => HARD[argmax(n.theta)](prev[n.a], prev[n.b]));
      acts.push(prev);
    }
    return { acts, y: prev[0] };
  }

  function hardAccuracy(net, task) {
    let correct = 0;
    for (let n = 0; n < 16; n++) {
      const x = pixels(n);
      if (hardForward(net, x).y === TASKS[task].target(x)) correct++;
    }
    return correct;
  }

  return { GATES, TASKS, pixels, create, softmax, forward, train, hardForward, hardAccuracy, argmax };
})();

if (typeof module !== 'undefined') module.exports = DLGN;
