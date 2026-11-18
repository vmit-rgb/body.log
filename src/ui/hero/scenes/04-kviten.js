// «Шапка · квітень v2» (Олеся + Нитка / AI), the квітень header scene.
// Copied unchanged from header-animations/04-kviten.html in the workspace (2026-11-18);
// only «function SCENE» became this export. The engine is ../engine.ts.
/* Квітень: гілка вишні, що квітне. Вітер легко несе пелюстки */
export function scene(A){
  const {S,rnd,reseed,pick,clamp,mix,snap,draw,glyph,seg,poly,ell}=A;
  const PINK=[255,190,215], PINKD=[205,120,160], WHITE=[255,236,244], CENTER=[200,60,110], BARK=[150,112,110], LEAF=[120,190,110], FAR=[120,80,110];
  let branch=[], blooms=[], far=[], petals=[], anchors=[], gust=0, gT=0, nextG=2, gTarget=0;
  function limb(arr,pts,w,col){
    // double contour for a thick limb, single line when thin
    for(let i=0;i<pts.length-1;i++){
      const [x1,y1]=pts[i],[x2,y2]=pts[i+1]; const ang=Math.atan2(y2-y1,x2-x1); const nx=-Math.sin(ang), ny=Math.cos(ang);
      const ww=w*(1-i/pts.length*0.6);
      if(ww>S.cw*1.2){ seg(arr,x1+nx*ww/2,y1+ny*ww/2,x2+nx*ww/2,y2+ny*ww/2,col,0.95,{z:2}); seg(arr,x1-nx*ww/2,y1-ny*ww/2,x2-nx*ww/2,y2-ny*ww/2,col,0.6,{z:2}); }
      else seg(arr,x1,y1,x2,y2,col,0.85,{z:2});
    }
  }
  function flower(x,y,big){
    const k=big?1:0.75, id=anchors.length; anchors.push({x,y});
    for(let p=0;p<5;p++){ const a=-Math.PI/2+p*Math.PI*2/5; const px=x+Math.cos(a)*S.cw*2.6*k, py=y+Math.sin(a)*S.ch*1.5*k;
      const col=mix(PINK,WHITE,rnd()*0.6);
      [['.',-1,-0.5],['-',0,-0.5],['.',1,-0.5],['\'',-1,0.5],['-',0,0.5],['\'',1,0.5]].forEach(([c,dx,dy])=>blooms.push({x:px+dx*S.cw,y:py+dy*S.ch,c,col,a:0.95,z:4,id}));
      blooms.push({x:px,y:py,c:'o',col:mix(PINK,WHITE,0.7),a:0.35,z:3,id}); }
    blooms.push({x,y,c:'*',col:CENTER,a:1,z:5,id});
    if(big) [[-1,-0.9],[1,-0.9],[0,0.8]].forEach(([dx,dy])=>blooms.push({x:x+dx*S.cw,y:y+dy*S.ch,c:'\'',col:[240,210,120],a:0.8,z:5,id}));
  }
  function build(){
    reseed(404); branch=[]; blooms=[]; far=[]; anchors=[];
    const W=S.W,H=S.H;
    // main limb from the lower-left corner up to the right
    const main=[[-S.cw*2,H+S.ch],[W*0.10,H*0.78],[W*0.20,H*0.58],[W*0.33,H*0.44],[W*0.47,H*0.34],[W*0.60,H*0.30]];
    limb(branch,main,S.cw*3.5,BARK);
    // side twigs
    const twigs=[ [[W*0.20,H*0.58],[W*0.17,H*0.35],[W*0.14,H*0.16]], [[W*0.33,H*0.44],[W*0.40,H*0.62],[W*0.50,H*0.70]], [[W*0.47,H*0.34],[W*0.52,H*0.14]], [[W*0.10,H*0.78],[W*0.04,H*0.55]] ];
    twigs.forEach(tw=>limb(branch,tw,S.cw*1.0,BARK));
    branch=snap(branch);
    // flowers along the limbs
    [[W*0.13,H*0.17,0],[W*0.36,H*0.20,1],[W*0.60,H*0.30,1],[W*0.30,H*0.58,1],[W*0.56,H*0.68,1],[W*0.08,H*0.50,0]].forEach(([x,y,b])=>flower(x,y,b));
    // a few leaves (lens outlines) and buds
    [[W*0.30,H*0.36,0.6],[W*0.56,H*0.40,-0.5],[W*0.12,H*0.66,0.4],[W*0.45,H*0.24,0.3]].forEach(([x,y])=>ell(blooms,x,y,S.cw*2,S.ch*0.8,LEAF,0.7,{z:3}));
    [[W*0.66,H*0.36],[W*0.10,H*0.30],[W*0.56,H*0.62]].forEach(([x,y])=>blooms.push({x,y,c:'o',col:PINKD,a:0.9,z:4}));
    blooms=snap(blooms.filter(b=>b.a>0));
    const occ=new Set(blooms.map(c=>Math.round(c.x/S.cw)+','+Math.round(c.y/S.ch)));
    branch=branch.filter(c=>!occ.has(Math.round(c.x/S.cw)+','+Math.round(c.y/S.ch)));
    // far out-of-focus blossom dots on the right
    for(let i=0;i<60;i++){ far.push({x:W*(0.55+rnd()*0.45),y:H*rnd(),c:pick(['.','·','o',':']),col:FAR,a:0.12+rnd()*0.15,ph:rnd()*6.28}); }
    petals=[]; for(let i=0;i<18;i++) petals.push(np(true));
  }
  function np(any){ const an=pick(anchors); return {x:any?rnd()*S.W:an.x, y:any?rnd()*S.H:an.y, vx:20, vy:5, rot:rnd()*6, vr:(rnd()-0.5)*3, c:pick(['o','(',')','\'','~',',']), col:mix(PINK,WHITE,rnd()), ph:rnd()*6.28, a:any?1:0}; }
  function render(t,dt){
    nextG-=dt; if(nextG<=0){gTarget=0.4+rnd()*0.6;gT=0;nextG=3+rnd()*4;}
    gT+=dt; const env=gTarget*(gT<0.8?gT/0.8:Math.exp(-(gT-0.8)/1.8)); gust+=(env-gust)*Math.min(1,dt*2);
    draw(far,c=>({a:c.a*(0.8+0.2*Math.sin(t*0.5+c.ph))}));
    const sway=(y)=>{const k=clamp((S.H-y)/S.H,0,1)**1.3; return Math.sin(t*0.8)*S.cw*0.4*k + gust*S.cw*1.4*k;};
    draw(branch,c=>({dx:sway(c.y)}));
    draw(blooms,c=>({dx:sway(c.y)+(c.id!==undefined?Math.sin(t*1.7+c.id)*0.6:0)}));
    if(petals.length<26+gust*20 && rnd()<dt*(1.2+gust*5)) petals.push(np(false));
    const wind=18+gust*90;
    for(const p of petals){
      p.a=Math.min(1,p.a+dt*2);
      p.vx+=(wind*(0.8+Math.sin(p.ph)*0.3)-p.vx)*dt*1.5; p.vy+=(10-gust*12-p.vy)*dt;
      p.x+=(p.vx+Math.sin(t*1.5+p.ph)*10)*dt; p.y+=(p.vy+Math.cos(t*1.2+p.ph)*6)*dt; p.rot+=p.vr*dt*(1+gust*2);
      glyph(p.c,p.x,p.y,p.col,0.9*p.a,p.rot);
    }
    petals=petals.filter(p=>p.x<S.W+S.cw*2&&p.y<S.H+S.ch&&p.y>-S.ch*4);
  }
  return {build,render};
}
