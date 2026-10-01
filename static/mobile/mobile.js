/* ================================================================
   TETRIS MOBILE – Pirate Mode (Offline PWA)
   ================================================================ */

// ─── SERVICE WORKER ───
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ─── AUDIO (reuse sounds from parent dir) ───
const Audio_ = {
  bgmVol: 50, sfxVol: 50,
  pools: {}, bgm: null, pirateBgm: null, fadeTmr: null, pfadeTmr: null,
  init() {
    const sb = localStorage.getItem('m_bgmVol'); if (sb !== null) this.bgmVol = +sb;
    const ss = localStorage.getItem('m_sfxVol'); if (ss !== null) this.sfxVol = +ss;
    ['levelup','tile_put_on','button_click','line_destroy','warning'].forEach(n => {
      this.pools[n] = [];
      for (let i = 0; i < 3; i++) { const a = new Audio(`/sounds/${n}.mp3`); a.preload='auto'; this.pools[n].push(a); }
    });
    this.dbgm1 = new Audio('/sounds/default_bgm1.mp3'); this.dbgm1.loop = true;
    this.dbgm2 = new Audio('/sounds/default_bgm2.mp3'); this.dbgm2.loop = true;
    this.pbgm1 = new Audio('/sounds/pirate_bgm1.mp3'); this.pbgm1.loop = true;
    this.pbgm2 = new Audio('/sounds/pirate_bgm2.mp3'); this.pbgm2.loop = true;
  },
  sfx(n) { if (this.sfxVol<=0) return; const p=this.pools[n]; if(!p) return;
    let a=p.find(x=>x.paused||x.ended); if(!a){a=p[0];a.currentTime=0;}
    a.volume=this.sfxVol/100; a.currentTime=0; a.play().catch(()=>{}); },
  startBGM() { this.stopAll();
    const p=Math.random()<.5?this.dbgm1:this.dbgm2; p.volume=this.bgmVol/100; p.currentTime=0; p.play().catch(()=>{}); this.bgm=p; },
  startPirateBGM() { const p=Math.random()<.5?this.pbgm1:this.pbgm2; p.volume=0; p.currentTime=0; p.play().catch(()=>{});
    this.pirateBgm=p; if(this.bgm) this._fade(this.bgm,3000,'fadeTmr',0); this._fade(p,1000,'pfadeTmr',this.bgmVol/100); },
  stopPirateBGM() { if(this.pirateBgm) this._fade(this.pirateBgm,5000,'pfadeTmr',0);
    this.pirateBgm=null; if(this.bgm) this._fade(this.bgm,2000,'fadeTmr',this.bgmVol/100); },
  stopAll() { clearInterval(this.fadeTmr); clearInterval(this.pfadeTmr);
    [this.dbgm1,this.dbgm2,this.pbgm1,this.pbgm2].forEach(a=>{a.pause();a.currentTime=0;}); this.bgm=null;this.pirateBgm=null; },
  pause() { if(this.bgm&&!this.bgm.paused) this.bgm.pause(); if(this.pirateBgm&&!this.pirateBgm.paused) this.pirateBgm.pause(); },
  resume() { if(this.bgm&&this.bgm.currentTime>0) this.bgm.play().catch(()=>{}); if(this.pirateBgm&&this.pirateBgm.currentTime>0) this.pirateBgm.play().catch(()=>{}); },
  setBGM(v){this.bgmVol=v;localStorage.setItem('m_bgmVol',v); if(this.bgm&&!this.bgm.paused)this.bgm.volume=v/100; if(this.pirateBgm&&!this.pirateBgm.paused)this.pirateBgm.volume=v/100;},
  setSFX(v){this.sfxVol=v;localStorage.setItem('m_sfxVol',v);},
  _fade(a,ms,key,target){clearInterval(this[key]);const steps=25,st=ms/steps,d=(target-a.volume)/steps;let c=a.volume;
    this[key]=setInterval(()=>{c+=d;if((d>=0&&c>=target)||(d<0&&c<=target)){c=target;a.volume=Math.max(0,c);if(c<=0)a.pause();clearInterval(this[key]);}else{a.volume=Math.max(0,c);}},st);}
};

