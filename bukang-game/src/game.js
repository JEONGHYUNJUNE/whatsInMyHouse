import {records,formatTime,validNickname} from './records.js';
import {NETS,netState,netCollision,netBlocksMovement,patrols,alertLevel,throwPattern} from './difficulty.js';
import { WORLD, ROUTE, CHANNEL_RADIUS, SPAWN, KEY_POINTS, EXIT, BRIDGES, routePoint, nearestWater, isWater, makePeople } from './harbor.js';
// A game owns its gestures: keep rapid taps, pinch and Safari gesture zoom
// from changing the visual viewport while two thumbs operate the controls.
for(const event of ['dblclick','gesturestart','gesturechange','gestureend']){
 document.addEventListener(event,e=>e.preventDefault(),{passive:false});
}
let previousTap={time:0,x:0,y:0};
document.addEventListener('touchend',e=>{
 const touch=e.changedTouches?.[0];if(!touch||e.touches.length)return;
 const now=performance.now();
 if(now-previousTap.time<320&&Math.hypot(touch.clientX-previousTap.x,touch.clientY-previousTap.y)<28)e.preventDefault();
 previousTap={time:now,x:touch.clientX,y:touch.clientY};
},{passive:false});
const $=id=>document.getElementById(id),canvas=$('world'),ctx=canvas.getContext('2d');
const sharkSprite=new Image();sharkSprite.src='assets/shark-player.png';
const W=WORLD.width,H=WORLD.height;let vw=0,vh=0,dpr=1,cam={x:0,y:0},time=0,last=0,state='title',chapter=1,hp=100,score=0,got=0,caught=0,cooldown=0,dash=0,invuln=0,elapsed=0,modalAction=null,toastTimer=0;
let player={x:220,y:1470,a:-Math.PI/2},keys=[],rocks=[],fish=[],particles=[];const held=new Set(),input={x:0,y:0},gate=EXIT;let joystickId=null;const bubbles=Array.from({length:90},()=>({x:Math.random()*W,y:Math.random()*H,r:Math.random()*2+1,s:Math.random()*10+5}));
let people=[],throwers=[],projectiles=[],hazardClock=0,keyHold=0,velocity={x:0,y:0};
let best=0;try{best=Number(localStorage.getItem('bukang-best-time-v1'))||0}catch{}$('best').textContent=best?`이 기기의 최단 기록 ${formatTime(best)}`:'';
let runToken=null,runStart=0,finishMs=null,registered=false,registering=false,runGeneration=0,boardGeneration=0,registeredName='';
function resize(){vw=innerWidth;vh=innerHeight;dpr=Math.min(devicePixelRatio||1,2);canvas.width=vw*dpr;canvas.height=vh*dpr;ctx.setTransform(dpr,0,0,dpr,0,0)}addEventListener('resize',resize);resize();
function toast(t){$('toast').textContent=t;$('toast').classList.add('show');toastTimer=3.5}
function resetInput(){held.clear();input.x=input.y=0;joystickId=null;$('knob').style.transform=''}
function hud(){ $('chapter').textContent=chapter===1?'CHAPTER 01 / HARD ESCAPE':'CHAPTER 02 / OPEN WATER';$('mission').textContent=chapter===1?'수문의 열쇠를 찾아라':'바다의 사냥꾼';$('progress').textContent=chapter===1?`열쇠 ${got} / 3 · 경계 ${alertLevel(got)}${keyHold>0?' · 확보 '+Math.floor(keyHold/2.2*100)+'%':''}`:`사냥 ${caught} / 8 · ${score} PT`;$('energy-fill').style.width=hp+'%';$('energy-value').textContent=Math.ceil(hp);$('health').classList.toggle('low',hp<=30);$('health').setAttribute('aria-valuenow',String(hp));$('attack').disabled=cooldown>0;}
function setup(ch){
 if(ch!==1)throw new Error('CHAPTER_2_COMING_SOON');
 chapter=ch;resetInput();cooldown=dash=invuln=0;hazardClock=0;keyHold=0;velocity={x:0,y:0};particles=[];projectiles=[];
 if(ch===1){
  player={...SPAWN};got=0;keys=KEY_POINTS.map(p=>({...p,taken:false}));
  rocks=[{...routePoint(6,.6,100),r:44},{...routePoint(4,.25,-98),r:48},{...routePoint(2,.25,100),r:40},{...routePoint(1,.45,-108),r:42},{...routePoint(8,.6,-100),r:40}];
  ({people,throwers}=makePeople());fish=[];
  toast('고난도 탈출: 열쇠 옆에서 2.2초 버티세요. 그물 틈과 순찰선을 조심하세요.');
 }else{
  player={x:2100,y:2400,a:-Math.PI/2};caught=0;people=[];throwers=[];
  rocks=[{x:1000,y:700,r:95},{x:3100,y:2100,r:100},{x:2200,y:1400,r:80}];keys=[];
  fish=Array.from({length:20},(_,i)=>({x:400+Math.random()*(W-800),y:350+Math.random()*(H-700),a:Math.random()*Math.PI*2,speed:45+Math.random()*35,alive:true,kind:i%4}));
  toast('물고기 가까이에서 상어 버튼으로 돌진해 8마리를 사냥하세요.');
 }hud();
}
async function start(){
 if(state==='connecting')return;
 const generation=++runGeneration;state='connecting';resetInput();$('start').disabled=true;$('race-again').disabled=true;toast('탈출 기록을 준비하고 있습니다…');
 try{
  runStart=performance.now();const run=await records.start();if(generation!==runGeneration)return;
  runToken=run.token;finishMs=null;registered=registering=false;registeredName='';hp=100;score=0;elapsed=0;state='play';
  $('menu').hidden=true;$('modal').hidden=true;$('results').hidden=true;$('hud').hidden=false;$('controls').hidden=false;setup(1);
 }catch(error){if(generation!==runGeneration)return;modal('CONNECTION REQUIRED','기록 연결을 확인해 주세요','순위 기록에 연결하지 못했습니다.\n네트워크를 확인하고 다시 도전해 주세요.','다시 연결',start);}
 finally{$('start').disabled=false;$('race-again').disabled=false;}
}
function modal(kicker,title,body,label,action){state='modal';resetInput();$('modal-kicker').textContent=kicker;$('modal-title').textContent=title;$('modal-body').textContent=body;$('continue').textContent=label;modalAction=action;$('modal').hidden=false;$('controls').hidden=true;}
function resume(){state='play';$('modal').hidden=true;$('controls').hidden=false;resetInput()}
function pause(){if(state==='play')modal('DIVE PAUSED','잠시, 수면 위로','일시정지 중에도 탈출 기록 시간은 흐릅니다.\n숨을 고르고 다시 바다로 돌아가세요.','계속 헤엄치기',resume)}
function attack(){if(state!=='play'||cooldown>0)return;dash=.36;cooldown=chapter===1?2.6:1.4;burst(player.x,player.y,'#a1dedb',12)}
function burst(x,y,color,n){for(let i=0;i<n;i++)particles.push({x,y,vx:(Math.random()-.5)*140,vy:(Math.random()-.5)*140,life:.5+Math.random()*.5,color})}
$('start').onclick=start;$('pause').onclick=pause;$('continue').onclick=()=>modalAction?.();$('home').onclick=goHome;$('attack').addEventListener('pointerdown',e=>{e.preventDefault();attack()});
const stick=$('stick');function moveStick(e){const r=stick.getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,max=r.width*.35,len=Math.hypot(dx,dy),s=Math.min(1,max/(len||1));input.x=dx*s/max;input.y=dy*s/max;$('knob').style.transform=`translate(${input.x*36}px,${input.y*36}px)`}
stick.addEventListener('pointerdown',e=>{if(joystickId!==null)return;joystickId=e.pointerId;stick.setPointerCapture(e.pointerId);moveStick(e);e.preventDefault()});stick.addEventListener('pointermove',e=>{if(e.pointerId===joystickId)moveStick(e)});for(const ev of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(ev,e=>{if(e.pointerId===joystickId){input.x=input.y=0;joystickId=null;$('knob').style.transform=''}});
addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();held.add(e.key.toLowerCase());if(e.code==='Space')attack();if(e.key==='Escape'){if(state==='play')pause();else if(state==='modal'&&modalAction===resume)resume()}});addEventListener('keyup',e=>held.delete(e.key.toLowerCase()));addEventListener('blur',()=>{resetInput();pause()});document.addEventListener('visibilitychange',()=>{if(document.hidden){resetInput();pause()}});
function update(dt){time+=dt;if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)$('toast').classList.remove('show')}if(state!=='play')return;elapsed+=dt;if(chapter===1)hazardClock+=dt;cooldown=Math.max(0,cooldown-dt);dash=Math.max(0,dash-dt);invuln=Math.max(0,invuln-dt);let x=input.x+(held.has('d')||held.has('arrowright')?1:0)-(held.has('a')||held.has('arrowleft')?1:0),y=input.y+(held.has('s')||held.has('arrowdown')?1:0)-(held.has('w')||held.has('arrowup')?1:0),l=Math.hypot(x,y);if(l>1){x/=l;y/=l}if(l>.08){let target=Math.atan2(y,x);player.a+=Math.atan2(Math.sin(target-player.a),Math.cos(target-player.a))*Math.min(1,dt*10)}const speed=dash>0?670:275;
 velocity={x:(dash>0?Math.cos(player.a):x)*speed,y:(dash>0?Math.sin(player.a):y)*speed};
 const mx=(dash>0?Math.cos(player.a):x)*speed*dt,my=(dash>0?Math.sin(player.a):y)*speed*dt;
 // Sweep the movement so a dash cannot cross a thin quay or cut through a bend.
 const steps=Math.max(1,Math.ceil(Math.hypot(mx,my)/10));
 for(let i=0;i<steps;i++){
  const nx=player.x+mx/steps,ny=player.y+my/steps;
  if(chapter===1&&netBlocksMovement(player,{x:nx,y:ny},hazardClock)){takeDamage(16,'차단 그물 · 에너지 −16');dash=0;break;}
  if(isWater(nx,player.y,30,chapter))player.x=nx;if(isWater(player.x,ny,30,chapter))player.y=ny;
 }
 if(state!=='play')return;
 if(chapter===1)for(const boat of patrols(hazardClock)){const dx=player.x-boat.x,dy=player.y-boat.y,d=Math.hypot(dx,dy);if(d<100){const a=Math.atan2(dy,dx),px=boat.x+Math.cos(a)*105,py=boat.y+Math.sin(a)*105;if(isWater(px,py,30,1)&&!netCollision(px,py,hazardClock)){player.x=px;player.y=py;}takeDamage(26,'순찰선 충돌 · 에너지 −26');if(state!=='play')return;}}


