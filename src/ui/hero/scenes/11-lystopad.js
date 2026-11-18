// «Шапка · листопад v2» (Олеся + Нитка / AI), the листопад header scene.
// From header-animations/11-lystopad.html in the workspace (2026-11-18). It has no
// SCENE function like the other months, so only its frame was changed: the canvas,
// font, page colour and size come from the engine (../engine.ts); the drawing is unchanged.
/* Листопад: ліхтар, голе дерево, купа листя. Листя падає, його зносять пориви вітру,
   у конусі світла воно стає яскравим. Лише символи на майже чорному тлі. */
export function scene(A){
  let ctx = A.ctx;
  const FONT_PX = 9;
  const FONT = A.font;
  const BG = A.bg;

  let W=0,H=0,cw=5.4,ch=9,cols=0,rows=0;
  let groundY, lamp, treeCells, pileCells, coneCells, skyCells, poleCells, haloCells, groundCells;
  let leaves=[];

  // seeded random so the scene is stable between resizes
  let seed=7;
  const rnd=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};
  const pick=a=>a[(rnd()*a.length)|0];
  const clamp=(v,a,b)=>v<a?a:v>b?b:v;
  const smooth=(a,b,x)=>{x=clamp((x-a)/(b-a),0,1);return x*x*(3-2*x);};
  const mix=(c1,c2,t)=>[c1[0]+(c2[0]-c1[0])*t,c1[1]+(c2[1]-c1[1])*t,c1[2]+(c2[2]-c1[2])*t];
  const rgba=(c,a)=>`rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a.toFixed(3)})`;

  const LIGHT=[255,206,120], HOT=[255,240,200];
  const BARK=[118,108,130], BARK_DIM=[70,64,84];
  const LEAF_BASE=[[190,86,40],[204,140,46],[170,58,42],[150,96,48],[214,112,36]];
  const LEAF_GLYPHS=['*',',','`','~','\'','%','&','"'];

  // light from the streetlight: cone + ground pool + halo
  function lightAt(x,y){
    if(!lamp) return 0;
    const dx=x-lamp.x, dy=y-lamp.y;
    const d=Math.hypot(dx,dy);
    let halo=Math.exp(-d/(ch*2.2))*0.9;
    if(dy<=0) return clamp(halo,0,1);
    const ang=Math.abs(Math.atan2(dx,dy));             // 0 = straight down
    const edge=1-smooth(lamp.half*0.82,lamp.half*1.08,ang);
    const fall=1/(1+ (d/(H*0.9))**2*1.6);
    let cone=edge*fall*0.75;
    // brighter pool on the ground
    const pool=Math.exp(-(((x-lamp.x)/(lamp.poolR))**2) - (((y-groundY)/(ch*2.2))**2));
    return clamp(Math.max(cone,halo)+pool*0.5*edge,0,1);
  }

  function build(){
    seed=7;
    groundY=H-ch*2.2;
    // streetlight on the right, arm reaching left
    const poleX=W*0.80;
    lamp={x:W*0.64, y:H*0.17, half:0.42, poolR:W*0.24, poleX};
    poleCells=[]; haloCells=[]; coneCells=[]; skyCells=[]; groundCells=[]; pileCells=[]; treeCells=[];

    // pole: two thin contours + rare highlights
    const poleTop=lamp.y-ch*1.6;
    for(let y=poleTop+ch*1.2;y<groundY;y+=ch){
      poleCells.push({x:poleX-cw*0.5,y,c:'|',k:0.55});
      poleCells.push({x:poleX+cw*0.5,y,c:'|',k:0.35});
    }
    poleCells.push({x:poleX-cw,y:groundY,c:'[',k:0.5},{x:poleX,y:groundY,c:'_',k:0.5},{x:poleX+cw,y:groundY,c:']',k:0.5});
    // arm: gentle curve from pole top to lamp head
    const ay=Math.round((lamp.y-ch*1.6)/ch)*ch;
    poleCells.push({x:Math.round(poleX/cw)*cw-cw*0.5,y:ay+ch,c:'/',k:0.6});
    for(let x=Math.round((lamp.x+cw*3)/cw)*cw;x<poleX-cw;x+=cw) poleCells.push({x,y:ay,c:'_',k:0.6,dedupe:true});
    // lamp head
    const hx=lamp.x, hy=lamp.y;
    [['/',-3,-0.6],['=',-2,-0.6],['=',-1,-0.6],['=',0,-0.6],['=',1,-0.6],['=',2,-0.6],['\\',3,-0.6]]
      .forEach(([c,i,j])=>poleCells.push({x:hx+i*cw,y:hy+j*ch,c,k:0.75}));
    [['(',-2,0.4],['o',-1,0.4],['@',0,0.4],['o',1,0.4],[')',2,0.4]]
      .forEach(([c,i,j])=>haloCells.push({x:hx+i*cw,y:hy+j*ch,c,bulb:true}));
    // dedupe arm
    const seen=new Set(); poleCells=poleCells.filter(p=>{if(!p.dedupe)return true;const k=p.x+'_'+p.y;if(seen.has(k))return false;seen.add(k);return true;});

    // cone + halo + sky as a cell grid with stable random
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const x=c*cw, y=r*ch, rr=rnd(), r2=rnd();
        if(y>=groundY-ch*0.2) continue;
        const L=lightAt(x+cw/2,y+ch/2);
        const below=y+ch/2>lamp.y+ch*0.6;
        if(below && L>0.05 && rr<0.18+L*0.75){
          const g = L>0.55?':':L>0.3?'.':'·';
          coneCells.push({x,y,c:(rr<0.08&&L>0.4)?"'":g,L,ph:r2*6.28});
        } else if(L<0.05 && rr<0.018 && y<H*0.55){
          skyCells.push({x,y,c:r2<0.7?'.':'·',a:0.10+r2*0.12,ph:rr*6.28});
        }
      }
    }

    // ground line + road texture
    for(let c=0;c<cols;c++){
      const x=c*cw;
      const L=lightAt(x+cw/2,groundY);
      groundCells.push({x,y:groundY,c:rnd()<0.75?'_':'.',L});
      if(rnd()<0.35+L*0.5) groundCells.push({x,y:groundY+ch,c:pick(['.',',','·',"'"]),L:L*0.8});
    }

    // leaf pile: mound left of the pole, partly in the light
    const pcx=W*0.47, pw=W*0.30, ph=ch*3.3;
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const x=c*cw+cw/2, y=r*ch+ch/2;
        const nx=(x-pcx)/(pw/2);
        if(Math.abs(nx)>1) continue;
        const top=groundY - ph*(1-nx*nx)**0.8;
        if(y<top-ch*0.2||y>groundY+ch*0.4) continue;
        const depth=(y-top)/ph;
        if(rnd()< 0.62-depth*0.18){
          pileCells.push({x:c*cw,y:r*ch,c:pick(LEAF_GLYPHS),col:pick(LEAF_BASE),L:lightAt(x,y),ph:rnd()*6.28});
        }
      }
    }

    // bare tree on the left: recursive branches as line art
    const tipList=[];
    function branch(x,y,ang,len,w,depth){
      const x2=x+Math.cos(ang)*len, y2=y+Math.sin(ang)*len;
      const steps=Math.max(2,Math.ceil(len/(Math.min(cw,ch)*0.45)));
      const hFactor=clamp((groundY-y2)/(H*0.8),0,1);
      for(let i=0;i<=steps;i++){
        const t=i/steps, px=x+(x2-x)*t, py=y+(y2-y)*t;
        const ww=w*(1-t*0.25);
        const sway=clamp((groundY-py)/(H*0.85),0,1)**1.6;
        if(ww>cw*1.6){
          // thick: two contours + sparse grain inside
          const nx=-Math.sin(ang), ny=Math.cos(ang);
          const dir=Math.abs(Math.cos(ang))<0.35?'|':(Math.cos(ang)*Math.sin(ang)<0?'/':'\\');
          const lc=dir==='|'?'(':dir, rc=dir==='|'?')':dir;
          const sA=nx>0?1:-1;
          treeCells.push({x:px-sA*nx*ww/2,y:py-sA*ny*ww/2,c:lc,k:0.85,s:sway});
          treeCells.push({x:px+sA*nx*ww/2,y:py+sA*ny*ww/2,c:rc,k:0.6,s:sway});
          if(i%2===0) for(let o=-ww/2+cw;o<ww/2-cw*0.5;o+=cw){
            if(rnd()<0.35) treeCells.push({x:px+nx*o,y:py+ny*o,c:pick(['|',':','\'','|']),k:0.28,s:sway});
          }
        } else {
          const a=((ang*180/Math.PI)+360)%180;     // 0..180, pixel space
          let c;
          if(a<22||a>158) c='_'; else if(a<68) c='\\'; else if(a<112) c='|'; else c='/';
          treeCells.push({x:px,y:py,c,k:clamp(0.35+w/(cw*3),0.35,0.8),s:sway});
        }
      }
      if(depth<=0||len<ch*0.7){tipList.push({x:x2,y:y2});return;}
      const n = depth>3?2:(rnd()<0.3?3:2);
      for(let i=0;i<n;i++){
        const spread=(n===2?(i?1:-1):(i-1))*(0.32+rnd()*0.28);
        let na=ang+spread*0.8+(rnd()-0.5)*0.18;
        na=clamp(na,-Math.PI+0.45,-0.45);
        branch(x2,y2,na,len*(0.68+rnd()*0.1),w*0.6,depth-1);
      }
    }
    branch(W*0.21,groundY+ch*0.3,-Math.PI/2+0.03,H*0.24,cw*3.2,6);
    // root flare
    [['/',-4],['_',-3],['_',3],['\\',4]].forEach(([c,i])=>treeCells.push({x:W*0.21+i*cw,y:groundY,c,k:0.55,s:0}));
    // snap to grid + dedupe (keep the strongest)
    const map=new Map();
    for(const t of treeCells){
      const gx=Math.round(t.x/cw), gy=Math.round(t.y/ch);
      if(gy<0||gy>=rows) continue;
      const key=gx+','+gy, prev=map.get(key);
      if(!prev||prev.k<t.k) map.set(key,{...t,x:gx*cw,y:gy*ch});
    }
    treeCells=[...map.values()].map(t=>({...t,L:lightAt(t.x+cw/2,t.y+ch/2)}));
    lamp.tips=tipList;
  }

  // ------- wind --------
  let gust=0, gustTarget=0, nextGust=1.5, gustT=0;
  function wind(t,dt){
    nextGust-=dt;
    if(nextGust<=0){ gustTarget=0.6+rnd()*0.9; gustT=0; nextGust=3+rnd()*5; }
    gustT+=dt;
    const env = gustTarget * (gustT<0.7 ? smooth(0,0.7,gustT) : Math.exp(-(gustT-0.7)/1.6));
    gust += (env-gust)*Math.min(1,dt*3);
    return 14 + gust*130 + Math.sin(t*0.7)*6;
  }

  function spawnLeaf(fromTree){
    let x,y;
    if(fromTree && lamp.tips.length){ const tp=pick(lamp.tips); x=tp.x; y=tp.y; }
    else { x=-cw*2; y=rnd()*H*0.6; }
    leaves.push({x,y,vx:0,vy:10,rot:rnd()*6.28,vr:(rnd()-0.5)*4,c:pick(LEAF_GLYPHS),
      col:pick(LEAF_BASE),fl:rnd()*6.28,fs:1.5+rnd()*2,state:'fall',life:0,a:0,mass:0.7+rnd()*0.6});
  }

  function lift(){ // gust kicks leaves up from the pile
    if(!pileCells.length) return;
    const p=pick(pileCells.filter(c=>c.y<groundY));
    if(!p) return;
    leaves.push({x:p.x,y:p.y,vx:20,vy:-40-rnd()*40,rot:0,vr:(rnd()-0.5)*8,c:p.c,col:p.col,
      fl:rnd()*6.28,fs:2+rnd()*2,state:'fall',life:0,a:1,mass:0.6+rnd()*0.5});
  }

  function setup(){
    const S=A.S;
    W=S.W; H=S.H; cw=S.cw; ch=S.ch; cols=S.cols; rows=S.rows;
    build();
    leaves=[]; for(let i=0;i<14;i++){spawnLeaf(rnd()<0.6); leaves[leaves.length-1].x=rnd()*W; leaves[leaves.length-1].y=rnd()*groundY;}
  }

  function render(t,dt){
    ctx=A.ctx;
    const wv=wind(t,dt);
    ctx.fillStyle=BG; ctx.fillRect(0,0,W,H);
    ctx.font=FONT; ctx.textBaseline='top';

    // sky dust
    for(const s of skyCells){ ctx.fillStyle=rgba([150,150,185],s.a*(0.75+0.25*Math.sin(t*0.6+s.ph))); ctx.fillText(s.c,s.x,s.y); }
    // light cone (slow breathing, no glyph swaps)
    const flick=0.93+0.05*Math.sin(t*1.3)+0.02*Math.sin(t*7.1);
    for(const c of coneCells){
      const a=(0.12+c.L*0.85)*flick*(0.85+0.15*Math.sin(t*0.8+c.ph));
      ctx.fillStyle=rgba(mix(LIGHT,HOT,c.L*0.6),a); ctx.fillText(c.c,c.x,c.y);
    }
    // tree (sways with the wind, more at the top)
    const sw=(gust*7+Math.sin(t*1.1)*1.2);
    for(const b of treeCells){
      const col=mix(BARK_DIM,BARK,b.k);
      const lit=mix(col,LIGHT,b.L*0.75);
      ctx.fillStyle=rgba(lit,clamp(0.35+b.k*0.6+b.L*0.4,0,1));
      ctx.fillText(b.c,b.x+sw*b.s+Math.sin(t*2.3+b.y*0.05)*b.s*gust*1.5,b.y);
    }
    // pole + head
    for(const p of poleCells){ const L=lightAt(p.x,p.y); ctx.fillStyle=rgba(mix([105,105,125],LIGHT,L*0.5),p.k+L*0.3); ctx.fillText(p.c,p.x,p.y); }
    for(const h of haloCells){ ctx.fillStyle=rgba(HOT,0.92*flick); ctx.fillText(h.c,h.x,h.y); }
    // ground
    for(const g of groundCells){ ctx.fillStyle=rgba(mix([80,78,98],LIGHT,g.L*0.8),0.35+g.L*0.6); ctx.fillText(g.c,g.x,g.y); }
    // pile
    for(const p of pileCells){
      const col=mix(p.col.map(v=>v*0.5),mix(p.col,HOT,0.35),p.L);
      ctx.fillStyle=rgba(col,0.5+p.L*0.5+0.04*Math.sin(t*0.9+p.ph));
      ctx.fillText(p.c,p.x,p.y);
    }

    // spawn
    if(leaves.length<60){
      if(rnd()<dt*(1.6+gust*5)) spawnLeaf(rnd()<0.55);
      if(gust>0.5 && rnd()<dt*gust*3) lift();
    }
    // leaves: one leaf = one character, rotating smoothly
    for(const l of leaves){
      l.life+=dt;
      if(l.state==='fall'){
        l.a=Math.min(1,l.a+dt*2);
        const target=wv*(0.75+0.5/l.mass);
        l.vx+=(target-l.vx)*Math.min(1,dt*1.8/l.mass);
        const termV=22*l.mass - gust*14;
        l.vy+=(termV-l.vy)*Math.min(1,dt*1.5);
        l.x+=(l.vx+Math.sin(l.life*l.fs+l.fl)*14)*dt;
        l.y+=(l.vy+Math.cos(l.life*l.fs*0.8+l.fl)*8)*dt;
        l.rot+=(l.vr+l.vx*0.03)*dt;
        if(l.y>=groundY-ch*0.1){ l.y=groundY-ch*0.1; l.state='rest'; l.rt=0; }
      } else {
        l.rt+=dt; l.rot*=0.9;
        if(gust>0.75 && rnd()<dt*2){ l.state='fall'; l.vy=-30-rnd()*40; l.vx=wv; }
        if(l.rt>2.5) l.a-=dt*0.6;
        l.x+=wv*0.08*dt;
      }
      const L=lightAt(l.x,l.y);
      const base=l.col.map(v=>v*0.55);
      const col=mix(base,mix(l.col,HOT,0.45),Math.min(1,L*2));
      ctx.save(); ctx.translate(l.x+cw/2,l.y+ch/2); ctx.rotate(l.rot);
      ctx.fillStyle=rgba(col,clamp(l.a,0,1)*(0.75+0.25*Math.min(1,L*2)));
      ctx.fillText(l.c,-cw/2,-ch/2); ctx.restore();
    }
    leaves=leaves.filter(l=>l.a>0&&l.x<W+cw*3&&l.y>-H);
  }

  return {build:setup,render};
}