// ─── CONSTANTS ───
const COLS=10, ROWS=20, HIDDEN=2, TOTAL=ROWS+HIDDEN;
let CELL=24; // recalculated on resize
const NCELL=14;
const COLORS=[null,'#ff3b3b','#3b7bff','#ffd83b','#3bff6e','#b83bff','#3bffff','#ff8c3b'];
const GLOW=[null,'rgba(255,59,59,.35)','rgba(59,123,255,.35)','rgba(255,216,59,.35)','rgba(59,255,110,.35)','rgba(184,59,255,.35)','rgba(59,255,255,.35)','rgba(255,140,59,.35)'];
const SHAPES={
  Z:{id:1,r:[[[0,0],[0,1],[1,1],[1,2]],[[0,1],[1,0],[1,1],[2,0]],[[0,0],[0,1],[1,1],[1,2]],[[0,1],[1,0],[1,1],[2,0]]]},
  J:{id:2,r:[[[0,0],[1,0],[1,1],[1,2]],[[0,0],[0,1],[1,0],[2,0]],[[0,0],[0,1],[0,2],[1,2]],[[0,0],[1,0],[2,-1],[2,0]]]},
  O:{id:3,r:[[[0,0],[0,1],[1,0],[1,1]],[[0,0],[0,1],[1,0],[1,1]],[[0,0],[0,1],[1,0],[1,1]],[[0,0],[0,1],[1,0],[1,1]]]},
  S:{id:4,r:[[[0,1],[0,2],[1,0],[1,1]],[[0,0],[1,0],[1,1],[2,1]],[[0,1],[0,2],[1,0],[1,1]],[[0,0],[1,0],[1,1],[2,1]]]},
  T:{id:5,r:[[[0,1],[1,0],[1,1],[1,2]],[[0,0],[1,0],[1,1],[2,0]],[[0,0],[0,1],[0,2],[1,1]],[[0,0],[1,-1],[1,0],[2,0]]]},
  I:{id:6,r:[[[0,0],[0,1],[0,2],[0,3]],[[0,0],[1,0],[2,0],[3,0]],[[0,0],[0,1],[0,2],[0,3]],[[0,0],[1,0],[2,0],[3,0]]]},
  L:{id:7,r:[[[0,2],[1,0],[1,1],[1,2]],[[0,0],[1,0],[2,0],[2,1]],[[0,0],[0,1],[0,2],[1,0]],[[0,0],[0,1],[1,1],[2,1]]]}
};
const PNAMES=['Z','J','O','S','T','I','L'];
const KICKS=[[0,0],[-1,0],[1,0],[0,-1],[-1,-1],[1,-1],[0,1],[-1,1],[1,1],[-2,0],[2,0]];
const LSCORES=[0,100,300,500,800];

// ─── STATE ───
let board=[],gemBoard=[];
let cur=null,held=null,canHold_=true,nq=[],bag_=[];
let score_=0,level_=1,lines_=0,playTime_=0;
let tmrInt=null,dropSpd=800,lastDrop_=0,animF=null;
let lockDly=0,lockLim=2000,lockMoves=0;
const LOCK_MOVE_MAX=15;
let flashRows=[],flashTime=0,flashGem=false;
let isPlay=false,isPause=false,lastFT=0;
// Gem
let gemTT=0,gemBT=0,gemTE=0,gemBD=0,gemReady=false,gemPopup=null,gemTotal=0;
// Pirate
const P_SCORE_TRIG=1000,P_TIME_TRIG=60,P_WARN_DUR=2000,P_STEAL=3000,P_LANE_H=2,P_SHIP_W=60,P_SHIP_H=30;
const P_MK=5,P_MS=10000,P_ML=5,P_MT=180,P_GB=500,P_GC=2000,P_GMK=3,P_MAX_MISS=3;
let pSA=0,pTA=0,pActive=false,pWarn=false,pWarnStart=0;
let pX=0,pY=0,pState='idle',pDir=1,pSpd=0,pTravelDur=60;
let pArrTime=0,pStealDone=false,pEscStart=0;
let pKills=0,pMisses=0,pGV=0,pGM=P_GB,pGVis=false;
let pLaser=false,pLaserStart=0,pAngle=0,pDyStart=0;
let pSmoke=[],pPopups=[],pLaneVis=false;
// Canvas
let cv,cx,hCv,hCx,nCvs=[],nCxs=[];

// ─── SCREENS ───
function showScreen(id){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));document.getElementById(id).classList.add('active');}

// ─── CANVAS INIT ───
function initCV(){
  cv=document.getElementById('m-canvas');
  const area=document.querySelector('.board-area');
  const maxH=area.clientHeight-8;
  const maxW=area.clientWidth-8;
  CELL=Math.floor(Math.min(maxH/ROWS, maxW/COLS));
  if(CELL<10)CELL=10;
  cv.width=COLS*CELL; cv.height=ROWS*CELL;
  cx=cv.getContext('2d');
  hCv=document.getElementById('m-hold'); hCx=hCv.getContext('2d');
  nCvs=[];nCxs=[];
  for(let i=0;i<3;i++){const c=document.getElementById(`m-next-${i}`);nCvs.push(c);nCxs.push(c.getContext('2d'));}
}

