// «Шапка · серпень v2» (Олеся + Нитка / AI), the серпень header scene.
// Copied unchanged from header-animations/08-serpen.html in the workspace (2026-11-18);
// only «function SCENE» became this export. The engine is ../engine.ts.
/* Серпень: соняшникове поле, вони хитаються на вітру. На горизонті трохи дерев */
export function scene(A){
  const {S,rnd,reseed,pick,clamp,mix,snap,draw,glyph,dirChar,ell,seg,poly}=A;
  const YEL=[255,205,60], YEL2=[255,170,40], DISK=[150,95,50], SEED=[110,70,45], STEM=[110,170,90], LEAF=[90,150,85], TREE=[70,110,90], FIELD=[170,140,60];
  let heads=[], stems=[], back=[], hz;
  function sunflower(cx,cy,R,turn,id){
    // turn: 0 = facing us, 1 = turned away
    const rx=S.cw*R*(1-turn*0.6), ry=S.ch*R*0.6;
    if(turn<0.5){
      ell(heads,cx,cy,rx,ry,DISK,0.95,{z:4,id});
      for(let k=0;k<R*R*1.3;k++){ const a=rnd()*6.28, d=Math.sqrt(rnd())*0.8; heads.push({x:cx+Math.cos(a)*rx*d,y:cy+Math.sin(a)*ry*d,c:pick([':','.','\'',':']),col:SEED,a:0.8,z:3,id}); }
    } else {
      ell(heads,cx,cy,rx,ry,STEM,0.85,{z:4,id});
      for(let k=0;k<5;k++) heads.push({x:cx+(rnd()-0.5)*rx,y:cy+(rnd()-0.5)*ry,c:pick(['^','\'','"']),col:LEAF,a:0.6,z:3,id});
    }
    const np=turn<0.5?16:9;
    for(let p=0;p<np;p++){
      const a=turn<0.5?p/np*Math.PI*2:(Math.PI*0.35+p/(np-1)*Math.PI*1.3)*(1)+Math.PI*0.0;
      const ang=turn<0.5?a:a+Math.PI*0.5;
      for(let s=0;s<2;s++){
        const d=1.18+s*0.38;
        const x=cx+Math.cos(ang)*(rx+S.cw*(1.2+s*1.3))*(turn<0.5?1:0.9), y=cy+Math.sin(ang)*(ry+S.ch*(0.6+s*0.7));
        heads.push({x,y,c:dirChar(Math.atan2(Math.sin(ang)*S.ch,Math.cos(ang)*S.cw*1.6)),col:s?YEL2:YEL,a:0.95-s*0.15,z:5,id});
      }
    }
  }
  function build(){
    reseed(808); heads=[]; stems=[]; back=[];
    const W=S.W,H=S.H; hz=H*0.50;
    // horizon with a few trees
    for(let x=0;x<W;x+=S.cw*0.5) back.push({x,y:hz,c:'_',col:FIELD,a:0.4});
    [[0.12,3],[0.18,4],[0.47,3],[0.55,5],[0.61,3.5],[0.86,4],[0.92,3]].forEach(([fx,r])=>{ const cx=W*fx; ell(back,cx,hz-S.ch*r*0.55,S.cw*r*1.1,S.ch*r*0.55,TREE,0.5,{},Math.PI,Math.PI*2); back.push({x:cx,y:hz-S.ch*0.4,c:'|',col:TREE,a:0.5}); });
    // field of small far heads
    for(let y=hz+S.ch;y<H;y+=S.ch*1.1) for(let x=(y/S.ch%2)*S.cw*2;x<W;x+=S.cw*(4+rnd()*2)) if(rnd()<0.4) back.push({x,y,c:pick(['o','*','.']),col:mix(FIELD,YEL,(y-hz)/(H-hz)*0.5),a:0.12+(y-hz)/(H-hz)*0.18});
    back=snap(back);
    // four big sunflowers; the right two turned away
    const set=[[0.15,0.38,5,0],[0.40,0.30,5.6,0],[0.65,0.40,4.4,0.7],[0.87,0.34,4,1]];
    set.forEach(([fx,fy,R,turn],i)=>{
      const cx=S.W*fx, cy=S.H*fy;
      sunflower(cx,cy,R,turn,i);
      const sx=cx+(turn>0.5?S.cw*1.5:0);
      poly(stems,[[sx,cy+S.ch*R*0.6],[sx-S.cw*1.2,cy+S.H*0.35],[sx,S.H+S.ch]],STEM,0.85,{z:2,id:i});
      ell(stems,sx-S.cw*4,cy+S.H*0.42,S.cw*3,S.ch*1.1,LEAF,0.75,{z:2,id:i});
    });
    heads=snap(heads); stems=snap(stems);
    const occ=new Set(heads.concat(stems).map(c=>Math.round(c.x/S.cw)+','+Math.round(c.y/S.ch)));
    back=back.filter(c=>!occ.has(Math.round(c.x/S.cw)+','+Math.round(c.y/S.ch)));
  }
  function render(t,dt){
    draw(back);
    const sw=id=>Math.sin(t*0.9+id*1.3)*S.cw*0.9+Math.sin(t*0.37+id)*S.cw*0.5;
    draw(stems,c=>({dx:sw(c.id)*clamp((S.H-c.y)/(S.H*0.7),0,1)}));
    draw(heads,c=>({dx:sw(c.id),dy:Math.sin(t*0.9+c.id*1.3+1)*0.8}));
  }
  return {build,render};
}
