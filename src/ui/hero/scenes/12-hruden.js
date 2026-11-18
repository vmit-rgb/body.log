// «Шапка · грудень v3» (Олеся + Нитка / AI), the грудень header scene.
// Copied unchanged from header-animations/12-hruden.html in the workspace (2026-11-18);
// only «function SCENE» became this export. The engine is ../engine.ts.
/* Грудень v2 за скетчем: три ялини з нерівними хвилястими силуетами, горбистий сніг, спокійно падає сніг */
export function scene(A){
  const {S,rnd,reseed,pick,clamp,mix,snap,draw,glyph,dirChar,poly,seg}=A;
  const SNOW=[228,236,255], SNOWB=[160,182,230], PINE=[96,160,128], PINED=[60,100,90], TRUNK=[120,100,100];
  let firs=[], gnd=[], flakes=[], clumps=[], shelves=[], shapes=[];
  function fir(cx,baseY,h,w,id,depth){
    const top=baseY-h, tiers=6+((rnd()*2)|0);
    const prof=[]; // half-width profile points per tier: [y_tip, width_tip, y_notch, width_notch]
    for(let i=0;i<tiers;i++){
      const u=(i+1)/tiers; const yt=top+h*0.86*u; const wt=w/2*(0.25+0.75*u)*(0.9+rnd()*0.25);
      prof.push([yt,wt,yt+S.ch*0.4,wt*(0.55+rnd()*0.15)]);
    }
    const col=depth?PINE:PINED, a=depth?1:0.6;
    for(const side of [-1,1]){
      const pts=[[cx,top]];
      for(const [yt,wt,yn,wn] of prof){ pts.push([cx+side*wt*(0.92+rnd()*0.16),yt]); pts.push([cx+side*wn,yn]); }
      pts.pop(); pts.push([cx+side*S.cw*1.5,baseY-h*0.12]);
      poly(firs,pts,col,a*(side<0?0.95:0.75),{z:3,id});
    }
    // bottom line of the crown
    seg(firs,cx-prof[prof.length-1][1],prof[prof.length-1][0],cx+prof[prof.length-1][1],prof[prof.length-1][0],col,a*0.6,{z:3,id,c:'_'});
    // snow shelves along each tier
    prof.forEach(([yt,wt],i)=>{ for(let x=cx-wt*0.95;x<=cx+wt*0.95;x+=S.cw){ const k=1-Math.abs(x-cx)/wt; if(rnd()<0.35+k*0.55){ firs.push({x,y:yt-S.ch*(0.9+k*0.6),c:k>0.5?'~':pick(['-','.','~']),col:SNOW,a:(0.5+k*0.5)*a,z:4,id}); if(depth&&k>0.3) shelves.push({x,y:yt-S.ch}); } } });
    firs.push({x:cx,y:top-S.ch*0.8,c:'^',col:SNOW,a,z:4,id});
    for(let y=baseY-h*0.12+S.ch;y<baseY+S.ch;y+=S.ch){ firs.push({x:cx-S.cw*0.5,y,c:'|',col:TRUNK,a:0.8*a,z:3,id}); firs.push({x:cx+S.cw*0.5,y,c:'|',col:TRUNK,a:0.6*a,z:3,id}); }
    shapes.push({cx,top,bot:baseY,w,depth});
  }
  function build(){
    reseed(1212); firs=[]; gnd=[]; shelves=[]; shapes=[];
    const W=S.W,H=S.H;
    const gy=x=>H-S.ch*3.2-Math.sin(x/W*Math.PI*2.2+0.6)*S.ch*1.1;
    fir(W*0.82,gy(W*0.82)+S.ch*0.4,H*0.90,W*0.36,2,0);
    fir(W*0.22,gy(W*0.22)+S.ch*0.3,H*0.84,W*0.34,0,1);
    fir(W*0.60,gy(W*0.60)+S.ch*0.5,H*0.80,W*0.30,1,1);
    // nearer fir hides the one behind it, with a thin gap
    const front=shapes.filter(s=>s.depth);
    firs=firs.filter(c=>{ if(c.id!==2) return true; return !front.some(f=>c.y>f.top&&c.y<f.bot&&Math.abs(c.x-f.cx)<f.w/2*clamp((c.y-f.top)/(f.bot-f.top),0.2,1)+S.cw*1.3); });
    firs=snap(firs);
    // snowy hummocks
    for(let x=0;x<W;x+=S.cw*0.5){ const y=gy(x), y2=gy(x+S.cw*0.5); const ang=Math.atan2(y2-y,S.cw*0.5); gnd.push({x,y,c:Math.abs(ang)<0.2?pick(['_','~','_']):dirChar(ang),col:SNOW,a:0.85,z:2}); }
    for(let x=0;x<W;x+=S.cw) for(let y=gy(x)+S.ch;y<H;y+=S.ch) if(rnd()<0.2) gnd.push({x,y,c:pick(['.','·','\'']),col:SNOWB,a:0.25+rnd()*0.2,sp:rnd()<0.25,ph:rnd()*6.28});
    // lower foreground drift line like the sketch
    for(let x=0;x<W;x+=S.cw*0.5) gnd.push({x,y:H-S.ch*0.8-Math.sin(x/W*Math.PI*1.3)*S.ch*0.6,c:'_',col:SNOW,a:0.6,z:2});
    gnd=snap(gnd);
    flakes=[]; for(let i=0;i<Math.round(W*H/1300);i++) flakes.push(nf(true));
    clumps=[];
  }
  function nf(any){const z=rnd(); return {x:rnd()*S.W,y:any?rnd()*S.H:-S.ch,z,c:z>0.7?pick(['*','+','*']):pick(['.','·','\'']),vy:6+z*15,ph:rnd()*6.28,amp:3+z*7};}
  let nextC=4;
  function render(t,dt){
    for(const f of flakes){ if(f.z>=0.45) continue; f.y+=f.vy*dt; if(f.y>S.H) Object.assign(f,nf(false)); glyph(f.c,f.x+Math.sin(t*0.5+f.ph)*f.amp,f.y,SNOWB,0.2+f.z*0.6); }
    draw(firs,c=>({dx:Math.sin(t*0.5+c.id)*0.6*clamp((S.H-c.y)/S.H,0,1)}));
    draw(gnd,c=>c.sp?{a:c.a+0.45*Math.max(0,Math.sin(t*0.9+c.ph))**8}:null);
    nextC-=dt; if(nextC<=0&&shelves.length){ const p=pick(shelves); for(let i=0;i<6;i++) clumps.push({x:p.x+(rnd()-0.5)*S.cw*3,y:p.y,vy:8+rnd()*12,a:1,c:pick(['.','·','*'])}); nextC=5+rnd()*6; }
    for(const c of clumps){ c.vy+=55*dt; c.y+=c.vy*dt; if(c.y>S.H*0.85) c.a-=dt*2; glyph(c.c,c.x,c.y,SNOW,c.a*0.9); }
    clumps=clumps.filter(c=>c.a>0);
    for(const f of flakes){ if(f.z<0.45) continue; f.y+=f.vy*dt; if(f.y>S.H) Object.assign(f,nf(false)); glyph(f.c,f.x+Math.sin(t*0.5+f.ph)*f.amp+t*2,f.y,mix(SNOWB,SNOW,f.z),0.25+f.z*0.7); }
  }
  return {build,render};
}