// ─── BAG ───
function refBag(){bag_=[...PNAMES];for(let i=bag_.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[bag_[i],bag_[j]]=[bag_[j],bag_[i]];}}
function nextP(){if(!bag_.length)refBag();return bag_.pop();}
function fillQ(){while(nq.length<4)nq.push(nextP());}

// ─── PIECE ───
function mkP(n){return{name:n,id:SHAPES[n].id,rot:0,row:HIDDEN-1,col:Math.floor(COLS/2)-1,cells:SHAPES[n].r[0]};}
function pCells(p,r){return SHAPES[p.name].r[r!==undefined?r:p.rot];}
function absC(p,ro,co,r){const c=pCells(p,r),rr=p.row+(ro||0),cc=p.col+(co||0);return c.map(([dr,dc])=>[rr+dr,cc+dc]);}
function valid(p,ro,co,r){return absC(p,ro,co,r).every(([r_,c_])=>r_>=0&&r_<TOTAL&&c_>=0&&c_<COLS&&board[r_][c_]===0);}

// ─── GEM ───
function resetGem(){gemTT=10+Math.floor(Math.random()*21);gemBT=100+Math.floor(Math.random()*401);gemTE=0;gemBD=0;gemReady=false;}
function checkGem(){if(gemReady)return;if(gemTE>=gemTT||gemBD>=gemBT)gemReady=true;}

// ─── BOARD ───
function mkBoard(){board=Array.from({length:TOTAL},()=>Array(COLS).fill(0));gemBoard=Array.from({length:TOTAL},()=>Array(COLS).fill(false));}

function lockP(){
  absC(cur).forEach(([r,c],i)=>{if(r>=0&&r<TOTAL&&c>=0&&c<COLS){board[r][c]=cur.id;if(cur.hasGem&&i===cur.gemIdx)gemBoard[r][c]=true;}});
  canHold_=true; Audio_.sfx('tile_put_on'); gemBD++;checkGem(); clearL(); spawnP();
}

function clearL(){
  const full=[];
  for(let r=HIDDEN;r<TOTAL;r++) if(board[r].every(c=>c!==0)) full.push(r);
  if(!full.length) return;
  Audio_.sfx('line_destroy');
  let hasGem=false;
  for(const r of full) for(let c=0;c<COLS;c++) if(gemBoard[r][c]){hasGem=true;break;}
  flashRows=full; flashTime=performance.now(); flashGem=hasGem;
  setTimeout(()=>{
    full.forEach(r=>{board.splice(r,1);board.unshift(Array(COLS).fill(0));gemBoard.splice(r,1);gemBoard.unshift(Array(COLS).fill(false));});
    flashRows=[];flashGem=false;
    const cl=full.length; lines_+=cl;
    const mult=hasGem?10:1, gained=LSCORES[cl]*level_*mult;
    if(pActive&&pGVis) addGauge(gained); else { score_+=gained; pSA+=gained; checkPSpawn(); }
    if(hasGem){gemTotal++;gemPopup={text:`x10 GEM! +${gained.toLocaleString()}`,y:(full[0]-HIDDEN)*CELL,time:performance.now()};resetGem();}
    const ol=level_; level_=Math.floor(lines_/10)+1; dropSpd=Math.max(80,800-(level_-1)*60);
    if(level_>ol) Audio_.sfx('levelup');
    updUI();
  },200);
}

function spawnP(){
  fillQ(); const n=nq.shift(); cur=mkP(n);
  if(gemReady){cur.hasGem=true;cur.gemIdx=Math.floor(Math.random()*pCells(cur).length);gemReady=false;resetGem();}
  fillQ(); drawNexts();
  if(!valid(cur,0,0)) gameOver_();
}

// ─── MOVE ───
function rstLock(){if(lockMoves<LOCK_MOVE_MAX){lockDly=0;lockMoves++;}}
function mL(){if(!cur||!isPlay||isPause)return;if(valid(cur,0,-1)){cur.col--;if(!valid(cur,1,0))rstLock();}}
function mR(){if(!cur||!isPlay||isPause)return;if(valid(cur,0,1)){cur.col++;if(!valid(cur,1,0))rstLock();}}
function mD(){if(!cur||!isPlay||isPause)return false;if(valid(cur,1,0)){cur.row++;
  if(pActive&&pGVis)addGauge(1);else{score_+=1;pSA+=1;} lockDly=0;updUI();return true;}return false;}
function hardDrop_(){if(!cur||!isPlay||isPause)return;let d=0;while(valid(cur,1,0)){cur.row++;d++;}
  if(pActive&&pGVis)addGauge(d*2);else{score_+=d*2;pSA+=d*2;} updUI();lockP();}
