(() => {
  "use strict";
  const canvas = document.getElementById("scene");
  const ctx = canvas.getContext("2d", { alpha: false });
  const hint = document.getElementById("hint");
  const replay = document.getElementById("replay");
  const TAU = Math.PI * 2;
  const clamp = (v,a=0,b=1) => Math.max(a,Math.min(b,v));
  const ease = v => { v=clamp(v); return v*v*(3-2*v); };
  const mix = (a,b,t) => a+(b-a)*t;
  let W=0,H=0,dpr=1, start=performance.now(), last=0, cells=[], sparks=[], motes=[], stars=[];
  let cols=0, rows=0, cw=8, ch=15, seed=21, raf=0;
  const rand = () => { seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
  const palette = [[.30,.01,0],[.78,.05,.01],[1,.24,.02],[1,.52,.05],[1,.8,.26],[1,.98,.82]];
  const red = [[.10,0,.02],[.34,.01,.05],[.66,.04,.09],[.90,.09,.15],[1,.24,.26],[1,.55,.52]];
  function ramp(stops,t) {
    const p=clamp(t)*(stops.length-1), i=Math.min(stops.length-2,Math.floor(p)), f=p-i;
    return stops[i].map((v,k)=>mix(v,stops[i+1][k],f));
  }
  function color(c,a=1) { return `rgba(${Math.round(c[0]*255)},${Math.round(c[1]*255)},${Math.round(c[2]*255)},${a})`; }
  function resize() {
    dpr=Math.min(2,window.devicePixelRatio||1); W=window.innerWidth; H=window.innerHeight;
    canvas.width=Math.round(W*dpr); canvas.height=Math.round(H*dpr); ctx.setTransform(dpr,0,0,dpr,0,0);
    cw=Math.max(7,Math.min(10,W/48)); ch=cw*1.72; cols=Math.ceil(W/cw); rows=Math.ceil(H/ch);
    cells=new Array(rows*cols); seed=21;
    motes=Array.from({length:46},()=>({x:rand()*W,y:rand()*H,s:(.01+rand()*.03)*H,p:rand()*TAU,a:.5+rand()*.5}));
    stars=Array.from({length:65},()=>({x:rand()*W,y:rand()*H,p:rand()*TAU,s:.6+rand()*1.6}));
  }
  function put(x,y,g,c) { const col=Math.floor(x/cw), row=Math.floor(y/ch); if(col<0||col>=cols||row<0||row>=rows)return; cells[row*cols+col]={g,c}; }
  function textGrid() {
    ctx.fillStyle="#030206"; ctx.fillRect(0,0,W,H);
    ctx.font=`bold ${ch*.88}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.textAlign="center"; ctx.textBaseline="middle";
    for(let r=0;r<rows;r++) for(let c=0;c<cols;c++) {
      const v=cells[r*cols+c]; if(!v)continue;
      ctx.fillStyle=v.c; ctx.fillText(v.g,(c+.5)*cw,(r+.5)*ch);
    }
  }
  const env=()=>({x:W*.12,y:H*.35,w:W*.76,h:Math.min(H*.36,W*.76*.74)});
  function heart(x,y,s) { const X=x/s,Y=(y/s)+.25; return (X*X+Y*Y-1)**3-X*X*Y**3<=0; }
  function drawEnvelope(t) {
    const e=env(), cx=e.x+e.w/2, cy=e.y+e.h/2, flap=e.h*.5;
    const appear=ease(t/1.6);
    if(appear<=0)return {cx,cy};
    for(let r=0;r<rows;r++) for(let c=0;c<cols;c++) {
      const x=(c+.5)*cw,y=(r+.5)*ch;
      if(x<e.x||x>e.x+e.w||y<e.y||y>e.y+e.h)continue;
      const f=flap*(1-Math.abs(x-cx)/(e.w/2)), edge=e.y+f;
      let g="#", col="#8b6744";
      if(Math.abs(y-edge)<ch*.5){g=x<cx?"\\":"/";col="#d2b18a";}
      else if(y>edge) { g="&%@#"[Math.floor((x*7+y*3)%4)]; col=y>e.y+e.h*.82?"#a77a4d":"#bd9568"; }
      else {g=".";col="#6c4c38";}
      if(Math.abs(x-e.x)<cw||Math.abs(x-(e.x+e.w))<cw||Math.abs(y-e.y)<ch||Math.abs(y-(e.y+e.h))<ch){g="/";col="#b88d62";}
      put(x,y,g,color([.75,.57,.37],appear));
    }
    const hr=H*.062, hy=e.y+flap*.5-hr*.25;
    for(let r=-12;r<=12;r++)for(let c=-12;c<=12;c++){
      const x=c*cw*.55,y=r*ch*.55;
      if(heart(x,y,hr)&&heart(x,y,hr*.86)) put(cx+x,hy-y,"@","#f06b9f");
    }
    // Small lettering on the seal
    if(t>1.1) {
      ctx.save(); ctx.font=`bold ${Math.max(9,cw*1.5)}px Georgia,serif`; ctx.textAlign="center"; ctx.fillStyle="#ffe6f0"; ctx.shadowColor="#ff80bd"; ctx.shadowBlur=12; ctx.fillText("♥",cx,hy+3); ctx.restore();
    }
    return {cx,cy,sealX:cx,sealY:hy};
  }
  function cursor(t, target) {
    const p=clamp((t-1.9)/(4.1-1.9)), k=1-Math.pow(1-p,3.5);
    const pts=[[W*1.1,H*.04],[W*.95,H*.8],[W*.64,H*.78],[target.sealX,target.sealY]];
    const u=1-k, x=u**3*pts[0][0]+3*u*u*k*pts[1][0]+3*u*k*k*pts[2][0]+k**3*pts[3][0];
    const y=u**3*pts[0][1]+3*u*u*k*pts[1][1]+3*u*k*k*pts[2][1]+k**3*pts[3][1];
    if(t>1.9&&t<5.7) {
      for(let i=9;i>=0;i--){const q=clamp((t-.05*i-1.9)/2.2),kk=1-Math.pow(1-q,3.5),uu=1-kk;
        const xx=uu**3*pts[0][0]+3*uu*uu*kk*pts[1][0]+3*uu*kk*kk*pts[2][0]+kk**3*pts[3][0];
        const yy=uu**3*pts[0][1]+3*uu*uu*kk*pts[1][1]+3*uu*kk*kk*pts[2][1]+kk**3*pts[3][1];
        put(xx,yy,i<3?"+":".",color([.7,.25,.95],(1-i/11)*.8));
      }
      ctx.save();ctx.translate(x,y);ctx.scale(Math.max(.7,W/390),Math.max(.7,W/390));
      ctx.shadowColor="#bb65ff";ctx.shadowBlur=16;ctx.fillStyle="#f8dfff";ctx.strokeStyle="#fff";
      ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,27);ctx.lineTo(7,20);ctx.lineTo(13,31);ctx.lineTo(18,28);ctx.lineTo(12,17);ctx.lineTo(23,17);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
    }
  }
  function burst(x,y,n,colors) { for(let i=0;i<n;i++){const a=rand()*TAU,s=80+rand()*420;sparks.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.6+rand()*1.1,age:0,c:colors[Math.floor(rand()*colors.length)]});} }
  function fire(t,dt,e) {
    const burn=t-4.67, spread=3.4, intensity=ease(burn/.9)*(1-ease((burn-spread-1.0)/1.8));
    if(intensity<=.01)return;
    const baseY=e.y+e.h;
    for(let i=0;i<Math.ceil(cols*.65);i++){
      const x=rand()*W, h=(.08+rand()*.36)*H*intensity;
      for(let j=0;j<Math.ceil(h/ch);j++){
        const y=baseY-j*ch, flick=.5+.5*Math.sin(t*9+i+j*.7);
        put(x+Math.sin(t*4+i)*cw*2,y,[".",":","^","*","%","@"][Math.min(5,Math.floor(flick*6))],color(ramp(palette,clamp(1-j/(h/ch+1)))*1));
      }
    }
    for(let i=0;i<Math.ceil(30*dt);i++){const x=e.x+rand()*e.w,y=baseY-rand()*H*.25;sparks.push({x,y,vx:(rand()-.5)*70,vy:-50-rand()*130,life:.7+rand(),age:0,c:ramp(palette,.7+rand()*.3)});}
  }
  function rose(t) {
    const t0=9.3, progress=ease((t-t0)/3.8); if(progress<=0)return;
    const cx=W/2, cy=H*.29, rr=Math.min(W*.175,H*.13), stemEnd=H*.885;
    const drawPetal=(a,r,scale)=>{ctx.beginPath();ctx.ellipse(cx+Math.cos(a)*r*.38,cy+Math.sin(a)*r*.25,rr*scale,rr*scale*.52,a,0,TAU);ctx.fill();};
    ctx.save();ctx.globalAlpha=progress;ctx.shadowColor="#ff234e";ctx.shadowBlur=18;
    // Stem and leaves
    ctx.lineWidth=Math.max(3,rr*.055);ctx.strokeStyle="#286d35";ctx.beginPath();ctx.moveTo(cx,cy+rr*.7);ctx.bezierCurveTo(cx-rr*.12,cy+rr*1.8,cx+rr*.1,stemEnd*.85,cx,stemEnd);ctx.stroke();
    for(const [yy,ang,len] of [[.58,2.55,1.5],[.78,.45,1.35],[.94,2.7,1.05]]){
      ctx.save();ctx.translate(cx,cy+rr*yy);ctx.rotate(ang);ctx.fillStyle="#287c3c";ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(rr*len*.55,-rr*.45,rr*len,0);ctx.quadraticCurveTo(rr*len*.5,rr*.32,0,0);ctx.fill();ctx.restore();
    }
    // Layered rose petals
    for(let layer=0;layer<4;layer++){
      const count=[5,5,4,3][layer], size=[1,.82,.64,.46][layer], rad=rr*[.12,.1,.08,.04][layer];
      for(let i=0;i<count;i++){const a=i*TAU/count+layer*.63;ctx.fillStyle=["#a20d2c","#c51b3b","#e52b4b","#f45b68"][layer];drawPetal(a,rad,size);}
    }
    ctx.fillStyle="#f36a72";ctx.beginPath();ctx.arc(cx,cy,rr*.18,0,TAU);ctx.fill();
    ctx.restore();
  }
  function frame(now) {
    const t=(now-start)/1000, dt=Math.min(.1,(now-last)/1000||0); last=now;
    cells.fill(null);
    const target=drawEnvelope(t);
    if(t>1.9&&t<5.8)cursor(t,target);
    if(t>=4.55&&t<5.8&&Math.floor(t*12)%2===0)burst(target.sealX,target.sealY,1,[[1,.7,.95]]);
    fire(t,dt,env());
    // Glowing embers and smoke
    for(const s of sparks){s.age+=dt;s.vx*=1-dt*.8;s.vy+=45*dt;s.x+=s.vx*dt;s.y+=s.vy*dt;if(s.age<s.life)put(s.x,s.y,s.age/s.life<.5?"*":"+",color(s.c,1-s.age/s.life));}
    sparks=sparks.filter(s=>s.age<s.life);
    if(t>4.67&&t<11.5&&rand()<dt*28){const e=env();sparks.push({x:e.x+rand()*e.w,y:e.y+e.h-rand()*H*.18,vx:(rand()-.5)*35,vy:-35-rand()*65,life:1.8,age:0,c:[.35,.3,.3]});}
    // Final blue light rays, stars and floating motes
    const glow=ease((t-11.1)/3.6);
    if(glow>0){
      for(const s of stars){const v=.5+.5*Math.sin(t*s.s+s.p);if(v>.35)put(s.x,s.y,v>.9?"*":v>.7?"+":".",color([.62,.8,1],glow*(v-.25)));}
      for(const p of motes){p.y-=p.s*dt;p.x+=6*Math.sin(t*.8+p.p)*dt;if(p.y<0){p.y=H;p.x=rand()*W;}put(p.x,p.y,":",color([.55,.75,1],glow*p.a*(.35+.65*Math.sin(t*1.7+p.p)**2)));}
      const cx=W/2,cy=H*.29;
      for(let i=0;i<cols*rows*.12;i++){const a=rand()*TAU,rr=rand()*Math.max(W,H)*.52,x=cx+Math.cos(a)*rr,y=cy+Math.sin(a)*rr;put(x,y,".",color([.12,.3,.85],glow*.35*Math.exp(-rr/(H*.55))));}
    }
    textGrid();
    rose(t);
    hint.classList.toggle("visible",t>13.5);
    replay.classList.toggle("visible",t>16);
    raf=requestAnimationFrame(frame);
  }
  function restart(){cancelAnimationFrame(raf);start=performance.now();last=0;sparks=[];seed=21;hint.classList.remove("visible");replay.classList.remove("visible");raf=requestAnimationFrame(frame);}
  replay.addEventListener("click",restart);
  window.addEventListener("resize",()=>{resize();});
  window.addEventListener("keydown",e=>{if(e.key.toLowerCase()==="r")restart();});
  resize(); raf=requestAnimationFrame(frame);
})();