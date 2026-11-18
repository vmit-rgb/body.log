// «Шапка · червень v3» (Олеся + Нитка / AI), the червень header scene.
// Copied unchanged from header-animations/06-cherven.html in the workspace (2026-11-18);
// only «function SCENE» became this export. The engine is ../engine.ts.
/* Червень: веселка на честь pride month, зелені дерева, річка тече. На горизонті гора */
export function scene(A){
  const {S,rnd,reseed,pick,clamp,mix,snap,draw,glyph,dirChar,ell,seg,poly}=A;
  const BANDS=[[235,70,70],[255,150,60],[250,220,80],[90,200,110],[80,140,240],[165,100,220]];
  const GREEN=[100,185,105], GREEND=[70,130,90], TRUNK=[140,115,100], MNT=[115,130,170], WATER=[110,170,235], BANK=[150,190,140];
  let bow=[], trees=[], land=[], water=[], hz;
  // union outline of circles (a bushy crown)
  function crown(arr,circles,col,id){
    for(const [cx,cy,r] of circles){
      const n=Math.ceil(r*2*Math.PI/(S.cw*0.6));
      for(let i=0;i<n;i++){ const t=i/n*Math.PI*2; const x=cx+Math.cos(t)*r, y=cy+Math.sin(t)*r*0.62;
        if(circles.some(([ox,oy,or])=>ox!==cx||oy!==cy?Math.hypot(x-ox,(y-oy)/0.62)<or*0.97:false)) continue;
        const tang=Math.atan2(Math.cos(t)*0.62,-Math.sin(t)); let c=dirChar(tang); if(c==='_'&&Math.sin(t)<0) c='-';
        arr.push({x,y,c,col,a:0.9,z:3,id}); }
      // a few leaf marks inside
      for(let k=0;k<r/S.cw*0.8;k++){ const a=rnd()*6.28, d=rnd()*r*0.7; arr.push({x:cx+Math.cos(a)*d,y:cy+Math.sin(a)*d*0.62,c:pick(['\'',',','`','.']),col:GREEND,a:0.5,z:1,id}); }
    }
  }
  function build(){
    reseed(606); bow=[]; trees=[]; land=[]; water=[];
    const W=S.W,H=S.H; hz=H*0.58;
    // rainbow: from the top-right corner down to the horizon
    const cx=W*1.02, cy=hz+S.ch*0.5;
    BANDS.forEach((col,i)=>{
      const r=W*0.66-i*S.ch*1.25;
      const n=Math.ceil(r*Math.PI/(S.cw*0.55));
      for(let k=0;k<=n;k++){ const t=Math.PI+k/n*Math.PI*0.6; const x=cx+Math.cos(t)*r, y=cy+Math.sin(t)*r*0.95;
        if(y>hz-S.ch*0.5||y<-S.PT-S.ch) continue;
        const tang=Math.atan2(Math.cos(t)*0.95,-Math.sin(t)); let c=dirChar(tang);
        bow.push({x,y,c:c==='_'?'-':c,col,a:0.95,z:2,u:k/n,band:i}); }
    });
    bow=snap(bow);
    // horizon + mountain on the right
    for(let x=0;x<W;x+=S.cw*0.5) land.push({x,y:hz,c:'_',col:BANK,a:0.6,z:1});
    poly(land,[[W*0.55,hz],[W*0.66,hz-S.ch*2.5],[W*0.73,hz-S.ch*4.5],[W*0.80,hz-S.ch*3],[W*0.90,hz-S.ch*3.8],[W*1.02,hz-S.ch*1.5]],MNT,0.7,{z:2});
    // river from the bottom toward the horizon
    const rx=y=>{const u=(y-hz)/(H-hz); return W*0.80-Math.sin(u*3.2)*W*0.07-u*W*0.12;};
    const rw=y=>S.cw*2+((y-hz)/(H-hz))**1.3*W*0.42;
    A.rx=rx; A.rw=rw;
    for(let y=hz+S.ch;y<H+S.ch;y+=S.ch*0.5){ const x=rx(y), w=rw(y), x2=rx(y+S.ch*0.5), w2=rw(y+S.ch*0.5);
      land.push({x:x-w/2,y,c:dirChar(Math.atan2(S.ch*0.5,(x2-w2/2)-(x-w/2))),col:BANK,a:0.85,z:2});
      land.push({x:x+w/2,y,c:dirChar(Math.atan2(S.ch*0.5,(x2+w2/2)-(x+w/2))),col:BANK,a:0.75,z:2}); }
    // meadow texture outside the river
    for(let x=0;x<W;x+=S.cw) for(let y=hz+S.ch;y<H;y+=S.ch){ if(Math.abs(x-rx(y))<rw(y)/2+S.cw) continue; if(rnd()<0.12) land.push({x,y,c:pick(['\'',',','.','"']),col:GREEND,a:0.4,z:0}); }
    land=snap(land);
    // trees on the left
    crown(trees,[[W*0.10,H*0.30,S.cw*7],[W*0.20,H*0.22,S.cw*7.5],[W*0.27,H*0.36,S.cw*6],[W*0.06,H*0.45,S.cw*5.5],[W*0.17,H*0.44,S.cw*6]],GREEN,0);
    crown(trees,[[W*0.38,H*0.46,S.cw*4.5],[W*0.45,H*0.50,S.cw*3.6]],GREEN,1);
    seg(trees,W*0.16,H*0.52,W*0.17,H*0.80,TRUNK,0.85,{z:2,id:0}); seg(trees,W*0.19,H*0.52,W*0.20,H*0.80,TRUNK,0.6,{z:2,id:0});
    seg(trees,W*0.41,H*0.56,W*0.41,hz+S.ch*2,TRUNK,0.8,{z:2,id:1});
    trees=snap(trees);
    // rainbow passes behind the crowns
    const occ=new Set(trees.map(c=>Math.round(c.x/S.cw)+','+Math.round(c.y/S.ch)));
    bow=bow.filter(c=>!occ.has(Math.round(c.x/S.cw)+','+Math.round(c.y/S.ch)));
    for(let i=0;i<90;i++) water.push({u:rnd(),o:rnd()-0.5,sp:0.05+rnd()*0.05,c:pick(['~','-','~','=',',']),a:0.4+rnd()*0.5});
  }
  function render(t,dt){
    draw(land);
    // shimmer travelling along the bow
    draw(bow,c=>({a:0.6+0.4*Math.max(0,Math.sin(c.u*12-t*1.5+c.band*0.4))**2}));
    // river flowing away toward the horizon
    for(const w of water){
      w.u-=w.sp*dt; if(w.u<0) w.u+=1;
      const y=hz+S.ch+w.u*(S.H-hz), x=A.rx(y)+w.o*A.rw(y);
      glyph(w.c,x+Math.sin(t*2+w.u*25)*S.cw*0.4,y,mix(WATER,[230,240,255],0.25+0.25*Math.sin(t*3+w.u*40)),w.a*clamp(w.u*6,0,1));
    }
    draw(trees,c=>({dx:Math.sin(t*0.7+c.id)*S.cw*0.35*clamp((S.H*0.7-c.y)/(S.H*0.6),0,1)}));
  }
  return {build,render};
}
