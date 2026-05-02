// ── Scroll progress bar ──
const progressBar = document.getElementById('progress-bar');
window.addEventListener('scroll', () => {
  const pct = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight) * 100;
  progressBar.style.width = pct + '%';
}, { passive: true });

// ── Particle canvas ──
const canvas = document.getElementById('hero-canvas');
const ctx = canvas.getContext('2d');
let particles = [];

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', () => { resize(); initParticles(); });

function initParticles() {
  particles = Array.from({ length: 90 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: Math.random() * 2 + 0.5,
    dx: (Math.random() - 0.5) * 0.4,
    dy: (Math.random() - 0.5) * 0.4,
    alpha: Math.random() * 0.5 + 0.1,
  }));
}
initParticles();

function drawParticles() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Background gradient
  const grad = ctx.createRadialGradient(
    canvas.width / 2, canvas.height / 2, 0,
    canvas.width / 2, canvas.height / 2, canvas.width * 0.8
  );
  grad.addColorStop(0, '#1a1a3e');
  grad.addColorStop(1, '#0d0d1a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw connecting lines
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[i].x - particles[j].x;
      const dy = particles[i].y - particles[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 120) {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(108,99,255,${0.15 * (1 - dist / 120)})`;
        ctx.lineWidth = 0.5;
        ctx.moveTo(particles[i].x, particles[i].y);
        ctx.lineTo(particles[j].x, particles[j].y);
        ctx.stroke();
      }
    }
  }

  // Draw dots
  particles.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(180,160,255,${p.alpha})`;
    ctx.fill();
    p.x += p.dx;
    p.y += p.dy;
    if (p.x < 0 || p.x > canvas.width)  p.dx *= -1;
    if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
  });

  requestAnimationFrame(drawParticles);
}
drawParticles();

// ── Parallax hero on scroll ──
const heroContent = document.querySelector('.hero-content');
window.addEventListener('scroll', () => {
  if (heroContent) {
    heroContent.style.transform = `translateY(${window.scrollY * 0.4}px)`;
    heroContent.style.opacity = 1 - window.scrollY / 400;
  }
}, { passive: true });

// ── Intersection Observer: scroll-reveal ──
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

// Stagger children of .cards and .stats
document.querySelectorAll('.cards, .stats').forEach(container => {
  Array.from(container.children).forEach((child, i) => {
    child.classList.add('reveal');
    child.style.transitionDelay = (i * 0.12) + 's';
    revealObserver.observe(child);
  });
});

// Reveal section headings and timeline items
document.querySelectorAll('section h2, .timeline-item, .reveal').forEach(el => {
  revealObserver.observe(el);
});

// ── Animated counters ──
function animateCounter(el) {
  const target = +el.dataset.target;
  const duration = 1600;
  const step = target / (duration / 16);
  let current = 0;
  const tick = () => {
    current = Math.min(current + step, target);
    el.textContent = Math.floor(current) + (el.dataset.suffix || '');
    if (current < target) requestAnimationFrame(tick);
  };
  tick();
}

const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      animateCounter(entry.target);
      counterObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.5 });

document.querySelectorAll('.stat-num').forEach(el => counterObserver.observe(el));