function rot_(){if(!cur||!isPlay||isPause)return;const nr=(cur.rot+1)%4;
  for(const[dc,dr]of KICKS){const t={...cur,col:cur.col+dc,row:cur.row+dr};if(valid(t,0,0,nr)){cur.col=t.col;cur.row=t.row;cur.rot=nr;cur.cells=pCells(cur,nr);if(!valid(cur,1,0))rstLock();return;}}}
function hold_(){if(!cur||!canHold_||!isPlay||isPause)return;canHold_=false;const hg=cur.hasGem,gi=cur.gemIdx,n=cur.name;
  if(held){const h=held;held=n;cur=mkP(h);if(hg){cur.hasGem=true;cur.gemIdx=Math.min(gi,pCells(cur).length-1);}}else{held=n;spawnP();}drawHold();}

// ─── GHOST ───
function ghostR(){if(!cur)return cur.row;let g=cur.row;const gh={...cur};while(true){gh.row=g+1;if(valid(gh,0,0))g++;else break;}return g;}

// ─── DRAW ───
function drawCell_(cx_,x,y,sz,ci,ghost,gem){
  if(!ci)return;const co=COLORS[ci],gl=GLOW[ci];
  if(ghost){cx_.strokeStyle=co;cx_.lineWidth=1;cx_.globalAlpha=.3;cx_.strokeRect(x+1,y+1,sz-2,sz-2);cx_.globalAlpha=1;return;}
  cx_.fillStyle=co;cx_.fillRect(x+1,y+1,sz-2,sz-2);
  cx_.fillStyle='rgba(255,255,255,.2)';cx_.fillRect(x+1,y+1,sz-2,2);cx_.fillRect(x+1,y+1,2,sz-2);
  cx_.fillStyle='rgba(0,0,0,.2)';cx_.fillRect(x+1,y+sz-3,sz-2,2);cx_.fillRect(x+sz-3,y+1,2,sz-2);
  if(gem){cx_.save();const cx2=x+sz/2,cy2=y+sz/2,s=sz*.3;cx_.beginPath();cx_.moveTo(cx2,cy2-s);cx_.lineTo(cx2+s,cy2);cx_.lineTo(cx2,cy2+s);cx_.lineTo(cx2-s,cy2);cx_.closePath();cx_.fillStyle='#ffe066';cx_.shadowColor='#ffe066';cx_.shadowBlur=6;cx_.fill();cx_.shadowBlur=0;cx_.restore();}
}

