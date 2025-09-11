// Shared site bootstrap: inject header/footer, build tiles/cursor/reveal,
// spin logo gradient, and (on home) auto-populate notes from manifest.

(async function () {
  // ----- helpers
  async function inject(selector, url) {
    const mount = document.querySelector(selector);
    if (!mount) return;
    const html = await fetch(url, { cache: "no-store" }).then(r => r.text());
    mount.innerHTML = html;
  }

  function spinLogo() {
    let rr = 0;
    setInterval(() => {
      rr = (rr + 3) % 360;
      document.documentElement.style.setProperty("--rot", rr + "deg");
    }, 60);
  }

  // ----- background tiles (identical visuals)
  let tileCenters = [], angryTile = null, tiles;
  function buildTiles() {
    tiles = document.getElementById("tiles");
    if (!tiles) return;
    tiles.innerHTML = "";

    const w = innerWidth, h = innerHeight;
    const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gap")) || 8;
    const tallPhone = matchMedia("(max-width: 480px) and (orientation: portrait)").matches;
    const size = tallPhone
      ? Math.max(64, Math.min(110, Math.floor(Math.min(w, h) / 12)))
      : Math.max(48, Math.min(90, Math.floor(Math.min(w, h) / 18)));

    const cols = Math.ceil(w / (size + gap));
    const rows = Math.ceil(h / (size + gap));

    const g = document.createElement("div");
    g.className = "tgrid";
    g.style.setProperty("--cols", cols);
    tiles.appendChild(g);

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const t = document.createElement("div"); t.className = "tile";
        const f = document.createElement("div"); f.className = "face";
        const a = document.createElement("div"); a.className = "front";
        const b = document.createElement("div"); b.className = "back";

        const u = x / (cols - 1 || 1), v = y / (rows - 1 || 1);
        const hue = 200 + 40 * u - 20 * v;
        const sat = 70 + 10 * Math.sin((x + y) * .3);
        const lum = 12 + 8 * u + 8 * (1 - v);

        a.style.background = `linear-gradient(180deg,hsla(${hue},${sat}%,${lum + 6}%,.22),hsla(${hue},${sat}%,${lum}%,.12))`;
        a.style.border = `1px solid hsla(${hue},50%,18%,1)`;
        b.style.background = `radial-gradient(60% 60% at 50% 50%,hsla(${hue},90%,72%,.95),hsla(${hue + 30},90%,65%,.9))`;

        f.appendChild(a); f.appendChild(b); t.appendChild(f); g.appendChild(t);
      }
    }
    requestAnimationFrame(() => { computeTileCenters(); spawnAngry(); });
  }

  function computeTileCenters() {
    tileCenters = [];
    const g = tiles && tiles.firstElementChild; if (!g) return;
    for (const t of g.children) {
      const r = t.getBoundingClientRect();
      tileCenters.push({ el: t, x: r.left + r.width / 2, y: r.top + r.height / 2 });
    }
  }

  function drawAngryCanvas(cnv) {
    const ctx = cnv.getContext("2d"); const N = 16; cnv.width = N; cnv.height = N;
    ctx.fillStyle = "#9b1111"; ctx.fillRect(0, 0, N, N);
    function px(x, y, c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }
    for (let i = 0; i < N; i++) { px(i, 0, "#cc2222"); px(i, N - 1, "#660a0a"); px(0, i, "#cc2222"); px(N - 1, i, "#660a0a"); }
    for (let x = 4; x <= 6; x++) for (let y = 5; y <= 7; y++) px(x, y, "#000");
    for (let x = 9; x <= 11; x++) for (let y = 5; y <= 7; y++) px(x, y, "#000");
    for (let x = 3; x <= 12; x++) px(x, 11, "#000"); px(3, 10, "#000"); px(12, 10, "#000"); px(4, 9, "#000"); px(11, 9, "#000");
  }

  function spawnAngry() {
    const g = tiles && tiles.firstElementChild; if (!g || !g.children.length) return;
    if (angryTile) { angryTile.classList.remove("angry"); angryTile._cnv && angryTile._cnv.remove(); }
    const all = [...g.children]; const pick = all[(Math.random() * all.length) | 0];
    pick.classList.add("angry");
    const cnv = document.createElement("canvas"); drawAngryCanvas(cnv); pick.appendChild(cnv); pick._cnv = cnv;
    pick.onclick = () => spawnAngry();
  }

  function hoverFlipSetup() {
    let mx = 0, my = 0, hoverRAF = false;
    function flipNearest() {
      if (!tileCenters.length) { hoverRAF = false; return; }
      let best = null, bd = 1e12;
      for (const c of tileCenters) { const dx = c.x - mx, dy = c.y - my; const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = c; } }
      if (best) {
        best.el.classList.add("active");
        clearTimeout(best.el._t);
        best.el._t = setTimeout(() => best.el.classList.remove("active"), 500);
      }
      hoverRAF = false;
    }
    addEventListener("mousemove", e => { mx = e.clientX; my = e.clientY; if (!hoverRAF) { hoverRAF = true; requestAnimationFrame(flipNearest); } });
    addEventListener("resize", buildTiles);
  }

  function cursorGlow() {
    const cursor = document.getElementById("cursor"); if (!cursor) return;
    let cx = 0, cy = 0, tx = 0, ty = 0;
    (function loop() { cx += (tx - cx) * 0.18; cy += (ty - cy) * 0.18; cursor.style.left = cx + "px"; cursor.style.top = cy + "px"; requestAnimationFrame(loop); })();
    addEventListener("mousemove", e => { tx = e.clientX; ty = e.clientY; });
  }

  function revealOnScroll() {
    const obs = new IntersectionObserver(es => {
      for (const e of es) if (e.isIntersecting) e.target.classList.add("on");
    }, { threshold: .15 });
    for (const el of document.querySelectorAll(".reveal")) obs.observe(el);
  }

  // ----- auto-notes list (home page)
  async function hydrateNotes() {
    const list = document.getElementById("notes-list");
    if (!list) return; // not on home page
    try {
      const data = await fetch("/notes/manifest.json", { cache: "no-store" }).then(r => r.json());
      // expected shape: [{ title, href, badge? }]
      list.innerHTML = "";
      data.forEach(n => {
        const card = document.createElement("div"); card.className = "note";
        card.innerHTML = `
          <a href="${n.href}">
            <span>${n.title}</span>
            ${n.badge ? `<span class="badge">${n.badge}</span>` : ""}
          </a>`;
        list.appendChild(card);
      });
    } catch (e) {
      // fall back (leave existing markup if fetch fails)
      console.warn("notes manifest not found or invalid", e);
    }
  }

  // ----- boot
  await inject("#site-header", "/partials/header.html");
  await inject("#site-footer", "/partials/footer.html");
  spinLogo();
  buildTiles();
  hoverFlipSetup();
  cursorGlow();
  revealOnScroll();
  // year fill (after footer injected)
  const y = document.getElementById("year"); if (y) y.textContent = new Date().getFullYear();
  await hydrateNotes();
})();
