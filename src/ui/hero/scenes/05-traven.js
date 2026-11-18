// «Шапка · травень v2» (Олеся + Нитка / AI), the травень header scene.
// Copied unchanged from header-animations/05-traven.html in the workspace (2026-11-18);
// only «function SCENE» became this export. The engine is ../engine.ts.
/* Травень: поле трави, на фоні гора. Трава розвивається на вітру, деякі з трав вже мають квіти */
export function scene(A){
  const {S,rnd,reseed,pick,clamp,mix,snap,draw,glyph,dirChar}=A;
  const G1=[90,170,100], G2=[130,200,110], GD=[60,110,80], MNT=[120,135,170], SNOW=[220,228,245];
  const FLW=[[255,214,90],[200,150,255],[245,245,255],[255,150,190]];
  let mtn=[], blades=[], back=[], gust=0,gT=0,nextG=1.5,gTarget=0;
  function build(){
    reseed(505); mtn=[]; blades=[]; back=[];
    const W=S.W,H=S.H;
    // mountain ridge: from the middle up to a peak on the right
    const ridge=[[W*0.30,H*0.60],[W*0.45,H*0.47],[W*0.55,H*0.40],[W*0.62,H*0.33],[W*0.70,H*0.24],[W*0.76,H*0.14],[W*0.80,H*0.12],[W*0.86,H*0.18],[W*0.93,H*0.24],[W*1.02,H*0.32]];
    A.poly(mtn,ridge,MNT,0.8,{z:2});
    // snow on the peak + hatching down the slope
    for(let i=0;i<40;i++){const u=rnd(); const x=W*(0.70+u*0.22); const yr=H*0.12+Math.abs(x-W*0.80)*0.9; const y=yr+S.ch*(1+rnd()*2.5); mtn.push({x,y,c:pick(['.','\'',':','-']),col:SNOW,a:0.6,z:1});}
    for(let i=0;i<55;i++){const x=W*(0.45+rnd()*0.57); const yr=x<W*0.8?H*0.12+(W*0.8-x)*0.62:H*0.12+(x-W*0.8)*0.9; const y=yr+S.ch*(3+rnd()*8); if(y<H*0.62) mtn.push({x,y,c:pick(['/','.','\\',',']),col:MNT,a:0.22,z:0});}
    mtn=snap(mtn);
    // back row of short grass at the foot
    for(let x=0;x<W;x+=S.cw*(2+rnd()*2)) back.push({x,y:H*0.60+rnd()*S.ch,h:S.ch*(1+rnd()*2),ph:rnd()*6.28});
    // front blades with gaps; taller on the left like the sketch
    let x=-S.cw;
    while(x<W+S.cw){
      const left=1-x/W;
      const h=H*(0.30+rnd()*0.30+left*0.25);
      const fl=rnd()<0.4;
      blades.push({x,h,lean:(rnd()-0.5)*0.3,stiff:0.6+rnd()*0.6,ph:rnd()*6.28,col:mix(G1,G2,rnd()),fl:fl?pick(FLW):null,ear:!fl&&rnd()<0.2,depth:rnd()});
      x+=S.cw*(3.5+rnd()*4);
    }
    blades.sort((a,b)=>a.depth-b.depth);
  }
  function wind(x,t){return Math.sin(x*0.018-t*1.6)*0.6+Math.sin(x*0.007-t*0.7)*0.4+gust*1.6+0.3;}
  function render(t,dt){
    nextG-=dt; if(nextG<=0){gTarget=0.3+rnd()*0.6;gT=0;nextG=3+rnd()*4;}
    gT+=dt; const env=gTarget*(gT<1?gT:Math.exp(-(gT-1)/1.6)); gust+=(env-gust)*Math.min(1,dt*2);
    draw(mtn);
    for(const b of back){ const w=wind(b.x,t)*S.cw*0.6; glyph('/',b.x+w*0.5,b.y-b.h,GD,0.45); glyph('|',b.x,b.y,GD,0.4); }
    // blades: bend more toward the tip
    for(const b of blades){
      const w=wind(b.x,t)/b.stiff;
      const n=Math.max(3,Math.round(b.h/(S.ch*0.9)));
      let px=b.x, py=S.H+S.ch*0.3; const pts=[[px,py]];
      const a0=b.depth<0.4?0.5:0.9;
      for(let i=1;i<=n;i++){
        const u=i/n; const bend=b.lean*u + w*0.16*u*u;
        const nx=b.x+Math.sin(bend)*b.h*u*0.8, ny=S.H+S.ch*0.3-Math.cos(bend*0.5)*b.h*u;
        pts.push([nx,ny]); px=nx; py=ny;
      }
      const wide=b.depth>0.45?S.cw*0.9:0;
      for(let side of (wide?[-1,1]:[0])){
        for(let i=1;i<pts.length;i++){
          const u=i/n, off=side*wide*(1-u);
          const [x1,y1]=pts[i-1],[x2,y2]=pts[i]; const ang=Math.atan2(y2-y1,x2-x1);
          let c=dirChar(ang); if(c==='_') c='-';
          glyph(c,x2+off,y2,mix(GD,b.col,0.5+u*0.5),a0*(0.6+u*0.4)*(side>0?0.75:1));
        }
      }
      if(b.fl){ glyph('@',px,py-S.ch*0.7,b.fl,0.95); glyph('\'',px-S.cw*0.8,py-S.ch*0.5,b.fl,0.6); glyph('\'',px+S.cw*0.8,py-S.ch*0.5,b.fl,0.6); }
      else if(b.ear){ glyph('8',px,py-S.ch*0.5,[200,200,130],0.8); glyph('8',px,py+S.ch*0.4,[200,200,130],0.6); }
    }
  }
  return {build,render};
}