function drawBoard_(){
  cx.fillStyle='#0a0a16';cx.fillRect(0,0,cv.width,cv.height);
  cx.strokeStyle='rgba(40,40,80,.3)';cx.lineWidth=.5;
  for(let c=1;c<COLS;c++){cx.beginPath();cx.moveTo(c*CELL,0);cx.lineTo(c*CELL,cv.height);cx.stroke();}
  for(let r=1;r<ROWS;r++){cx.beginPath();cx.moveTo(0,r*CELL);cx.lineTo(cv.width,r*CELL);cx.stroke();}
  for(let r=HIDDEN;r<TOTAL;r++)for(let c=0;c<COLS;c++)if(board[r][c])drawCell_(cx,c*CELL,(r-HIDDEN)*CELL,CELL,board[r][c],false,gemBoard[r][c]);
  if(flashRows.length>0){const e=performance.now()-flashTime,a=Math.max(0,1-e/200);cx.fillStyle=flashGem?`rgba(255,215,0,${a*.85})`:`rgba(255,255,255,${a*.7})`;flashRows.forEach(r=>cx.fillRect(0,(r-HIDDEN)*CELL,cv.width,CELL));}
  // Pirate lane + ship
  const LANE_PX=P_LANE_H*CELL;
  if(pLaneVis||pWarn){cx.save();cx.fillStyle='rgba(30,10,40,.85)';cx.fillRect(0,0,cv.width,LANE_PX);
    cx.strokeStyle='rgba(180,50,255,.5)';cx.lineWidth=2;cx.beginPath();cx.moveTo(0,LANE_PX);cx.lineTo(cv.width,LANE_PX);cx.stroke();
    cx.font=`${Math.max(7,CELL*.3)}px "Press Start 2P",monospace`;cx.fillStyle='rgba(180,50,255,.5)';cx.textAlign='left';cx.fillText('☠ PIRATE',4,LANE_PX*.4);
    if(pMisses>0){cx.textAlign='right';cx.fillStyle='rgba(255,80,80,.7)';cx.fillText(`MISS:${pMisses}/${P_MAX_MISS}`,cv.width-4,LANE_PX*.4);}
    cx.restore();}
  if(pWarn&&!pActive){const e=performance.now()-pWarnStart,a=.5+.5*Math.sin(e/150);
    cx.fillStyle=`rgba(255,0,0,${a*.08})`;cx.fillRect(0,0,cv.width,cv.height);
    cx.save();cx.font=`bold ${Math.max(16,CELL*1.2)}px "Press Start 2P",monospace`;cx.textAlign='center';cx.fillStyle=`rgba(255,50,50,${a})`;cx.shadowColor='#f00';cx.shadowBlur=15;
    cx.fillText('⚠ WARNING!',cv.width/2,cv.height/2-10);cx.shadowBlur=0;cx.font=`${Math.max(10,CELL*.4)}px "Noto Sans KR",sans-serif`;cx.fillStyle=`rgba(255,150,150,${a*.8})`;
    cx.fillText('해적 우주선 접근 중...',cv.width/2,cv.height/2+15);cx.restore();}
  if(pActive&&pState!=='idle'){
    cx.save();
    if(pState==='dying'){cx.translate(pX+30,pY+15);cx.rotate(pAngle);cx.translate(-(pX+30),-(pY+15));}
    const sx=pX,sy=pY,fL=pState!=='escaping';
    cx.save();if(!fL){cx.translate(sx+35,sy+15);cx.scale(-1,1);cx.translate(-(sx+35),-(sy+15));}
    cx.fillStyle='#2a1a3a';cx.beginPath();cx.moveTo(sx+10,sy+20);cx.lineTo(sx+20,sy+5);cx.lineTo(sx+50,sy+2);cx.lineTo(sx+60,sy+10);cx.lineTo(sx+55,sy+28);cx.lineTo(sx+15,sy+30);cx.closePath();cx.fill();
    cx.fillStyle='#4a2a5a';cx.beginPath();cx.moveTo(sx+15,sy+15);cx.lineTo(sx+25,sy+8);cx.lineTo(sx+50,sy+6);cx.lineTo(sx+55,sy+15);cx.lineTo(sx+50,sy+22);cx.lineTo(sx+18,sy+24);cx.closePath();cx.fill();
    cx.fillStyle='#fff';cx.font='14px serif';cx.textAlign='center';cx.fillText('☠',sx+35,sy+20);
    cx.fillStyle='rgba(180,50,255,.6)';cx.shadowColor='#b83bff';cx.shadowBlur=10;cx.beginPath();cx.ellipse(sx+58,sy+18,5,3,0,0,Math.PI*2);cx.fill();cx.shadowBlur=0;
    cx.restore();
    if(pLaser){const e=performance.now()-pLaserStart,a=.6+.4*Math.sin(e/60);cx.strokeStyle=`rgba(255,140,0,${a})`;cx.lineWidth=5;cx.shadowColor='#ff8c00';cx.shadowBlur=20;cx.beginPath();cx.moveTo(cv.width/2,cv.height);cx.lineTo(sx+35,sy+15);cx.stroke();cx.shadowBlur=0;}
    pSmoke.forEach(p_=>{cx.globalAlpha=Math.max(0,p_.life);cx.fillStyle=`rgba(100,100,100,${p_.life*.8})`;cx.beginPath();cx.arc(p_.x,p_.y,p_.size,0,Math.PI*2);cx.fill();});cx.globalAlpha=1;
    cx.restore();
  }
  pPopups.forEach(pp=>{const e=performance.now()-pp.time;if(e<1500){const a=1-e/1500;cx.save();cx.globalAlpha=a;cx.font=`bold ${Math.max(10,CELL*.5)}px "Press Start 2P",monospace`;cx.textAlign='center';cx.fillStyle=pp.color;cx.shadowColor=pp.color;cx.shadowBlur=8;cx.fillText(pp.text,pp.x,pp.y-e/1500*40);cx.restore();}});
  pPopups=pPopups.filter(p_=>performance.now()-p_.time<1500);
  // Ghost + current
  if(cur){const gr=ghostR();if(gr!==cur.row)pCells(cur).forEach(([dr,dc])=>drawCell_(cx,(cur.col+dc)*CELL,(gr+dr-HIDDEN)*CELL,CELL,cur.id,true,false));
    pCells(cur).forEach(([dr,dc],i)=>drawCell_(cx,(cur.col+dc)*CELL,(cur.row+dr-HIDDEN)*CELL,CELL,cur.id,false,cur.hasGem&&i===cur.gemIdx));}
  // Gem popup
  if(gemPopup){const e=performance.now()-gemPopup.time;if(e<1500){const a=1-e/1500;cx.save();cx.globalAlpha=a;cx.font=`bold ${Math.max(12,CELL*.6)}px "Press Start 2P",monospace`;cx.textAlign='center';cx.fillStyle='#ffd700';cx.shadowColor='#ff8c00';cx.shadowBlur=10;cx.fillText(gemPopup.text,cv.width/2,Math.max(20,gemPopup.y-e/1500*50));cx.restore();}else gemPopup=null;}
}

