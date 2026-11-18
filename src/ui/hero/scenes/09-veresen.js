// «Шапка · вересень v2» (Олеся + Нитка / AI), the вересень header scene.
// Copied unchanged from header-animations/09-veresen.html in the workspace (2026-11-18);
// only «function SCENE» became this export. The engine is ../engine.ts.
/* Вересень: жоржини та гілка з яблуками */
export function scene(A){
  const {S,rnd,reseed,pick,clamp,mix,snap,draw,glyph,dirChar,ell,seg,poly}=A;
  const DAH1=[235,80,130], DAH2=[255,140,170], DAH3=[200,60,110], CEN=[255,200,90], STEM=[100,160,90], LEAF=[90,150,85];
  const APPLE=[230,70,60], APPLE2=[250,160,80], BARK=[140,110,95], DUST=[220,200,150];
  let flowers=[], branch=[], apples=[], dust=[];
  function ring(arr,cx,cy,R,n,amp,col,a,id){
    const N=Math.ceil(R*2*Math.PI/(S.cw*0.5));
    for(let i=0;i<N;i++){ const t=i/N*Math.PI*2; const r=R*(1+amp*Math.abs(Math.sin(n*t/2)));
      const x=cx+Math.cos(t)*r, y=cy+Math.sin(t)*r*0.72;
      const t2=t+0.01, r2=R*(1+amp*Math.abs(Math.sin(n*t2/2)));
      const ang=Math.atan2(Math.sin(t2)*r2*0.72-Math.sin(t)*r*0.72,Math.cos(t2)*r2-Math.cos(t)*r);
      let c=dirChar(ang); if(c==='_'&&Math.sin(t)<0) c='-';
      arr.push({x,y,c,col,a,z:4,id}); }
  }
  function dahlia(cx,cy,R,id){
    ring(flowers,cx,cy,R,14,0.16,DAH1,0.95,id);
    ring(flowers,cx,cy,R*0.66,11,0.2,DAH2,0.9,id);
    ring(flowers,cx,cy,R*0.36,8,0.25,DAH3,0.9,id);
    [[0,0,'@'],[-1,0,'o'],[1,0,'o'],[0,-1,'\''],[0,1,'.']].forEach(([dx,dy,c])=>flowers.push({x:cx+dx*S.cw,y:cy+dy*S.ch,c,col:CEN,a:1,z:5,id}));
  }
  function apple(cx,cy,R,id){
    // round body with a dip at the top
    const N=Math.ceil(R*2*Math.PI/(S.cw*0.5));
    for(let i=0;i<N;i++){ const t=i/N*Math.PI*2; const dip=Math.max(0,-Math.sin(t))**6*0.25; const r=R*(1-dip);
      const x=cx+Math.cos(t)*r*1.0, y=cy+Math.sin(t)*r*0.82;
      const tang=Math.atan2(Math.cos(t)*0.82,-Math.sin(t)*1.0); let c=dirChar(tang); if(c==='_'&&Math.sin(t)<0) c='-';
      apples.push({x,y,c,col:APPLE,a:0.95,z:4,id}); }
    apples.push({x:cx-R*0.45,y:cy-R*0.25,c:'.',col:APPLE2,a:0.9,z:5,id},{x:cx-R*0.3,y:cy-R*0.15,c:'\'',col:APPLE2,a:0.7,z:5,id});
    seg(apples,cx,cy-R*0.6,cx+S.cw*0.6,cy-R*0.6-S.ch*1.6,BARK,0.9,{z:5,id});
    return [cx+S.cw*0.6,cy-R*0.6-S.ch*1.6];
  }
  function lens(arr,cx,cy,len,wd,ang,col,id){
    const ca=Math.cos(ang), sa=Math.sin(ang);
    for(const side of [-1,1]){ const pts=[]; for(let k=0;k<=8;k++){ const u=k/8-0.5; const w=side*wd*Math.cos(u*Math.PI); pts.push([cx+ca*u*len-sa*w, cy+sa*u*len+ca*w]); } poly(arr,pts,col,side<0?0.8:0.6,{z:3,id}); }
    seg(arr,cx-ca*len*0.45,cy-sa*len*0.45,cx+ca*len*0.35,cy+sa*len*0.35,col,0.35,{z:2,id});
  }
  function build(){
    reseed(909); flowers=[]; branch=[]; apples=[]; dust=[];
    const W=S.W,H=S.H;
    // two dahlias on the left
    dahlia(W*0.17,H*0.40,S.cw*9,0);
    dahlia(W*0.42,H*0.62,S.cw*7.5,1);
    poly(flowers,[[W*0.17,H*0.40+S.ch*5],[W*0.16,H*0.75],[W*0.15,H+S.ch]],STEM,0.85,{z:2,id:0});
    poly(flowers,[[W*0.42,H*0.62+S.ch*4.5],[W*0.40,H+S.ch]],STEM,0.85,{z:2,id:1});
    lens(flowers,W*0.08,H*0.78,S.cw*11,S.ch*1.3,-0.35,LEAF,0);
    lens(flowers,W*0.29,H*0.86,S.cw*10,S.ch*1.2,0.3,LEAF,1);
    flowers=snap(flowers);
    // cut inner parts of overlaps: keep the higher z, done by snap; remove stem cells under heads
    // apple branch hanging from the top-right corner
    const main=[[W+S.cw,H*0.08],[W*0.86,H*0.14],[W*0.74,H*0.10],[W*0.62,H*0.04]];
    poly(branch,main,BARK,0.9,{z:2});
    poly(branch,[[W*0.86,H*0.14],[W*0.84,H*0.30]],BARK,0.8,{z:2});
    poly(branch,[[W*0.74,H*0.10],[W*0.72,H*0.22]],BARK,0.8,{z:2});
    [[W*0.66,H*0.17,0.5],[W*0.94,H*0.24,-0.6],[W*0.80,H*0.05,0.2]].forEach(([x,y,a])=>lens(branch,x,y,S.cw*7,S.ch*0.9,a,LEAF));
    branch=snap(branch);
    apple(W*0.84,H*0.48,S.cw*4.6,0);
    apple(W*0.71,H*0.36,S.cw*3.6,1);
    apple(W*0.92,H*0.70,S.cw*3.8,2);
    poly(branch,[[W*0.86,H*0.30],[W*0.91,H*0.55]],BARK,0.7,{z:2});
    branch=snap(branch); apples=snap(apples);
    for(let i=0;i<30;i++) dust.push({x:rnd()*W,y:rnd()*H,ph:rnd()*6.28,sp:3+rnd()*5});
  }
  function render(t,dt){
    for(const d of dust){ d.y-=d.sp*dt*0.3; d.x+=Math.sin(t*0.5+d.ph)*dt*3; if(d.y<-S.ch) d.y=S.H; glyph('.',d.x,d.y,DUST,0.15+0.15*Math.sin(t+d.ph)); }
    draw(branch,c=>({dx:Math.sin(t*0.6)*S.cw*0.3*clamp((S.W-c.x)/S.W,0,1)}));
    // apples swing like little pendulums
    draw(apples,c=>({dx:Math.sin(t*0.9+c.id*1.4)*S.cw*0.7, dy:Math.abs(Math.sin(t*0.9+c.id*1.4))*-0.8}));
    draw(flowers,c=>({dx:Math.sin(t*0.7+c.id*2)*S.cw*0.6*clamp((S.H-c.y)/(S.H*0.7),0,1)}));
  }
  return {build,render};
}
