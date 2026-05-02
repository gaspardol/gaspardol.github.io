// Scroll progress bar
const progressBar = document.getElementById('scroll-progress');

function updateProgress() {
  const scrollTop = window.scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  progressBar.style.width = docHeight > 0 ? (scrollTop / docHeight * 100) + '%' : '0%';
}

// Parallax header
const header = document.querySelector('header');

function updateParallax() {
  if (header) {
    header.style.transform = `translateY(${window.scrollY * 0.3}px)`;
  }
}

window.addEventListener('scroll', () => {
  updateProgress();
  updateParallax();
}, { passive: true });

// Intersection Observer for fade-in elements
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      // Stagger delay for sibling elements
      const siblings = Array.from(entry.target.parentElement.children);
      const index = siblings.indexOf(entry.target);
      entry.target.style.transitionDelay = (index * 0.1) + 's';
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.post, article h2, article p, article ul, article ol, article blockquote')
  .forEach(el => observer.observe(el));