function drawPrev(cx_,cv_,nm){cx_.clearRect(0,0,cv_.width,cv_.height);if(!nm)return;const s=SHAPES[nm],c=s.r[0];
  const mnR=Math.min(...c.map(v=>v[0])),mxR=Math.max(...c.map(v=>v[0])),mnC=Math.min(...c.map(v=>v[1])),mxC=Math.max(...c.map(v=>v[1]));
  const w=mxC-mnC+1,h=mxR-mnR+1,ox=(cv_.width-w*NCELL)/2,oy=(cv_.height-h*NCELL)/2;
  c.forEach(([r,cl])=>drawCell_(cx_,ox+(cl-mnC)*NCELL,oy+(r-mnR)*NCELL,NCELL,s.id,false,false));}
function drawNexts(){for(let i=0;i<3;i++)drawPrev(nCxs[i],nCvs[i],nq[i]||null);}
function drawHold(){drawPrev(hCx,hCv,held);}

// ─── UI ───
function updUI(){
  const se=document.getElementById('m-score'),le=document.getElementById('m-level'),li=document.getElementById('m-lines');
  if(se)se.textContent=score_.toLocaleString();if(le)le.textContent=level_;if(li)li.textContent=lines_;
}
function updTimer(){
  playTime_++;pTA++;checkPSpawn();
  gemTE++;checkGem();
}

// ─── PIRATE ───
function checkPSpawn(){if(pActive||pWarn)return;if(pSA>=P_SCORE_TRIG||pTA>=P_TIME_TRIG){startPWarn();pSA=0;pTA=0;}}
function startPWarn(){pWarn=true;pWarnStart=performance.now();Audio_.sfx('warning');Audio_.startPirateBGM();}
function calcTravelT(){const k=Math.min(pKills,P_MK)/P_MK,s=Math.min(score_,P_MS)/P_MS,l=Math.min(level_,P_ML)/P_ML,t=Math.min(playTime_,P_MT)/P_MT;return 60-(k+s+l+t)/4*(60-15);}
function calcGM(){const ek=Math.max(0,pKills-pMisses),kr=Math.min(ek,P_GMK)/P_GMK;return Math.round(P_GB+kr*(P_GC-P_GB));}

function spawnShip(){pActive=true;pWarn=false;pLaneVis=true;pState='moving';pDir=1;pStealDone=false;pSmoke=[];pAngle=0;pLaser=false;
  pTravelDur=calcTravelT();pSpd=(cv.width+P_SHIP_W)/(pTravelDur*1000);pX=cv.width+10;pY=P_LANE_H*CELL/2-P_SHIP_H/2;
  pGM=calcGM();pGV=0;pGVis=true;updGauge();}

function updShip(dt){
  if(pWarn&&!pActive){if(performance.now()-pWarnStart>=P_WARN_DUR)spawnShip();return;}
  if(!pActive)return;
  if(pState==='dying'){const e=performance.now()-pDyStart;pAngle=Math.sin(e/80)*(.1+e/5000);pY+=.5;pX+=Math.sin(e/200)*2;
    if(Math.random()<.4)pSmoke.push({x:pX+20+Math.random()*30,y:pY+10+Math.random()*20,vx:(Math.random()-.5)*2,vy:-1-Math.random()*2,life:1,size:4+Math.random()*8});
    pSmoke.forEach(p_=>{p_.x+=p_.vx;p_.y+=p_.vy;p_.life-=.02;p_.size+=.3;});pSmoke=pSmoke.filter(p_=>p_.life>0);
    if(e>2500){pKills++;pPopups.push({text:`+격추!(${pKills})`,x:cv.width/2,y:P_LANE_H*CELL+40,time:performance.now(),color:'#3bff6e'});endShip();}return;}
  if(pState==='counter'){if(performance.now()-pLaserStart>1200){pState='dying';pDyStart=performance.now();pLaser=false;}return;}
  if(pState==='moving'){pX-=pSpd*dt;if(pX<=-P_SHIP_W+15){pX=-P_SHIP_W+15;pState='arrived';pArrTime=performance.now();pStealDone=false;}return;}
  if(pState==='arrived'){const e=performance.now()-pArrTime;if(e>=2000&&!pStealDone){const st=Math.min(score_,P_STEAL);score_-=st;pStealDone=true;pPopups.push({text:`-${st}`,x:80,y:P_LANE_H*CELL+30,time:performance.now(),color:'#ff3b3b'});updUI();pState='escaping';pEscStart=performance.now();pDir=-1;}return;}
  if(pState==='escaping'){pX+=(cv.width+P_SHIP_W+30)/2000*dt;if(pX>cv.width+30){pMisses++;pPopups.push({text:`격추실패!(${pMisses}/${P_MAX_MISS})`,x:cv.width/2,y:P_LANE_H*CELL+60,time:performance.now(),color:'#ff8c3b'});endShip();if(pMisses>=P_MAX_MISS)setTimeout(gameOver_,500);}return;}
}
function fireLaser(){if(!pActive||pState==='dying'||pState==='counter')return;pState='counter';pLaser=true;pLaserStart=performance.now();pGV=0;updGauge();}
function endShip(){pActive=false;pWarn=false;pState='idle';pLaser=false;pGVis=false;pGV=0;pSmoke=[];pLaneVis=false;
  const gw=document.getElementById('m-gauge-wrap');if(gw)gw.style.display='none'; Audio_.stopPirateBGM();}