for(const r of rocks){let dx=player.x-r.x,dy=player.y-r.y,dist=Math.hypot(dx,dy),min=r.r+25;if(dist<min){let a=dist?Math.atan2(dy,dx):0;player.x=r.x+Math.cos(a)*min;player.y=r.y+Math.sin(a)*min;takeDamage(18,'암초 충돌 · 에너지 −18');if(state!=='play')return;}}
updatePeople(dt);if(state!=='play')return;
if(chapter===1){
 const k=keys[got];
 if(k&&Math.hypot(player.x-k.x,player.y-k.y)<80&&dash<=0){
  keyHold+=dt;
  if(keyHold>=2.2){k.taken=true;got++;keyHold=0;score+=150;burst(k.x,k.y,'#e7cd8b',22);toast(got===3?'열쇠 확보 완료! 마리나 출구로. 경계 최고 단계!':`열쇠 ${got}/3 확보 · 투척자의 경계가 높아졌습니다.`);}
 }else keyHold=0;
 if(Math.hypot(player.x-gate.x,player.y-gate.y)<105){if(got===3){score+=500;finishEscape();}else if(toastTimer<=0)toast('수문을 열려면 열쇠 3개가 필요합니다.')}}else{for(const f of fish){if(!f.alive)continue;let dist=Math.hypot(player.x-f.x,player.y-f.y);f.a+=Math.sin(time*.7+f.kind)*dt*.65;if(dist<190){const flee=Math.atan2(f.y-player.y,f.x-player.x);f.a+=Math.atan2(Math.sin(flee-f.a),Math.cos(flee-f.a))*dt*2}f.x+=Math.cos(f.a)*f.speed*dt*(dist<190?1.5:1);f.y+=Math.sin(f.a)*f.speed*dt*(dist<190?1.5:1);if(f.x<100||f.x>W-100){f.a=Math.PI-f.a;f.x=Math.max(100,Math.min(W-100,f.x))}if(f.y<130||f.y>H-100){f.a=-f.a;f.y=Math.max(130,Math.min(H-100,f.y))}if(dash>0&&dist<90){f.alive=false;caught++;score+=200;burst(f.x,f.y,'#aad9cb',20);if(caught>=8){score+=Math.max(0,Math.round(180-elapsed))*10;best=Math.max(best,score);try{localStorage.setItem('bukang-best',String(best))}catch{}modal('ALL CHAPTERS COMPLETE','바다를 되찾다',`8마리 사냥 완료 · ${Math.floor(elapsed/60)}분 ${Math.floor(elapsed%60)}초\n최종 점수 ${score.toLocaleString()} PT`,'다시 바다로',start);return}}}}
