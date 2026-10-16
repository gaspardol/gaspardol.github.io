// Shared behaviour: theme toggle, active nav link, reveal-on-scroll, live KPI numbers and charts.
(() => {
  const root = document.documentElement;
  root.classList.add('js');
  const stored = (() => { try { return localStorage.getItem('theme'); } catch { return null; } })();
  if (stored) root.dataset.theme = stored;

  document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.querySelector('.theme-toggle');
    if (toggle) {
      const dark = () => root.dataset.theme === 'dark' || (!root.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
      const label = () => { toggle.textContent = dark() ? 'Light' : 'Dark'; toggle.title = dark() ? 'Switch to light mode' : 'Switch to dark mode'; };
      label();
      toggle.addEventListener('click', () => {
        root.dataset.theme = dark() ? 'light' : 'dark';
        try { localStorage.setItem('theme', root.dataset.theme); } catch {}
        label();
        window.dispatchEvent(new Event('themechange'));
      });
    }

    const page = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav a').forEach((a) => {
      if (a.getAttribute('href') === page) a.classList.add('active');
    });

    const observer = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); observer.unobserve(e.target); } });
    }, { rootMargin: '0px 0px 120px 0px' }) : null;
    const pending = [...document.querySelectorAll('.reveal')];
    pending.forEach((el) => observer ? observer.observe(el) : el.classList.add('in'));
    // Backup for browsers/tools where the observer is late: reveal anything near the viewport on scroll.
    const sweep = () => pending.forEach((el) => {
      if (!el.classList.contains('in') && el.getBoundingClientRect().top < innerHeight + 120) el.classList.add('in');
    });
    addEventListener('scroll', sweep, { passive: true });
    setTimeout(sweep, 600);

    if (document.querySelector('[data-kpi]')) loadKpis();
  });

  const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
  const full = new Intl.NumberFormat('en');
  const fmt = (n, style) => (n == null ? '—' : style === 'full' || n < 10000 ? full.format(n) : compact.format(n));

  async function loadKpis() {
    let data;
    try {
      data = await (await fetch('data/kpis.json', { cache: 'no-cache' })).json();
    } catch {
      return;
    }
    const m = data.metrics;
    document.querySelectorAll('[data-kpi]').forEach((el) => {
      const metric = m[el.dataset.kpi];
      if (!metric) return;
      const target = metric.value;
      if (el.dataset.animate === 'false' || matchMedia('(prefers-reduced-motion: reduce)').matches) {
        el.textContent = fmt(target, el.dataset.format);
        return;
      }
      const start = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - start) / 1100);
        const eased = 1 - Math.pow(1 - k, 3);
        el.textContent = fmt(Math.round(target * eased), el.dataset.format);
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    document.querySelectorAll('[data-kpi-detail]').forEach((el) => {
      const [key, field] = el.dataset.kpiDetail.split('.');
      const metric = m[key];
      if (!metric) return;
      if (field === 'updated') {
        const date = metric.extra?.lastSample || metric.updated;
        el.textContent = date ? new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
      } else if (field === 'top') {
        el.textContent = (metric.extra?.top || []).slice(0, 3).map(([name, n]) => `${name} ${n}★`).join(' · ');
      } else {
        const value = metric.extra?.[field];
        el.textContent = value == null ? '—' : fmt(value, 'full');
      }
    });
    document.querySelectorAll('[data-kpi-chart]').forEach((el) => {
      const metric = m[el.dataset.kpiChart];
      if (!metric) return;
      const draw = () => drawChart(el, metric.history || []);
      draw();
      if ('ResizeObserver' in window) new ResizeObserver(draw).observe(el);
    });
    const updated = document.querySelector('[data-kpi-updated]');
    if (updated && data.updated) updated.textContent = new Date(data.updated).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function drawChart(el, history) {
    const points = history.map(([d, v]) => [new Date(d).getTime(), v]).filter(([t, v]) => !isNaN(t) && v != null);
    if (points.length < 2) { el.innerHTML = '<text x="0" y="20">Not enough history yet</text>'; return; }
    const W = Math.max(200, Math.round(el.clientWidth || 600)), H = Math.max(80, Math.round(el.clientHeight || 150));
    const pad = { l: 4, r: 4, t: 10, b: 22 };
    const t0 = points[0][0], t1 = points[points.length - 1][0];
    const vmax = Math.max(...points.map((p) => p[1])) * 1.08 || 1;
    const x = (t) => pad.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - pad.l - pad.r);
    const y = (v) => pad.t + (1 - v / vmax) * (H - pad.t - pad.b);
    // Step line: cumulative counts change at the recorded dates.
    let d = `M${x(points[0][0])},${y(points[0][1])}`;
    for (let i = 1; i < points.length; i++) d += ` L${x(points[i][0])},${y(points[i - 1][1])} L${x(points[i][0])},${y(points[i][1])}`;
    const area = `${d} L${x(t1)},${H - pad.b} L${x(t0)},${H - pad.b} Z`;
    const id = `g${Math.random().toString(36).slice(2, 8)}`;
    const label = (t) => new Date(t).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
    el.setAttribute('viewBox', `0 0 ${W} ${H}`);
    el.innerHTML = `
      <defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="var(--accent)" stop-opacity=".28"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/>
      </linearGradient></defs>
      <path d="${area}" fill="url(#${id})"/>
      <path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>
      <line x1="${pad.l}" x2="${W - pad.r}" y1="${H - pad.b}" y2="${H - pad.b}" stroke="var(--line)" vector-effect="non-scaling-stroke"/>
      <text x="${pad.l}" y="${H - 6}" text-anchor="start">${label(t0)}</text>
      <text x="${W - pad.r}" y="${H - 6}" text-anchor="end">${label(t1)}</text>`;
  }

  window.Site = { fmt };
})();