function addGauge(v){if(!pGVis||!pActive)return;pGV=Math.min(pGM,pGV+v);updGauge();if(pGV>=pGM)fireLaser();}
function updGauge(){const gw=document.getElementById('m-gauge-wrap'),gf=document.getElementById('m-gauge-fill'),gt=document.getElementById('m-gauge-txt');
  if(!gw)return; gw.style.display=pGVis?'':'none'; const pct=Math.min(100,pGV/pGM*100);
  if(gf)gf.style.width=pct+'%'; if(gt)gt.textContent=pct>=100?'FIRE!':Math.floor(pct)+'%';}

// ─── GAME LOOP ───
function loop(ts){
  if(!isPlay||isPause){lastFT=0;animF=requestAnimationFrame(loop);return;}
  const fd=lastFT?(ts-lastFT):0; lastFT=ts;
  if(!lastDrop_)lastDrop_=ts; const d=ts-lastDrop_;
  if(cur&&!valid(cur,1,0)){lockDly+=d;if(lockDly>=lockLim){lockP();lockDly=0;lockMoves=0;lastDrop_=ts;}}
  else if(d>=dropSpd){if(cur){cur.row++;if(!valid(cur,1,0)){lockDly=0;lockMoves=0;}}lastDrop_=ts;}
  if(fd>0&&fd<500)updShip(fd);
  drawBoard_();animF=requestAnimationFrame(loop);
}

// ─── GAME CTRL ───
function startGame_(){
  showScreen('game-screen'); initCV(); mkBoard();
  score_=0;level_=1;lines_=0;playTime_=0;dropSpd=800;held=null;canHold_=true;lockDly=0;lockMoves=0;lastDrop_=0;lastFT=0;flashRows=[];flashGem=false;bag_=[];nq=[];gemPopup=null;gemTotal=0;resetGem();
  pSA=0;pTA=0;pActive=false;pWarn=false;pLaser=false;pGV=0;pGM=P_GB;pGVis=false;pSmoke=[];pPopups=[];pKills=0;pMisses=0;pState='idle';pLaneVis=false;pStealDone=false;pAngle=0;
  updUI(); drawHold();
  document.getElementById('pause-ov').classList.add('hidden');
  document.getElementById('go-ov').classList.add('hidden');
  isPlay=true;isPause=false;
  fillQ();spawnP();drawNexts();
  if(tmrInt)clearInterval(tmrInt); tmrInt=setInterval(updTimer,1000);
  if(animF)cancelAnimationFrame(animF); animF=requestAnimationFrame(loop);
  Audio_.startBGM();
}
function togglePause_(){if(!isPlay)return;isPause=!isPause;document.getElementById('pause-ov').classList.toggle('hidden',!isPause);
  if(isPause){clearInterval(tmrInt);Audio_.pause();}else{tmrInt=setInterval(updTimer,1000);lastDrop_=0;lastFT=0;Audio_.resume();}}
function gameOver_(){isPlay=false;isPause=false;clearInterval(tmrInt);Audio_.stopAll();
  document.getElementById('go-score').textContent=score_.toLocaleString();
  document.getElementById('go-level').textContent=level_;document.getElementById('go-lines').textContent=lines_;
  document.getElementById('go-title').textContent=pMisses>=P_MAX_MISS?'해적에게 패배!':'GAME OVER';
  document.getElementById('go-ov').classList.remove('hidden');endShip();}
function toTitle(){isPlay=false;isPause=false;clearInterval(tmrInt);if(animF)cancelAnimationFrame(animF);Audio_.stopAll();showScreen('title-screen');}

