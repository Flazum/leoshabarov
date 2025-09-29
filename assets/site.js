// ========= Minimal site interactions (no tile background) =========

// 1) Subtle hue rotation for the logo gradient (keeps your brand alive)
(function(){
  const root = document.documentElement;
  let r = 0;
  setInterval(() => { r = (r + 2) % 360; root.style.setProperty('--rot', r + 'deg'); }, 80);
})();

// 2) Add drop-shadow to header after scroll
(function(){
  const header = document.querySelector('.header');
  if (!header) return;
  const onScroll = () => {
    if (window.scrollY > 8) {
      header.style.boxShadow = '0 10px 24px rgba(15,23,42,.06)';
    } else {
      header.style.boxShadow = 'none';
    }
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
})();

// 3) Intersection-based reveal (honors prefers-reduced-motion)
(function(){
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) return;
  const els = document.querySelectorAll('.reveal');
  if (!els.length) return;
  const io = new IntersectionObserver((entries)=>{
    for (const e of entries) if (e.isIntersecting) {
      e.target.classList.add('on'); io.unobserve(e.target);
    }
  }, { threshold: .15 });
  els.forEach(el => io.observe(el));
})();

// 4) Footer year
(function(){
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();
})();

// 5) Keep browser UI theme-color synced with CSS --bg
(function(){
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#f7f9fc';
  meta.setAttribute('content', bg);
})();
