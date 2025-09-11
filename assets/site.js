// === shared tiles background ===
(function(){
  if (window.__tilesInit) return;
  window.__tilesInit = true;

  const root = document.documentElement;

  // gentle hue rotation like home page
  let rr=0; setInterval(()=>{ rr=(rr+3)%360; root.style.setProperty('--rot', rr+'deg') }, 60);

  // ensure the host exists at top of body
  function ensureHost(){
    let d = document.getElementById('tiles');
    if (!d){ d=document.createElement('div'); d.id='tiles'; document.body.prepend(d); }
    return d;
  }

  const host = ensureHost();
  let cols, rows, size, tileCenters=[], angryTile=null;

  function buildTiles(){
    host.innerHTML='';
    const w=innerWidth,h=innerHeight;
    const gap=parseFloat(getComputedStyle(root).getPropertyValue('--gap'))||8;
    const tallPhone=matchMedia('(max-width: 480px) and (orientation: portrait)').matches;
    size=tallPhone?Math.max(64,Math.min(110,Math.floor(Math.min(w,h)/12)))
                  :Math.max(48,Math.min(90,Math.floor(Math.min(w,h)/18)));
    cols=Math.ceil(w/(size+gap)); rows=Math.ceil(h/(size+gap));

    const g=document.createElement('div'); g.className='tgrid';
    g.style.setProperty('--cols',cols); host.appendChild(g);

    for(let y=0;y<rows;y++) for(let x=0;x<cols;x++){
      const t=document.createElement('div'); t.className='tile';
      const f=document.createElement('div'); f.className='face';
      const a=document.createElement('div'); a.className='front';
      const b=document.createElement('div'); b.className='back';
      const u=x/(cols-1||1), v=y/(rows-1||1);
      const hue=200+40*u-20*v, sat=70+10*Math.sin((x+y)*.3), lum=12+8*u+8*(1-v);
      a.style.background=`linear-gradient(180deg,hsla(${hue},${sat}%,${lum+6}%,.22),hsla(${hue},${sat}%,${lum}%,.12))`;
      a.style.border=`1px solid hsla(${hue},50%,18%,1)`;
      f.appendChild(a); f.appendChild(b); t.appendChild(f); g.appendChild(t);
    }

    requestAnimationFrame(()=>{ computeTileCenters(); spawnAngry(); });
  }

  function computeTileCenters(){
    tileCenters=[];
    const g=host.firstElementChild; if(!g) return;
    for(const t of g.children){
      const r=t.getBoundingClientRect();
      tileCenters.push({el:t,x:r.left+r.width/2,y:r.top+r.height/2});
    }
  }

  function drawAngryCanvas(cnv){
    const ctx=cnv.getContext('2d'), N=16; cnv.width=N; cnv.height=N;
    ctx.fillStyle='#9b1111'; ctx.fillRect(0,0,N,N);
    const px=(x,y,c)=>{ctx.fillStyle=c;ctx.fillRect(x,y,1,1)};
    for(let i=0;i<N;i++){px(i,0,'#cc2222');px(i,N-1,'#660a0a');px(0,i,'#cc2222');px(N-1,i,'#660a0a')}
    for(let x=4;x<=6;x++)for(let y=5;y<=7;y++)px(x,y,'#000');
    for(let x=9;x<=11;x++)for(let y=5;y<=7;y++)px(x,y,'#000');
    for(let x=3;x<=12;x++)px(x,11,'#000');px(3,10,'#000');px(12,10,'#000');px(4,9,'#000');px(11,9,'#000')
  }
  function spawnAngry(){
    const g=host.firstElementChild; if(!g||!g.children.length) return;
    if(angryTile){ angryTile.classList.remove('angry'); angryTile._cnv && angryTile._cnv.remove(); }
    const all=[...g.children]; const pick=all[(Math.random()*all.length)|0];
    pick.classList.add('angry');
    const cnv=document.createElement('canvas'); drawAngryCanvas(cnv); pick.appendChild(cnv); pick._cnv=cnv;
    pick.onclick=()=>spawnAngry();
  }

  // flip nearest on mouse move
  let mx=0,my=0, hoverRAF=false;
  function flipNearest(){
    if(!tileCenters.length){hoverRAF=false;return}
    let best=null,bd=1e12;
    for(const c of tileCenters){ const dx=c.x-mx, dy=c.y-my, d=dx*dx+dy*dy; if(d<bd){bd=d;best=c} }
    if(best){ best.el.classList.add('active'); clearTimeout(best.el._t); best.el._t=setTimeout(()=>best.el.classList.remove('active'),500); }
    hoverRAF=false;
  }
  document.addEventListener('mousemove',e=>{
    mx=e.clientX; my=e.clientY;
    if(!hoverRAF){ hoverRAF=true; requestAnimationFrame(flipNearest); }
  });

  buildTiles(); addEventListener('resize', buildTiles);
})();