// ─── JOYSTICK ───
(function(){
  let active=false,baseRect=null,baseR=0,moveDir=null,moveInt=null;
  const knob=()=>document.getElementById('joy-knob');
  const base=()=>document.getElementById('joy-base');

  function start(e){
    e.preventDefault();active=true;const b=base();baseRect=b.getBoundingClientRect();baseR=baseRect.width/2;move(e);}
  function move(e){
    if(!active)return;e.preventDefault();
    const t=e.touches?e.touches[0]:e;const dx=t.clientX-baseRect.left-baseR,dy=t.clientY-baseRect.top-baseR;
    const dist=Math.sqrt(dx*dx+dy*dy),maxD=baseR*.7;
    const cx_=dist>maxD?dx/dist*maxD:dx, cy_=dist>maxD?dy/dist*maxD:dy;
    const k=knob(); k.style.left=`${30+cx_/baseR*30}%`; k.style.top=`${30+cy_/baseR*30}%`;
    // Determine direction
    const angle=Math.atan2(dy,dx)*180/Math.PI;
    let dir=null;
    if(dist>baseR*.25){
      if(angle>-60&&angle<60) dir='right';
      else if(angle>=60&&angle<120) dir='down';
      else if(angle>120||angle<-120) dir='left';
      // up ignored for joystick (rotate is button)
    }
    if(dir!==moveDir){clearInterval(moveInt);moveDir=dir;
      if(dir){const fn=dir==='left'?mL:dir==='right'?mR:mD;fn();moveInt=setInterval(fn,80);}}
  }
  function end(e){e.preventDefault();active=false;moveDir=null;clearInterval(moveInt);moveInt=null;
    const k=knob();k.style.left='30%';k.style.top='30%';}

  document.addEventListener('DOMContentLoaded',()=>{
    const area=document.getElementById('joystick-area');
    area.addEventListener('touchstart',start,{passive:false});
    area.addEventListener('touchmove',move,{passive:false});
    area.addEventListener('touchend',end,{passive:false});
    area.addEventListener('touchcancel',end,{passive:false});
  });
})();

// ─── BUTTONS ───
document.addEventListener('DOMContentLoaded',()=>{
  // Title
  document.getElementById('btn-play').addEventListener('click',()=>{Audio_.sfx('button_click');startGame_();});
  document.getElementById('btn-option').addEventListener('click',()=>{Audio_.sfx('button_click');showScreen('option-screen');
    document.getElementById('bgm-range').value=Audio_.bgmVol;document.getElementById('bgm-num').textContent=Audio_.bgmVol;
    document.getElementById('sfx-range').value=Audio_.sfxVol;document.getElementById('sfx-num').textContent=Audio_.sfxVol;});
  document.getElementById('btn-opt-back').addEventListener('click',()=>{Audio_.sfx('button_click');showScreen('title-screen');});
  document.getElementById('bgm-range').addEventListener('input',e=>{const v=+e.target.value;Audio_.setBGM(v);document.getElementById('bgm-num').textContent=v;});
  document.getElementById('sfx-range').addEventListener('input',e=>{const v=+e.target.value;Audio_.setSFX(v);document.getElementById('sfx-num').textContent=v;});
  document.getElementById('sfx-range').addEventListener('change',()=>Audio_.sfx('button_click'));
  // Game buttons
  const prevent=e=>{e.preventDefault();e.stopPropagation();};
  const btn=(id,fn)=>{const el=document.getElementById(id);el.addEventListener('touchstart',e=>{prevent(e);fn();},{passive:false});};
  btn('btn-rotate',rot_); btn('btn-drop',hardDrop_); btn('btn-hold',hold_); btn('btn-pause',togglePause_);
  // Pause overlay
  document.getElementById('btn-resume').addEventListener('click',()=>togglePause_());
  document.getElementById('btn-to-title').addEventListener('click',()=>toTitle());
  document.getElementById('btn-retry').addEventListener('click',()=>startGame_());
  document.getElementById('btn-go-title').addEventListener('click',()=>toTitle());
});

// ─── KEYBOARD (for testing on desktop) ───
document.addEventListener('keydown',e=>{
  if(e.code==='ArrowLeft'){e.preventDefault();mL();}
  if(e.code==='ArrowRight'){e.preventDefault();mR();}
  if(e.code==='ArrowDown'){e.preventDefault();mD();}
  if(e.code==='ArrowUp'){e.preventDefault();rot_();}
  if(e.code==='Space'){e.preventDefault();hardDrop_();}
  if(e.code==='KeyC'||e.code==='ShiftLeft')hold_();
  if(e.code==='KeyP'||e.code==='Escape')if(isPlay)togglePause_();
});

// ─── RESIZE ───
window.addEventListener('resize',()=>{if(isPlay&&!isPause&&cv){initCV();}});

// ─── INIT ───
Audio_.init();

// Lock to landscape hint
function checkOrientation(){
  if(window.innerHeight>window.innerWidth&&document.getElementById('game-screen').classList.contains('active')){
    // could show rotate hint, but we just let CSS handle it
  }
}
window.addEventListener('orientationchange',checkOrientation);
