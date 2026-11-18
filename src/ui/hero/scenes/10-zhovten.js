// «Шапка · жовтень v2» (Олеся + Нитка / AI), the жовтень header scene.
// Copied unchanged from header-animations/10-zhovten.html in the workspace (2026-11-18);
// only «function SCENE» became this export. The engine is ../engine.ts.
/* Жовтень: ріка тече, листя потроху сиплеться з жовтого дерева. На горизонті інші жовті дерева. Під деревом геловінський гарбуз */
export function scene(A){
  const {S,rnd,reseed,pick,clamp,mix,snap,draw,glyph,dirChar,seg,poly}=A;
  const Y1=[250,200,70], Y2=[240,150,50], YD=[170,120,50], TRUNK=[150,115,95], BANK=[170,150,110], WATER=[110,160,225];
  const PUMP=[245,130,40], FACE=[255,220,120], STEM=[110,150,80];
  let tree=[], land=[], pump=[], water=[], leaves=[], tips=[], hz;
  function crown(arr,circles,col,a,id){
    for(const [cx,cy,r] of circles){
      const n=Math.ceil(r*2*Math.PI/(S.cw*0.6));
      for(let i=0;i<n;i++){ const t=i/n*Math.PI*2; const rr=r*(1+0.07*Math.sin(t*6+cx)); const x=cx+Math.cos(t)*rr, y=cy+Math.sin(t)*rr*0.95;
        if(circles.some(([ox,oy,or])=>(ox!==cx||oy!==cy)&&Math.hypot(x-ox,(y-oy)/0.95)<or*0.97)) continue;
        const tang=Math.atan2(Math.cos(t)*0.95,-Math.sin(t)); let c=dirChar(tang); if(c==='_'&&Math.sin(t)<0) c='-'; if(c==='|') c=Math.cos(t)<0?'(':')'; if(Math.abs(Math.sin(t))>0.92&&Math.sin(t)<0) c=pick(['-','~','-']);
        arr.push({x,y,c,col,a,z:3,id}); }
      for(let k=0;k<r/S.cw*0.7;k++){ const an=rnd()*6.28, d=rnd()*r*0.7; arr.push({x:cx+Math.cos(an)*d,y:cy+Math.sin(an)*d*0.95,c:pick(['\'',',','`','.']),col:YD,a:a*0.55,z:1,id}); }
      tips.push([cx,cy,r]);
    }
  }
  function build(){
    reseed(1010); tree=[]; land=[]; pump=[]; water=[]; tips=[];
    const W=S.W,H=S.H; hz=H*0.50;
    // horizon with a row of far yellow trees
    for(let x=0;x<W;x+=S.cw*0.5) land.push({x,y:hz,c:'_',col:BANK,a:0.45});
    const far=[]; for(let x=W*0.40;x<W+S.cw*4;x+=S.cw*(5+rnd()*4)) far.push([x,hz-S.ch*(1.8+rnd()*1.2),S.cw*(2+rnd()*1.3)]);
    crown(land,far,YD,0.45,9);
    // river: from the right edge at the horizon, winding down to the bottom
    const rx=y=>{const u=(y-hz)/(H-hz); return W*(0.98-u*0.32)+Math.sin(u*5)*W*0.05;};
    const rw=y=>S.cw*3+((y-hz)/(H-hz))**1.2*W*0.30;
    A.rx=rx; A.rw=rw;
    for(let y=hz+S.ch*0.5;y<H+S.ch;y+=S.ch*0.5){ const x=rx(y),w=rw(y),x2=rx(y+S.ch*0.5),w2=rw(y+S.ch*0.5);
      land.push({x:x-w/2,y,c:dirChar(Math.atan2(S.ch*0.5,(x2-w2/2)-(x-w/2))),col:BANK,a:0.85,z:2});
      land.push({x:x+w/2,y,c:dirChar(Math.atan2(S.ch*0.5,(x2+w2/2)-(x+w/2))),col:BANK,a:0.7,z:2}); }
    for(let x=0;x<W;x+=S.cw) for(let y=hz+S.ch;y<H;y+=S.ch){ if(Math.abs(x-rx(y))<rw(y)/2+S.cw) continue; if(rnd()<0.1) land.push({x,y,c:pick(['\'',',','.']),col:YD,a:0.35}); }
    land=snap(land);
    // the big tree on the left: bushy crown of several clouds
    crown(tree,[[W*0.12,H*0.22,S.cw*5.5],[W*0.25,H*0.15,S.cw*6],[W*0.36,H*0.28,S.cw*5],[W*0.07,H*0.40,S.cw*4.5],[W*0.21,H*0.36,S.cw*5]],Y1,0.95,0);
    seg(tree,W*0.20,H*0.45,W*0.19,H*0.88,TRUNK,0.9,{z:2}); seg(tree,W*0.245,H*0.45,W*0.25,H*0.88,TRUNK,0.65,{z:2});
    seg(tree,W*0.22,H*0.52,W*0.30,H*0.40,TRUNK,0.7,{z:2}); seg(tree,W*0.21,H*0.55,W*0.13,H*0.44,TRUNK,0.7,{z:2});
    [[-2,'/'],[-1,'_'],[2,'_'],[3,'\\']].forEach(([dx,c])=>tree.push({x:W*0.22+dx*S.cw,y:H*0.88,c,col:TRUNK,a:0.7,z:2}));
    tree=snap(tree);
    // jack-o'-lantern under the tree
    const px=W*0.36, py=H*0.82;
    const P=['   _|_   ',' .-( )-. ','( /\\ /\\ )','(  ^^^  )',' `-...-` '];
    P.forEach((row,r)=>{ for(let k=0;k<row.length;k++){ const ch=row[k]; if(ch===' ') continue;
      const face=(r===2&&'/\\'.includes(ch))||(r===3&&ch==='^');
      pump.push({x:px+(k-4)*S.cw,y:py+(r-2)*S.ch,c:ch,col:r===0?STEM:(face?FACE:PUMP),a:0.95,face}); } });
    for(let i=0;i<80;i++) water.push({u:rnd(),o:rnd()-0.5,sp:0.04+rnd()*0.05,c:pick(['~','-','~',',']),a:0.4+rnd()*0.5});
    leaves=[]; for(let i=0;i<8;i++) leaves.push(nl(true));
  }
  function nl(any){ const [cx,cy,r]=pick(tips.filter(t=>t[1]<S.H*0.45)); return {x:cx+(rnd()-0.5)*r, y:cy+(rnd()-0.3)*r*0.6, vx:0, vy:12, rot:rnd()*6, vr:(rnd()-0.5)*3, c:pick(['*',',','~','\'','%']), col:mix(Y1,Y2,rnd()), ph:rnd()*6.28, a:any?1:0, land:0}; }
  function render(t,dt){
    draw(land);
    for(const w of water){
      w.u+=w.sp*dt; if(w.u>1) w.u-=1;
      const y=hz+S.ch*0.5+w.u*(S.H-hz), x=A.rx(y)+w.o*A.rw(y);
      glyph(w.c,x+Math.sin(t*2+w.u*25)*S.cw*0.4,y,mix(WATER,[230,240,255],0.2+0.25*Math.sin(t*3+w.u*40)),w.a*clamp(w.u*6,0,1)*clamp((1-w.u)*8,0,1));
    }
    draw(tree,c=>c.id===0?{dx:Math.sin(t*0.6)*S.cw*0.4*clamp((S.H*0.5-c.y)/(S.H*0.4),0,1)}:null);
    // pumpkin face flickers like a candle
    const fl=0.75+0.15*Math.sin(t*7)+0.1*Math.sin(t*13.7);
    draw(pump,c=>c.face?{a:fl}:null);
    if(leaves.length<14 && rnd()<dt*0.9) leaves.push(nl(false));
    for(const l of leaves){
      if(l.land>0){ l.land+=dt; l.a-=dt*0.25; }
      else {
        l.a=Math.min(1,l.a+dt*1.5);
        l.vx+=(8+Math.sin(t*0.4)*10-l.vx)*dt; l.x+=(l.vx+Math.sin(t*1.6+l.ph)*12)*dt; l.y+=(16+Math.cos(t*1.3+l.ph)*6)*dt; l.rot+=l.vr*dt;
        if(l.y>S.H*0.86+Math.sin(l.ph)*S.ch*2){ l.land=0.01; l.rot=0; }
      }
      glyph(l.c,l.x,l.y,l.col,0.9*l.a,l.rot);
    }
    leaves=leaves.filter(l=>l.a>0&&l.x<S.W+S.cw);
  }
  return {build,render};
}
