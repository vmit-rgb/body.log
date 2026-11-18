// «Шапка · березень v3» (Олеся + Нитка / AI), the березень header scene.
// Copied unchanged from header-animations/03-berezen.html in the workspace (2026-11-18);
// only «function SCENE» became this export. The engine is ../engine.ts.
/* Березень: проліски пробиваються крізь сніг, тече струмочок між снігом, капають краплі талої води зверху */
export function scene(A){
  const {S,rnd,reseed,pick,clamp,mix,rgba,snap,draw,glyph,seg,poly,ell}=A;
  const SNOW=[222,230,250], SNOWD=[150,165,205], GREEN=[110,190,120], GREEND=[70,130,90], WHITE=[245,248,255], WATER=[110,170,240], ICE=[170,205,250];
  let field=[], flowers=[], bank=[], water=[], icicles=[], drops=[], splashes=[], horizon;
  const pathX=y=>S.W*0.62+Math.sin(y/S.H*7.5)*S.W*0.05+(y/S.H)*S.W*0.12;
  const pathW=y=>S.cw*(1.5+ (y-S.H*0.36)/(S.H*0.64)*14);
  function build(){
    reseed(77); field=[]; flowers=[]; bank=[]; water=[]; icicles=[];
    horizon=x=>S.H*0.36+Math.sin(x*0.02)*S.ch*0.5+Math.sin(x*0.051+2)*S.ch*0.3;
    // snow horizon line + sparse texture
    for(let x=0;x<S.W;x+=S.cw*0.5) field.push({x,y:horizon(x),c:pick(['_','~','-','_']),col:SNOW,a:0.7});
    for(let x=0;x<S.W;x+=S.cw) for(let y=horizon(x)+S.ch;y<S.H;y+=S.ch) if(rnd()<0.12) field.push({x,y,c:pick(['.','·','\'',',']),col:SNOWD,a:0.25+rnd()*0.2,sp:rnd()<0.15,ph:rnd()*6.28});
    // stream banks
    for(let y=S.H*0.36;y<S.H+S.ch;y+=S.ch*0.5){
      const cx=pathX(y), w=pathW(y);
      const ang=Math.atan2(S.ch*0.5,pathX(y+S.ch*0.5)-cx);
      bank.push({x:cx-w/2-S.cw*0.5,y,c:A.dirChar(ang),col:SNOW,a:0.9,z:3});
      bank.push({x:cx+w/2+S.cw*0.5,y,c:A.dirChar(ang),col:SNOW,a:0.8,z:3});
      if(rnd()<0.4) bank.push({x:cx+w/2+S.cw*1.6,y,c:pick(['(','.','\'']),col:SNOW,a:0.5,z:3});
      if(rnd()<0.4) bank.push({x:cx-w/2-S.cw*1.6,y,c:pick([')','.','\'']),col:SNOW,a:0.5,z:3});
    }
    // distant forest line: small dim tops
    for(let x=0;x<S.W;x+=S.cw*(2+rnd()*3)){const h=1+((rnd()*3)|0); for(let k=0;k<h;k++) field.push({x,y:horizon(x)-S.ch*(k+1),c:k===h-1?'^':pick(['A','|','^']),col:[70,92,110],a:0.35-k*0.05});}
    // clear field inside the stream
    field=field.filter(c=>!(c.y>S.H*0.4 && Math.abs(c.x-pathX(c.y))<pathW(c.y)/2+S.cw*2.2));
    // water particles
    for(let i=0;i<110;i++) water.push({u:rnd(),off:rnd()-0.5,sp:0.06+rnd()*0.05,c:pick(['~','~','-','-',',','\'']),a:0.35+rnd()*0.5});
    // snowdrops: [x, height, lean]
    function leaf(bx,by,len,lean,wd,col,a,sv){
      const L=[],R=[]; for(let k=0;k<=10;k++){const t=k/10; const cx=bx+lean*len*t*t, cy=by-len*t; const w=wd*Math.sin(Math.PI*Math.min(1,t*1.05)); L.push([cx-w,cy]); R.push([cx+w,cy]);}
      poly(flowers,L,col,a,{z:1,s:sv}); poly(flowers,R,col,a*0.8,{z:1,s:sv});
    }
    [[0.13,0.66,0.3],[0.24,0.78,0.38],[0.35,0.58,0.22],[0.05,0.46,0.25]].forEach(([fx,fh,lean],i)=>{
      const bx=S.W*fx, by=S.H+S.ch*0.5, top=by-S.H*fh;
      const pts=[]; for(let k=0;k<=12;k++){const t=k/12; pts.push([bx+Math.sin(t*Math.PI*0.5)*S.cw*7*lean, by-(by-top)*t]);}
      const ex=pts[12][0], ey=pts[12][1];
      pts.push([ex+S.cw*1.6,ey-S.ch*0.4],[ex+S.cw*3,ey+S.ch*0.5]);
      poly(flowers,pts,GREEN,0.85,{z:2,s:i});
      const hx=ex+S.cw*3.2, hy=ey+S.ch*1.2;
      // bell sprite: three hanging petals
      const BELL=[ ['   ','o',''], [' ,/ \\,'], ['(  |  )'], ['( ( ) )'], [' \\/ \\/'] ];
      const rowsTxt=['   o   ',' ,/ \\, ','(  |  )','( ( ) )',' \\/ \\/ '];
      rowsTxt.forEach((row,r)=>{ for(let k=0;k<row.length;k++){ const ch=row[k]; if(ch===' ') continue;
        flowers.push({x:hx+(k-3)*S.cw,y:hy+r*S.ch,c:ch,col:ch==='o'?GREEN:WHITE,a:ch==='|'?0.55:0.95,z:5,s:i,head:true}); } });
      leaf(bx-S.cw*2,by,S.H*fh*0.55,i%2?0.3:-0.3,S.cw*1.8,GREEND,0.8,i);
    });
    flowers=snap(flowers);
    // cut snow texture behind flowers
    const occ=new Set(flowers.map(c=>Math.round(c.x/S.cw)+','+Math.round(c.y/S.ch)));
    field=field.filter(c=>!occ.has(Math.round(c.x/S.cw)+','+Math.round(c.y/S.ch)));
    // icicles along the top edge (left part)
    for(let x=S.W*0.03;x<S.W*0.97;x+=S.cw*(2.5+rnd()*3.5)){const n=2+((rnd()*7)|0); if(n>3) icicles.push({x:x-S.cw,y:-2-S.PT,c:'\\',col:ICE,a:0.6},{x:x+S.cw,y:-2-S.PT,c:'/',col:ICE,a:0.5}); for(let k=0;k<n;k++) icicles.push({x,y:k*S.ch-2-S.PT,c:k===n-1?'V':'|',col:ICE,a:0.8-Math.max(0,k-n+4)*0.12});}
    icicles=snap(icicles);
    A.tips=icicles.filter(c=>c.c==='V');
    drops=[]; splashes=[];
  }
  function render(t,dt){
    draw(field,c=>c.sp?{a:c.a+0.35*Math.max(0,Math.sin(t*1.1+c.ph))**10}:null);
    draw(bank);
    // flowing water along the path
    for(const w of water){
      w.u+=w.sp*dt; if(w.u>1) w.u-=1;
      const y=S.H*0.36+w.u*(S.H*0.66), cx=pathX(y), ww=pathW(y);
      const x=cx+w.off*ww+Math.sin(t*2+w.u*20)*S.cw*0.3;
      glyph(w.c,x,y,mix(WATER,ICE,0.3+0.3*Math.sin(t*3+w.u*30)),w.a*clamp(w.u*8,0,1));
    }
    draw(icicles);
    // drips from the icicles
    if(rnd()<dt*1.6 && A.tips.length){const tp=pick(A.tips); drops.push({x:tp.x,y:tp.y+S.ch,vy:0,hold:0.4+rnd()*0.6,stop:S.H*(0.45+rnd()*0.5)});}
    for(const d of drops){
      if(d.hold>0){d.hold-=dt; glyph('.',d.x,d.y-S.ch*0.4,ICE,0.9*(1-d.hold)); continue;}
      d.vy+=420*dt; d.y+=d.vy*dt;
      glyph(d.vy>150?'|':'\'',d.x,d.y,ICE,0.9);
      if(d.y>d.stop){d.dead=true; for(let k=0;k<3;k++) splashes.push({x:d.x+(k-1)*S.cw,y:d.y,a:1,c:k===1?'.':(k?'`':',')});}
    }
    drops=drops.filter(d=>!d.dead);
    for(const s of splashes){s.a-=dt*1.8; s.y-=dt*6; glyph(s.c,s.x,s.y,ICE,s.a);}
    splashes=splashes.filter(s=>s.a>0);
    // snowdrops nod a little
    draw(flowers,c=>{const k=c.head?1:clamp((S.H-c.y)/(S.H*0.6),0,1); return {dx:Math.sin(t*0.9+c.s*1.7)*S.cw*0.45*k, dy:c.head?Math.sin(t*1.3+c.s)*0.8:0};});
  }
  return {build,render};
}
