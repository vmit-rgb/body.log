// «Шапка · січень v3» (Олеся + Нитка / AI), the січень header scene.
// Copied unchanged from header-animations/01-sichen.html in the workspace (2026-11-18);
// only «function SCENE» became this export. The engine is ../engine.ts.
/* Січень: голі дерева, сніг на землі, завірюха — дуже сильний пронизливий вітер */
export function scene(A){
  const {S,rnd,reseed,pick,clamp,mix,rgba,tree,snap,draw,glyph,ground,seg}=A;
  const SNOW=[226,234,255], BLUE=[150,172,225], BARK=[128,120,146], DIM=[80,84,110];
  let trees=[], gnd=[], gy, flakes=[], streaks=[], gust=0, gT=0, nextG=1, gTarget=0;
  function build(){
    reseed(31); trees=[]; gnd=[];
    gy=x=>S.H-S.ch*3.4 - Math.sin(x/S.W*Math.PI*1.4+0.3)*S.ch*1.4 - (x>S.W*0.7? (x-S.W*0.7)/S.W*S.ch*8:0);
    const t1=[]; tree(t1,S.W*0.27,gy(S.W*0.27)+S.ch*0.5,-Math.PI/2+0.05,S.H*0.33,S.cw*3,5,{col:BARK,a:1,spread:0.42,jitter:0.3});
    // roots
    [[-0.9,1.3],[-0.4,1.6],[0.5,1.4],[1.0,1.1]].forEach(([dx,l])=>seg(t1,S.W*0.27,gy(S.W*0.27),S.W*0.27+dx*S.cw*4,gy(S.W*0.27)+S.ch*l,BARK,0.6,{s:0,z:1}));
    const t2=[]; tree(t2,S.W*0.80,gy(S.W*0.80)+S.ch*0.3,-Math.PI/2-0.04,S.H*0.22,S.cw*2.2,4,{col:BARK,a:0.85,spread:0.48,jitter:0.4});
    trees=snap(t1.concat(t2));
    // snow lies on top of thicker branches
    const caps=[];
    for(const c of trees){ if(c.ang!==undefined && Math.abs(Math.cos(c.ang))>0.45 && rnd()<0.45) caps.push({x:c.x,y:c.y-S.ch,c:pick(['.','-','~']),col:SNOW,a:0.65,s:c.s,z:0}); }
    trees=snap(trees.concat(caps));
    ground(gnd,gy,SNOW,0.85,['_','~','-','_']);
    for(let x=0;x<S.W;x+=S.cw) for(let y=gy(x)+S.ch;y<S.H;y+=S.ch) if(rnd()<0.22) gnd.push({x,y,c:pick(['.','\'',',','·','-']),col:BLUE,a:0.25+rnd()*0.25,sp:rnd()<0.2,ph:rnd()*6.28});
    gnd=snap(gnd);
    flakes=[]; for(let i=0;i<Math.round(S.W*S.H/700);i++) flakes.push(nf(true));
    streaks=[]; for(let i=0;i<20;i++) streaks.push(ns(true));
  }
  function nf(any){const z=rnd(); return {x:any?rnd()*S.W:-S.cw*2-rnd()*S.W*0.2,y:rnd()*(S.H+S.PT)-S.PT,z,c:z>0.75?pick(['*','+','-']):pick(['.','·','-',',']),ph:rnd()*6.28};}
  function ns(any){const len=3+((rnd()*9)|0); return {x:any?rnd()*S.W:-len*S.cw-rnd()*S.W*0.5,y:rnd()*(S.H*0.85+S.PT)-S.PT,len,sp:0.8+rnd()*0.6,a:0.3+rnd()*0.35};}
  function render(t,dt){
    nextG-=dt; if(nextG<=0){gTarget=0.5+rnd()*0.8;gT=0;nextG=2+rnd()*3;}
    gT+=dt; const env=gTarget*(gT<0.5?gT/0.5:Math.exp(-(gT-0.5)/1.4)); gust+=(env-gust)*Math.min(1,dt*3);
    const wind=170+gust*220;
    // streaks of wind
    for(const s of streaks){
      s.x+=wind*s.sp*1.3*dt; if(s.x>S.W+S.cw) Object.assign(s,ns(false));
      const wob=Math.sin(t*2+s.y*0.05)*S.ch*0.3;
      for(let i=0;i<s.len;i++){ const k=1-Math.abs(i-s.len/2)/(s.len/2); glyph(i===s.len-1?'~':'-',s.x+i*S.cw,s.y+wob,BLUE,s.a*k*(0.6+gust*0.6)); }
    }
    // trees bend away from the wind
    const bend=4+gust*7;
    draw(trees,c=>({dx:c.s*(bend+Math.sin(t*9+c.y*0.2)*gust*1.5)}));
    draw(gnd,c=>c.sp?{a:c.a+0.4*Math.max(0,Math.sin(t*1.3+c.ph))**10}:null);
    // driven snow
    for(const f of flakes){
      f.x+=wind*(0.45+f.z*0.8)*dt; f.y+=(14+f.z*18+Math.sin(t*3+f.ph)*30*gust)*dt;
      if(f.x>S.W+S.cw||f.y>S.H){Object.assign(f,nf(false)); f.y=rnd()*(S.H*0.95+S.PT)-S.PT;}
      glyph(f.c,f.x,f.y,mix(BLUE,SNOW,f.z),0.25+f.z*0.7);
    }
  }
  return {build,render};
}