for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt}particles=particles.filter(p=>p.life>0);hud()}
function takeDamage(amount,message){
 if(state!=='play'||invuln>0)return false;
 hp=Math.max(0,hp-amount);keyHold=0;invuln=1.2;dash=0;burst(player.x,player.y,'#e9a88b',18);toast(message);hud();
 if(hp===0){modal('ENERGY DEPLETED','북항에서 다시 시작',`에너지가 모두 소진되었습니다.\n열쇠와 사냥 기록이 초기화됩니다.\n이번 점수 ${score} PT`,'1장부터 다시 시작',start);}return true;
}
function updatePeople(dt){
 if(chapter!==1)return;
 for(const p of people){const walk=Math.sin(time*.25+p.phase)*35;p.x=p.baseX+Math.cos(p.a)*walk;p.y=p.baseY+Math.sin(p.a)*walk;}
 for(const n of throwers){
  const level=alertLevel(got);
  if(n.warning>0){n.warning-=dt;if(n.warning<=0){for(const target of n.targets)projectiles.push({sx:n.x,sy:n.y,x:n.x,y:n.y,tx:target.x,ty:target.y,kind:n.id,age:0,flight:.65,life:1.15,hit:false});n.timer=(n.id==='chicken'?2.5:2.9)-level*.35;n.target=null;n.targets=[];}continue;}
  n.timer=Math.max(0,n.timer-dt);
  if(n.timer===0&&Math.hypot(player.x-n.x,player.y-n.y)<1050){n.targets=throwPattern(n,player,velocity,level);n.target=n.targets[0];n.warning=.95-level*.08;n.warningTotal=n.warning;if(toastTimer<=0)toast(`${n.name} 조준! 경계 ${level} · 착지 표시에서 벗어나세요.`);}

 }
 for(const p of projectiles){p.age+=dt;const t=Math.min(1,p.age/p.flight);p.x=p.sx+(p.tx-p.sx)*t;p.y=p.sy+(p.ty-p.sy)*t;
  if(p.age>=p.flight&&!p.splashed){p.splashed=true;burst(p.tx,p.ty,'#bddcda',16);}
  if(p.age>=p.flight&&!p.hit&&Math.hypot(player.x-p.tx,player.y-p.ty)<70){p.hit=true;takeDamage(p.kind==='chicken'?22:28,p.kind==='chicken'?'닭고기에 맞았다 · 에너지 −22':'캔에 맞았다 · 에너지 −28');if(state!=='play')return;}
 }projectiles=projectiles.filter(p=>p.age<p.life);
}
function path(points,fill,stroke){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke()}}
function shark(x,y,a,scale=1){ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.scale(scale,scale);if(sharkSprite.complete&&sharkSprite.naturalWidth){ctx.shadowColor='#0009';ctx.shadowBlur=14;ctx.shadowOffsetY=10;const width=160,height=width*sharkSprite.naturalHeight/sharkSprite.naturalWidth;for(let i=0;i<32;i++){const u=i/32,sw=sharkSprite.naturalWidth/32,offset=Math.sin(time*(dash>0?17:7)+u*5)*Math.pow(1-u,2)*7;ctx.drawImage(sharkSprite,i*sw,0,sw+1,sharkSprite.naturalHeight,-width/2+i*width/32,-height/2+offset,width/32+0.25,height)}ctx.restore();return}const tail=Math.sin(time*(dash>0?16:7))*8;ctx.shadowColor='#000a';ctx.shadowBlur=16;ctx.shadowOffsetY=10;path([[-42,0],[-70,-23+tail],[-64,tail],[-74,25+tail],[-40,7]],'#3d5969','#8aa9b055');path([[-9,-10],[-29,-42],[-30,-10],[-30,10],[-33,40],[-5,13]],'#4e6e80','#aac5c666');const g=ctx.createLinearGradient(0,-18,0,18);g.addColorStop(0,'#9bb8bf');g.addColorStop(.35,'#627f91');g.addColorStop(.7,'#345165');g.addColorStop(1,'#203b4c');ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(63,0);ctx.bezierCurveTo(35,-24,-13,-24,-46,-5);ctx.lineTo(-50,0);ctx.lineTo(-46,6);ctx.bezierCurveTo(-12,22,40,25,63,0);ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;path([[0,-1],[-18,-13],[-25,0],[0,5]],'#aac4cb','#d0e0df66');ctx.strokeStyle='#c2d9d977';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(49,-6);ctx.quadraticCurveTo(10,-18,-39,-2);ctx.stroke();ctx.strokeStyle='#172f40';ctx.lineWidth=1.5;for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(21-i*4,-12);ctx.lineTo(19-i*4,-6);ctx.stroke();ctx.beginPath();ctx.moveTo(21-i*4,12);ctx.lineTo(19-i*4,6);ctx.stroke()}for(const sy of [-1,1]){ctx.fillStyle='#061019';ctx.beginPath();ctx.ellipse(43,sy*7,2.3,1.6,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#b6d6d7';ctx.fillRect(43,sy*7,1,.7)}ctx.restore()}
function fishDraw(f){ctx.save();ctx.translate(f.x,f.y);ctx.rotate(f.a);const colors=['#9eb8b9','#8b9eae','#bdab87','#7499a4'],c=colors[f.kind];path([[-16,0],[-31,-12],[-28,Math.sin(time*9+f.x)*3],[-31,12]],c);ctx.fillStyle=c;ctx.beginPath();ctx.ellipse(0,0,23,9,0,0,Math.PI*2);ctx.fill();path([[-2,-5],[-12,-15],[-15,-5]],'#536f80');ctx.fillStyle='#102635';ctx.beginPath();ctx.arc(15,-3,1.8,0,Math.PI*2);ctx.fill();ctx.restore()}
function draw(){ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#071d2b';ctx.fillRect(0,0,vw,vh);const zoom=Math.min(1,Math.max(.55,vw/800));cam.x=player.x-vw/(2*zoom);cam.y=player.y-vh/(2*zoom);cam.x=Math.max(-30,Math.min(W-vw/zoom+30,cam.x));cam.y=Math.max(-30,Math.min(H-vh/zoom+30,cam.y));ctx.save();ctx.scale(zoom,zoom);ctx.translate(-cam.x,-cam.y);let water=ctx.createLinearGradient(0,0,W,H);water.addColorStop(0,chapter===1?'#153b48':'#12404a');water.addColorStop(.5,'#0b2939');water.addColorStop(1,'#061522');ctx.fillStyle=water;ctx.fillRect(-1000,-1000,W+2000,H+2000);
// Slow water ripples, drifting silt and soft light shafts.
ctx.save();ctx.globalAlpha=.08;ctx.strokeStyle='#8bd4d1';ctx.lineWidth=1;for(let row=0;row<32;row++){ctx.beginPath();for(let x=0;x<=W;x+=25){const y=row*65+Math.sin(x*.009+time*.35+row)*12;x?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.stroke()}ctx.restore();for(const b of bubbles){ctx.fillStyle='#b1d9d522';ctx.beginPath();ctx.arc(b.x,(b.y-time*b.s%H+H)%H,b.r,0,Math.PI*2);ctx.fill()}
ctx.save();ctx.globalAlpha=.035;ctx.fillStyle='#b5e1da';for(let i=0;i<5;i++)path([[i*400-200,0],[i*400-80,0],[i*400+700,H],[i*400+400,H]],'#b5e1da');ctx.restore();
if(chapter===1){drawHarbor();ctx.save();ctx.translate(gate.x,gate.y);ctx.strokeStyle=got===3?'#a5e4cc':'#967e56';ctx.lineWidth=8;ctx.setLineDash([10,12]);ctx.beginPath();ctx.moveTo(-80,-70);ctx.lineTo(80,25);ctx.stroke();ctx.setLineDash([]);if(got<3){ctx.lineWidth=5;for(let x=-60;x<=60;x+=30){ctx.beginPath();ctx.moveTo(x,-70);ctx.lineTo(x,25);ctx.stroke()}}ctx.fillStyle=got===3?'#a5e4cc':'#c7b48b';ctx.font='12px sans-serif';ctx.textAlign='center';ctx.fillText(got===3?'바다 출구 · OPEN':'마리나 출구',0,-90);ctx.restore();for(let keyIndex=0;keyIndex<keys.length;keyIndex++){const k=keys[keyIndex];if(k.taken)continue;ctx.save();ctx.globalAlpha=keyIndex===got?1:.35;ctx.translate(k.x,k.y);const glow=ctx.createRadialGradient(0,0,3,0,0,65);glow.addColorStop(0,'#dfc68435');glow.addColorStop(1,'#dfc68400');ctx.fillStyle=glow;ctx.fillRect(-65,-65,130,130);ctx.rotate(Math.sin(time*2)*.12);ctx.strokeStyle='#ebd39b';ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,-9,9,0,Math.PI*2);ctx.moveTo(0,0);ctx.lineTo(0,22);ctx.lineTo(10,22);ctx.moveTo(0,13);ctx.lineTo(8,13);ctx.stroke();ctx.globalAlpha=1;label(keyIndex===got?'확보 '+Math.floor(keyHold/2.2*100)+'%':'먼저 '+(keyIndex)+'번 열쇠',0,-42,19,keyIndex===got?'#f5dc9a':'#9aa99e');if(keyIndex===got&&keyHold>0){ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,0,48,-Math.PI/2,-Math.PI/2+Math.PI*2*keyHold/2.2);ctx.stroke();}ctx.restore()}}
for(const r of rocks){ctx.save();ctx.translate(r.x,r.y);ctx.shadowColor='#0009';ctx.shadowBlur=20;ctx.shadowOffsetY=12;const grad=ctx.createLinearGradient(-r.r,-r.r,r.r,r.r);grad.addColorStop(0,'#4a6266');grad.addColorStop(.4,'#283f49');grad.addColorStop(1,'#142a36');const points=Array.from({length:9},(_,i)=>{let a=i/9*Math.PI*2,s=r.r*(.88+Math.sin(i*7+r.x)*.12);return[Math.cos(a)*s,Math.sin(a)*s]});path(points,grad,'#69808355');ctx.shadowBlur=0;ctx.shadowOffsetY=0;path([[-r.r*.5,-r.r*.5],[r.r*.2,-r.r*.75],[r.r*.6,0],[-r.r*.1,r.r*.25]],'#526b6e33');ctx.strokeStyle='#6d8d8544';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,r.r+8,time*.04,time*.04+Math.PI*1.3);ctx.stroke();ctx.restore()}
if(chapter===1){drawHazards();for(const p of people)drawPerson(p);for(const p of throwers)drawPerson(p,true);drawProjectiles();}
for(const f of fish)if(f.alive)fishDraw(f);if(dash>0){ctx.save();ctx.translate(player.x,player.y);ctx.rotate(player.a);ctx.strokeStyle='#abe8e577';ctx.lineWidth=2;for(const y of [-25,25]){ctx.beginPath();ctx.moveTo(-30,y);ctx.lineTo(-125,y*1.5);ctx.stroke()}ctx.restore()}ctx.globalAlpha=invuln>0?(Math.sin(time*20)>0?.4:1):1;shark(player.x,player.y,player.a,1.1);ctx.globalAlpha=1;
for(const p of particles){ctx.globalAlpha=Math.min(1,p.life);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,2,0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1;if(chapter===1)drawBridges();ctx.restore();
// Direction hints keep objectives discoverable while the camera follows the shark.
if(state==='play'){const targets=chapter===1?(got===3?[{...gate,gate:true}]:keys.slice(got,got+1)):fish.filter(f=>f.alive).sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y)).slice(0,1);for(const t of targets){let sx=(t.x-cam.x)*zoom,sy=(t.y-cam.y)*zoom;if(sx>35&&sx<vw-35&&sy>135&&sy<vh-165)continue;const a=Math.atan2(sy-vh/2,sx-vw/2),pad=30,rx=Math.min((vw/2-pad)/Math.max(.01,Math.abs(Math.cos(a))),(vh/2-145)/Math.max(.01,Math.abs(Math.sin(a)))),px=vw/2+Math.cos(a)*Math.max(20,rx),py=vh/2+Math.sin(a)*Math.max(20,rx);ctx.save();ctx.translate(px,py);ctx.rotate(a);path([[9,0],[-5,-5],[-5,5]],chapter===1?'#e4ca90':'#9cdbcd');ctx.restore();ctx.font='9px sans-serif';ctx.fillStyle='#a8c7cb';ctx.textAlign='center';ctx.fillText(t.gate?'수문':chapter===1?'열쇠':'사냥',px,py+19)}}
const vignette=ctx.createRadialGradient(vw/2,vh/2,Math.min(vw,vh)*.2,vw/2,vh/2,Math.max(vw,vh)*.75);vignette.addColorStop(0,'#0000');vignette.addColorStop(1,'#010c1477');ctx.fillStyle=vignette;ctx.fillRect(0,0,vw,vh);if(invuln>.6){ctx.fillStyle=`rgba(196,71,49,${(invuln-.6)*.12})`;ctx.fillRect(0,0,vw,vh)}if(state==='play')drawMinimap();}
function loop(now){if(runToken&&finishMs===null&&['play','modal'].includes(state))$('race-timer').textContent=formatTime(performance.now()-runStart);const dt=Math.min(.04,(now-last)/1000||.016);last=now;update(dt);draw();requestAnimationFrame(loop)}requestAnimationFrame(loop);

