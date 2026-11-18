// «Шапка · липень v2» (Олеся + Нитка / AI), the липень header scene.
// Copied unchanged from header-animations/07-lypen.html in the workspace (2026-11-18);
// only «function SCENE» became this export. The engine is ../engine.ts.
/* Липень: море йде хвилями, на горизонті гора, кораблик плаває туди-сюди */
export function scene(A){
  const {S,rnd,reseed,pick,clamp,mix,snap,draw,glyph,dirChar,poly}=A;
  const SEA=[70,120,210], SEA2=[120,190,240], FOAM=[225,240,255], ROCK=[110,115,150], SAIL=[245,240,225], HULL=[230,140,90];
  let cape=[], sky=[], hz;
  const BOAT=['   |\\  ','   | \\ ','   |__\\','\\_____/'];
  function build(){
    reseed(707); cape=[]; sky=[];
    const W=S.W,H=S.H; hz=H*0.36;
    // dark headland on the left: ridge outline + hatching that follows the slope
    const ridge=[[-S.cw,hz-S.ch*7],[W*0.06,hz-S.ch*8],[W*0.13,hz-S.ch*6.5],[W*0.20,hz-S.ch*5.5],[W*0.27,hz-S.ch*3],[W*0.34,hz-S.ch*1.8],[W*0.44,hz-S.ch*0.6],[W*0.50,hz]];
    poly(cape,ridge,ROCK,0.85,{z:2});
    for(let i=0;i<70;i++){ const x=rnd()*W*0.46; let yr=hz; for(let k=0;k<ridge.length-1;k++){ if(x>=ridge[k][0]&&x<=ridge[k+1][0]){ const u=(x-ridge[k][0])/(ridge[k+1][0]-ridge[k][0]); yr=ridge[k][1]+(ridge[k+1][1]-ridge[k][1])*u; } }
      const y=yr+S.ch*(1+rnd()*(hz-yr)/S.ch); if(y<hz-S.ch*0.5) cape.push({x,y,c:pick(['/','/','\\','.']),col:ROCK,a:0.3,z:1}); }
    for(let x=0;x<W;x+=S.cw*0.5) cape.push({x,y:hz,c:'_',col:SEA2,a:0.55,z:1});
    // shore reflection of the cape
    for(let i=0;i<25;i++) cape.push({x:rnd()*W*0.42,y:hz+S.ch*(1+rnd()*1.5),c:pick(['-','=','~']),col:ROCK,a:0.25,z:0});
    cape=snap(cape);
    for(let i=0;i<40;i++) sky.push({x:rnd()*W,y:rnd()*(hz-S.ch*2),c:pick(['.','·','*']),a:0.12+rnd()*0.25,ph:rnd()*6.28});
  }
  function render(t,dt){
    const W=S.W,H=S.H;
    for(const s of sky) glyph(s.c,s.x,s.y,[200,210,240],s.a*(0.7+0.3*Math.sin(t*0.8+s.ph)));
    draw(cape);
    // sailboat drifting back and forth on the horizon
    const bx=W*0.73+Math.sin(t*0.18)*W*0.12, by=hz-S.ch*3.2+Math.sin(t*1.4)*1.2, tilt=Math.cos(t*0.18)>0?0:1;
    BOAT.forEach((row,r)=>{ for(let k=0;k<row.length;k++){ const ch=row[k]; if(ch===' ') continue; glyph(ch,bx+k*S.cw,by+r*S.ch,r===3?HULL:SAIL,0.95); } });
    // waves: crest lines, bigger and slower toward the viewer
    const rows=16;
    for(let k=0;k<rows;k++){
      const u=k/(rows-1), y0=hz+S.ch*1.2+(H-hz)*Math.pow(u,1.35)*0.98;
      const amp=S.ch*(0.15+u*0.9), wl=S.W*(0.07+u*0.28)*(0.8+((k*37)%10)/25), sp=0.5+u*0.6, step=S.cw*(1+u*0.4);
      for(let x=-S.cw;x<W+S.cw;x+=step){
        const ph=x/wl*Math.PI*2 - t*sp + k*2.9 + Math.sin(x*0.013+k)*0.8;
        const y=y0+Math.sin(ph)*amp;
        const slope=Math.cos(ph)*amp*Math.PI*2/wl;
        const crest=Math.sin(ph)<-0.75;
        if(Math.sin(ph)>-0.15) continue;
        let c=Math.abs(slope)<0.35?(crest?'^':'~'):(slope<0?'-':'~');
        if(crest&&u>0.3&&((x/step|0)%3===0)) c='`';
        const col=crest?mix(SEA2,FOAM,0.5+u*0.5):mix(SEA,SEA2,0.3+u*0.4);
        glyph(c,x,y,col,(0.35+u*0.55)*(crest?1:0.8));
      }
    }
  }
  return {build,render};
}
