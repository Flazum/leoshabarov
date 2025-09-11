// /assets/site.js

// 1) animate brand logo spin (shared)
let __rot = 0;
setInterval(()=>{ __rot=(__rot+3)%360; document.documentElement.style.setProperty('--rot', __rot+'deg'); }, 60);

// 2) fade-on-scroll (shared)
const __io = new IntersectionObserver(es => {
  for (const e of es) if (e.isIntersecting) e.target.classList.add('on');
}, {threshold:.15});
window.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.fade').forEach(el => __io.observe(el));
  const y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();
});

// 3) inject header/footer partials (shared)
async function injectPartials() {
  const headerHost = document.querySelector('[data-include="header"]');
  const footerHost = document.querySelector('[data-include="footer"]');
  try {
    if (headerHost) {
      const r = await fetch('/partials/header.html'); headerHost.outerHTML = await r.text();
    }
    if (footerHost) {
      const r = await fetch('/partials/footer.html'); footerHost.outerHTML = await r.text();
    }
  } catch (e) {
    console.warn('Partial include failed', e);
  }
}
injectPartials();

// 4) (optional) shared background init – only if a page has #tiles
window.addEventListener('DOMContentLoaded', () => {
  const tiles = document.getElementById('tiles');
  if (!tiles) return;
  // lightweight bright grid background
  tiles.innerHTML = '';
  const cols = 18, rows = 10;
  const grid = document.createElement('div');
  grid.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;background:linear-gradient(180deg,#fff,rgba(255,255,255,.8));';
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('width','100%'); svg.setAttribute('height','100%'); svg.style.opacity = .5;
  const defs = document.createElementNS(svg.namespaceURI,'defs');
  const pattern = document.createElementNS(svg.namespaceURI,'pattern');
  pattern.setAttribute('id','grid'); pattern.setAttribute('width','60'); pattern.setAttribute('height','60'); pattern.setAttribute('patternUnits','userSpaceOnUse');
  const rect = document.createElementNS(svg.namespaceURI,'rect');
  rect.setAttribute('width','60'); rect.setAttribute('height','60'); rect.setAttribute('fill','none'); rect.setAttribute('stroke','#e8ecfb'); rect.setAttribute('stroke-width','1');
  pattern.appendChild(rect); defs.appendChild(pattern); svg.appendChild(defs);
  const r = document.createElementNS(svg.namespaceURI,'rect'); r.setAttribute('width','100%'); r.setAttribute('height','100%'); r.setAttribute('fill','url(#grid)');
  svg.appendChild(r); grid.appendChild(svg); tiles.appendChild(grid);
});