function strokeRoute(width,color){ctx.beginPath();ROUTE.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=width;ctx.strokeStyle=color;ctx.stroke();}
function label(text,x,y,size=21,color='#b6c1b0'){ctx.fillStyle=color;ctx.textAlign='center';ctx.font=`${size}px sans-serif`;ctx.fillText(text,x,y)}
function drawHarbor(){
 // Two curved promenades flank the actual navigable water corridor.
 ctx.fillStyle='#31413c';ctx.fillRect(0,0,W,H);
 ctx.fillStyle='#3d4d43';ctx.beginPath();ctx.ellipse(2470,1540,740,650,-.2,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle='#6e7568';ctx.lineWidth=48;ctx.beginPath();ctx.ellipse(2450,1520,620,540,-.2,0,Math.PI*2);ctx.stroke();
 ctx.strokeStyle='#7b7f70';ctx.lineWidth=24;for(const angle of [-.8,.4,1.8,2.7]){ctx.beginPath();ctx.moveTo(2450,1520);ctx.lineTo(2450+Math.cos(angle)*730,1520+Math.sin(angle)*640);ctx.stroke();}
 // City street, terminal apron and the opera house remain on solid ground.
 ctx.fillStyle='#313d40';ctx.fillRect(0,30,W,200);ctx.strokeStyle='#9b9b8044';ctx.setLineDash([35,25]);ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,130);ctx.lineTo(W,130);ctx.stroke();ctx.setLineDash([]);
 ctx.fillStyle='#657278';ctx.fillRect(3820,460,285,1680);for(let y=490;y<2110;y+=70){ctx.fillStyle='#c2c7b32a';ctx.fillRect(3840,y,240,2);ctx.fillStyle='#3e535e';ctx.fillRect(3890,y+12,42,24);}
 ctx.fillStyle='#4d6069';ctx.fillRect(3860,400,190,570);ctx.fillStyle='#9ba8aa';ctx.fillRect(3860,400,190,16);
 ctx.save();ctx.translate(1770,1850);ctx.rotate(-.18);path([[-260,-100],[220,-150],[320,30],[-190,130]],'#80949a','#a6b7b4');path([[-230,-80],[200,-125],[290,20],[-170,105]],'#31515e');for(let x=-170;x<210;x+=38){ctx.strokeStyle='#8db1b066';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,-90);ctx.lineTo(x+70,80);ctx.stroke();}ctx.restore();
 strokeRoute(CHANNEL_RADIUS*2+158,'#808174');strokeRoute(CHANNEL_RADIUS*2+46,'#b4b3a0');strokeRoute(CHANNEL_RADIUS*2+17,'#2d4148');
 const g=ctx.createLinearGradient(0,0,W,H);g.addColorStop(0,'#215662');g.addColorStop(.5,'#143f4b');g.addColorStop(1,'#0b2c3d');strokeRoute(CHANNEL_RADIUS*2,g);
 ctx.fillStyle=g;ctx.fillRect(0,1130,650,H-1130);ctx.fillRect(0,2570,W,H-2570);ctx.fillRect(0,2010,1330,H-2010);
 // Match sea edges in rendering exactly to isWater's union of shapes.
 ctx.strokeStyle='#a6b4a16b';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(650,1690);ctx.lineTo(650,2010);ctx.lineTo(1330,2010);ctx.lineTo(1330,2570);ctx.stroke();
 ctx.save();ctx.globalAlpha=.12;ctx.strokeStyle='#8dc8c8';ctx.lineWidth=1;for(let row=0;row<42;row++){let y=row*75+Math.sin(time*.4+row)*7;ctx.beginPath();for(let x=0;x<W;x+=60){const yy=y+Math.sin(x*.012+time*.3)*9;if(isWater(x,yy,0,1)){ctx.lineTo(x,yy)}else{ctx.moveTo(x+60,yy)}}ctx.stroke();}ctx.restore();
 // Trees and benches follow the canal banks. All bank furniture is decorative.
 for(let i=0;i<ROUTE.length-1;i++)for(const side of [-1,1])for(let j=0;j<3;j++){
  const p=routePoint(i,.14+j*.28,side*(CHANNEL_RADIUS+122));
  if(p.x<60||p.x>W-60||p.y<260||p.y>2510)continue;
  ctx.fillStyle='#172d2b88';ctx.beginPath();ctx.ellipse(p.x+9,p.y+10,28,19,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#203e35';ctx.beginPath();ctx.arc(p.x,p.y,25,0,Math.PI*2);ctx.fill();ctx.fillStyle='#45604a';ctx.beginPath();ctx.arc(p.x-5,p.y-5,18,0,Math.PI*2);ctx.fill();
  const b=routePoint(i,.25+j*.25,side*(CHANNEL_RADIUS+53));ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.a);ctx.fillStyle='#43433a';ctx.fillRect(-20,-6,40,12);ctx.fillStyle='#9b9681';ctx.fillRect(-20,-8,40,4);ctx.restore();
 }
 label('부산역 · BUSAN STATION',2800,300,24);label('북항 친수공원',2490,1390,34,'#b8c0a6');label('NORTH PORT WATERFRONT PARK',2490,1435,16,'#b8c0a677');label('부산 오페라하우스',1770,2050,22);ctx.save();ctx.translate(4000,1450);ctx.rotate(Math.PI/2);label('부산항 국제여객터미널',0,0,24);ctx.restore();label('북항 마리나',970,2170,25);label('부산항 · OPEN SEA',1750,2910,31,'#78a3b3');
 // Moorings and boats inside the marina basin.
 for(let j=0;j<3;j++){const yy=2200+j*100;ctx.fillStyle='#7a8279';ctx.fillRect(700,yy,440,14);for(let i=0;i<5;i++){ctx.fillRect(750+i*75,yy,6,50);ctx.fillStyle='#b0bbb5';ctx.beginPath();ctx.ellipse(773+i*75,yy+36,10,27,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#3a5a66';ctx.fillRect(768+i*75,yy+21,10,23);ctx.fillStyle='#7a8279';}}
}
function drawPerson(p,isThrower=false){
 if(p.x<cam.x-80||p.x>cam.x+vw/.55+80||p.y<cam.y-80||p.y>cam.y+vh/.55+80)return;
 ctx.save();ctx.translate(p.x,p.y);const facing=isThrower?Math.atan2(player.y-p.y,player.x-p.x):p.a;ctx.rotate(facing);ctx.scale(1.5,1.5);
 ctx.fillStyle='#071a2388';ctx.beginPath();ctx.ellipse(5,4,18,13,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#19232b';ctx.lineWidth=6;ctx.lineCap='round';const walk=isThrower?0:Math.sin(time*4+p.phase)*3;
 ctx.beginPath();ctx.moveTo(-5,-5);ctx.lineTo(-14,-7-walk);ctx.moveTo(-5,5);ctx.lineTo(-14,7+walk);ctx.stroke();
 ctx.strokeStyle=p.color;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(isThrower&&p.warning>0?17:6,-(isThrower&&p.warning>0?12:13));ctx.moveTo(0,8);ctx.lineTo(8,12);ctx.stroke();ctx.fillStyle=p.color;ctx.beginPath();ctx.ellipse(0,0,8,11,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#c9b49c';ctx.beginPath();ctx.arc(3,0,6,0,Math.PI*2);ctx.fill();ctx.fillStyle=isThrower?'#49483b':'#3c3934';ctx.beginPath();ctx.arc(1,0,5,Math.PI*.45,Math.PI*1.55);ctx.fill();ctx.restore();
 if(isThrower){ctx.save();ctx.translate(p.x,p.y);ctx.strokeStyle=p.warning>0?'#f1b486':'#deaa6b99';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,30+Math.sin(time*3)*2,0,Math.PI*2);ctx.stroke();label(p.name,0,-45,19,'#f0c49c');if(p.warning>0)label('투척 준비!',0,-70,18,'#ffd0a3');ctx.restore();}
}
function targetRing(x,y,progress){ctx.save();ctx.translate(x,y);ctx.fillStyle='#e0845130';ctx.strokeStyle='#ffc192bb';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,70,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.strokeStyle='#f8c18e';ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,70,-Math.PI/2,-Math.PI/2+progress*Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(-12,0);ctx.lineTo(12,0);ctx.moveTo(0,-12);ctx.lineTo(0,12);ctx.stroke();ctx.restore();}
function drawProjectiles(){
 for(const n of throwers)if(n.warning>0)for(const target of n.targets||[])targetRing(target.x,target.y,1-n.warning/n.warningTotal);
 for(const p of projectiles){if(p.age<p.flight){targetRing(p.tx,p.ty,p.age/p.flight);const t=p.age/p.flight,lift=Math.sin(t*Math.PI)*155;ctx.save();ctx.translate(p.x,p.y);ctx.fillStyle='#06172288';ctx.beginPath();ctx.ellipse(0,0,14,7,0,0,Math.PI*2);ctx.fill();ctx.translate(0,-lift);ctx.rotate(p.age*9);if(p.kind==='chicken'){ctx.strokeStyle='#d9c6a5';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-10,0);ctx.lineTo(11,0);ctx.stroke();ctx.fillStyle='#cb935b';ctx.beginPath();ctx.ellipse(8,0,13,9,-.3,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f3ddaf';ctx.beginPath();ctx.arc(-12,-3,4,0,Math.PI*2);ctx.arc(-12,3,4,0,Math.PI*2);ctx.fill();}else{ctx.fillStyle='#a4b5b6';ctx.fillRect(-8,-12,16,24);ctx.fillStyle='#9e6650';ctx.fillRect(-8,-5,16,10);ctx.fillStyle='#d5dddd';ctx.beginPath();ctx.ellipse(0,-12,8,3,0,0,Math.PI*2);ctx.fill();}ctx.restore();}else{ctx.strokeStyle=`rgba(184,222,221,${Math.max(0,1-(p.age-p.flight)/.6)})`;ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.tx,p.ty,25+(p.age-p.flight)*90,0,Math.PI*2);ctx.stroke();}}
}
function drawBridges(){for(const b of BRIDGES){const p=routePoint(b.i,b.t);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.a+Math.PI/2);ctx.shadowColor='#07192466';ctx.shadowBlur=12;ctx.shadowOffsetY=12;ctx.fillStyle='#66716d';ctx.fillRect(-CHANNEL_RADIUS-65,-b.w/2,CHANNEL_RADIUS*2+130,b.w);ctx.shadowBlur=0;ctx.shadowOffsetY=0;ctx.strokeStyle='#b5b8a4';ctx.lineWidth=4;for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(-CHANNEL_RADIUS-60,side*b.w/2);ctx.lineTo(CHANNEL_RADIUS+60,side*b.w/2);ctx.stroke();}ctx.strokeStyle='#d9dacb55';ctx.lineWidth=1;for(let x=-CHANNEL_RADIUS-50;x<CHANNEL_RADIUS+50;x+=22){ctx.beginPath();ctx.moveTo(x,-b.w/2);ctx.lineTo(x,b.w/2);ctx.stroke();}ctx.restore();label(b.name,p.x,p.y-52,19,'#dae0d0');}}
function drawMinimap(){const mw=vw<600?112:160,mh=mw*H/W,x=vw-mw-18,y=136,scale=mw/W;ctx.save();ctx.translate(x,y);ctx.fillStyle='#061923dc';ctx.fillRect(-8,-8,mw+16,mh+35);ctx.strokeStyle='#7b9a9855';ctx.lineWidth=1;ctx.strokeRect(-8,-8,mw+16,mh+35);ctx.save();ctx.scale(scale,scale);if(chapter===1){ctx.fillStyle='#3a4d41';ctx.fillRect(0,0,W,H);strokeRoute(CHANNEL_RADIUS*2,'#557e84');ctx.fillStyle='#284d61';ctx.fillRect(0,2570,W,H-2570);ctx.fillRect(0,1130,650,H-1130);ctx.fillRect(0,2010,1330,H-2010);for(const k of keys)if(!k.taken){ctx.fillStyle='#f5d797';ctx.beginPath();ctx.arc(k.x,k.y,65,0,Math.PI*2);ctx.fill();}for(const p of throwers){ctx.fillStyle='#e79571';ctx.beginPath();ctx.arc(p.x,p.y,60,0,Math.PI*2);ctx.fill();}ctx.fillStyle='#afe7cf';ctx.beginPath();ctx.arc(gate.x,gate.y,65,0,Math.PI*2);ctx.fill();}else{ctx.fillStyle='#1c4355';ctx.fillRect(0,0,W,H);for(const f of fish)if(f.alive){ctx.fillStyle='#abc1b8';ctx.fillRect(f.x-25,f.y-25,50,50);}}if(chapter===1){for(const n of NETS){const p=netState(n,hazardClock);ctx.fillStyle=p.active?'#e4a173':'#a2d7b8';ctx.fillRect(p.x-45,p.y-45,90,90);}for(const p of patrols(hazardClock)){ctx.fillStyle='#e5bd92';ctx.beginPath();ctx.arc(p.x,p.y,65,0,Math.PI*2);ctx.fill();}}ctx.translate(player.x,player.y);ctx.rotate(player.a);path([[100,0],[-70,-60],[-40,0],[-70,60]],'#fff7e5');ctx.restore();ctx.fillStyle='#a5babb';ctx.font='8px sans-serif';ctx.textAlign='left';ctx.fillText(chapter===1?'● 투척자 · ■ 그물 · ◆ 순찰':'OPEN WATER',0,mh+17);ctx.restore();}
function drawHazards(){
 for(const net of NETS){const n=netState(net,hazardClock);ctx.save();ctx.translate(n.x,n.y);ctx.rotate(n.a+Math.PI/2);ctx.strokeStyle=n.active?'#d39972':'#70bfaa';ctx.lineWidth=7;ctx.setLineDash(n.active?[8,5]:[3,13]);ctx.beginPath();if(n.active){ctx.moveTo(-CHANNEL_RADIUS,0);ctx.lineTo(n.gap-n.gapWidth/2,0);ctx.moveTo(n.gap+n.gapWidth/2,0);ctx.lineTo(CHANNEL_RADIUS,0);}else{ctx.moveTo(-CHANNEL_RADIUS,0);ctx.lineTo(CHANNEL_RADIUS,0);}ctx.stroke();ctx.setLineDash([]);if(n.active){ctx.strokeStyle='#c6a38266';ctx.lineWidth=1;for(let x=-CHANNEL_RADIUS;x<CHANNEL_RADIUS;x+=16){if(Math.abs(x-n.gap)<n.gapWidth/2)continue;ctx.beginPath();ctx.moveTo(x,-11);ctx.lineTo(x+12,11);ctx.stroke();}ctx.strokeStyle='#a8e3c7';ctx.lineWidth=3;ctx.strokeRect(n.gap-n.gapWidth/2,-12,n.gapWidth,24);}for(const x of [-CHANNEL_RADIUS,CHANNEL_RADIUS]){ctx.fillStyle='#e5be80';ctx.beginPath();ctx.arc(x,0,10,0,Math.PI*2);ctx.fill();}ctx.restore();label(n.active?`차단 그물 · ${n.remaining}초 후 개방`:`통과 가능 · ${n.remaining}초`,n.x,n.y-65,21,n.active?'#f0b78e':'#a7e1c5');}
 for(const p of patrols(hazardClock)){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.a);ctx.fillStyle='#9baaad';ctx.shadowColor='#0008';ctx.shadowBlur=15;path([[80,0],[40,-30],[-65,-28],[-75,0],[-65,28],[40,30]],'#9aa9ac','#e0dfcb');ctx.shadowBlur=0;ctx.fillStyle='#274a5c';ctx.fillRect(-30,-18,55,36);ctx.fillStyle='#be765d';ctx.fillRect(-15,-17,8,34);ctx.fillStyle=Math.sin(hazardClock*7)>0?'#e5a478':'#779eaf';ctx.fillRect(5,-8,11,16);ctx.strokeStyle='#cbe8e43a';ctx.lineWidth=3;for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(-70,side*30);ctx.lineTo(-115,side*48);ctx.stroke();}ctx.restore();label('항만 순찰선',p.x,p.y-55,19,'#d2c4a4');}
}
function goHome(){runGeneration++;boardGeneration++;runToken=null;state='title';resetInput();$('modal').hidden=true;$('results').hidden=true;$('hud').hidden=true;$('controls').hidden=true;$('menu').hidden=false;$('best').textContent=best?`이 기기의 최단 기록 ${formatTime(best)}`:'';}
function prepareResults(isRace){state=isRace?'result':'ranking';resetInput();$('modal').hidden=true;$('menu').hidden=true;$('controls').hidden=true;$('hud').hidden=true;$('results').hidden=false;$('result-kicker').textContent=isRace?'CHAPTER 01 COMPLETE':'NORTH HARBOR / TIME ATTACK';$('result-title').textContent=isRace?'북항 탈출 성공':'가장 빠른 탈출';$('finish-time').hidden=!isRace;$('record-form').hidden=!isRace;$('finish-note').textContent=isRace?'탈출 기록을 확정하고 있습니다…':'빠른 기록부터 순위에 표시됩니다.';$('record-status').textContent='';$('retry-record').hidden=true;$('save-record').disabled=true;try{$('nickname').value=localStorage.getItem('bukang-nickname')||'';}catch{}loadRanking();}
function finishEscape(){finishMs=Math.max(0,performance.now()-runStart);prepareResults(true);$('finish-time').textContent=formatTime(finishMs);confirmFinish();}
async function confirmFinish(){const token=runToken,generation=runGeneration;$('retry-record').hidden=true;$('finish-note').textContent='탈출 기록을 확정하고 있습니다…';try{const result=await records.finish(token);if(generation!==runGeneration||token!==runToken)return;finishMs=result.duration_ms;$('finish-time').textContent=formatTime(finishMs);$('race-timer').textContent=formatTime(finishMs);$('finish-note').textContent='탈출 완료! 닉네임을 입력해 순위에 이름을 남기세요.';$('save-record').disabled=false;if(!best||finishMs<best){best=finishMs;try{localStorage.setItem('bukang-best-time-v1',String(best))}catch{}}}catch(error){if(generation!==runGeneration)return;const expired=/RUN_EXPIRED|RUN_TOO_SHORT|RUN_NOT_FOUND/.test(error.message);$('finish-note').textContent=expired?'이번 도전의 기록을 확인할 수 없습니다. 새 도전으로 다시 시작해 주세요.':'기록 연결이 잠시 끊겼습니다. 다시 시도하면 닉네임을 등록할 수 있습니다.';$('retry-record').hidden=expired;}}
async function loadRanking(){const generation=++boardGeneration;$('ranking-empty').textContent='순위를 불러오는 중…';$('refresh-ranking').disabled=true;try{const entries=await records.list();if(generation!==boardGeneration||$('results').hidden)return;const body=$('ranking-body');body.replaceChildren();for(const entry of entries){const row=document.createElement('tr');if(registeredName&&entry.nickname.toLowerCase()===registeredName.toLowerCase())row.className='my-record';for(const value of [entry.rank,entry.nickname,formatTime(entry.duration_ms)]){const cell=document.createElement('td');cell.textContent=String(value);row.appendChild(cell);}body.appendChild(row);}$('ranking-empty').textContent=entries.length?'':'아직 등록된 기록이 없습니다. 첫 탈출 기록을 남겨보세요.';}catch(error){if(generation===boardGeneration)$('ranking-empty').textContent='순위를 불러오지 못했습니다. 새로고침 버튼으로 다시 시도해 주세요.';}finally{if(generation===boardGeneration)$('refresh-ranking').disabled=false;}}
$('record-form').addEventListener('submit',async event=>{event.preventDefault();if(registering||registered||$('save-record').disabled)return;const name=$('nickname').value.trim();if(!validNickname(name)){$('record-status').textContent='한글·영문·숫자·밑줄을 사용해 1~12자로 입력해 주세요.';$('nickname').focus();return;}registering=true;const token=runToken,generation=runGeneration;$('save-record').disabled=true;$('record-status').textContent='기록을 등록하고 있습니다…';try{const result=await records.register(token,name);if(generation!==runGeneration)return;registered=true;registeredName=result.nickname;$('record-form').hidden=true;$('record-status').textContent=result.top20===false?`이번 탈출 ${result.rank}위 · 상위 20위 밖 기록은 저장하지 않습니다.`:`등록 완료 · ${result.nickname}님의 최고기록 순위 ${result.rank}위`;$('finish-note').textContent=`이번 탈출 ${formatTime(result.duration_ms)} · 개인 최고 ${formatTime(result.personal_best_ms)}`;try{localStorage.setItem('bukang-nickname',result.nickname)}catch{}await loadRanking();}catch(error){if(generation===runGeneration)$('record-status').textContent='기록을 저장하지 못했습니다. 닉네임은 유지됩니다. 다시 등록해 주세요.';}finally{if(generation===runGeneration){registering=false;$('save-record').disabled=registered;}}});
$('open-ranking').onclick=()=>prepareResults(false);$('refresh-ranking').onclick=loadRanking;$('retry-record').onclick=confirmFinish;$('race-again').onclick=start;$('result-home').onclick=goHome;
