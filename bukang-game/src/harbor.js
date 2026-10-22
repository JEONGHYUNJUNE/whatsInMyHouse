// Layout interpreted from BISCO's North Port Waterfront Park guide.
// World units and waterway widths are adapted for mobile play, not survey data.
export const WORLD={width:4200,height:3100};
export const ROUTE=[{x:480,y:1400},{x:800,y:1050},{x:1300,y:830},{x:1920,y:690},{x:2500,y:510},{x:2920,y:500},{x:3310,y:720},{x:3500,y:1120},{x:3520,y:1660},{x:3380,y:2030},{x:3040,y:2290},{x:2570,y:2460},{x:2170,y:2640}];
export const CHANNEL_RADIUS=205;
export const SPAWN={x:3485,y:1810,a:-Math.PI/2};
export const KEY_POINTS=[{x:3500,y:1190},{x:2560,y:510},{x:1260,y:850}];
export const EXIT={x:500,y:1390};
export const BRIDGES=[{i:2,t:.15,name:'제2보도교',w:44},{i:4,t:.6,name:'제3보도교',w:44},{i:7,t:.7,name:'제4보도교',w:46},{i:9,t:.6,name:'제5보도교',w:46},{i:0,t:.44,name:'마리나브릿지',w:76},{i:3,t:.55,name:'오페라브릿지',w:70}];
export function routePoint(i,t,offset=0){const a=ROUTE[i],b=ROUTE[i+1],angle=Math.atan2(b.y-a.y,b.x-a.x);return{x:a.x+(b.x-a.x)*t-Math.sin(angle)*offset,y:a.y+(b.y-a.y)*t+Math.cos(angle)*offset,a:angle}}
export function nearestWater(x,y){let best={distance:Infinity};for(let i=0;i<ROUTE.length-1;i++){const a=ROUTE[i],b=ROUTE[i+1],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy))),px=a.x+t*dx,py=a.y+t*dy,d=Math.hypot(x-px,y-py);if(d<best.distance)best={distance:d,x:px,y:py,i,t}}return best}
export function isWater(x,y,radius=28,chapter=1){if(x<radius+10||x>WORLD.width-radius-10||y<radius+10||y>WORLD.height-radius-10)return false;if(chapter===2)return true;return (x<650-radius&&y>1130+radius)||(y>2570+radius)||(x<1330-radius&&y>2010+radius)||nearestWater(x,y).distance<CHANNEL_RADIUS-radius}
export function makePeople(){const people=[];for(let i=0;i<ROUTE.length-1;i++)for(const side of [-1,1])for(let j=0;j<2;j++){const p=routePoint(i,.2+j*.44,side*(CHANNEL_RADIUS+38));people.push({...p,baseX:p.x,baseY:p.y,phase:i*1.3+j,side,color:['#b3aa8d','#798d9b','#9c7f76','#79958a'][(i+j)%4],role:'walker'})}const a=routePoint(7,.55,-(CHANNEL_RADIUS+24)),b=routePoint(2,.55,-(CHANNEL_RADIUS+24));return {people,throwers:[{...a,id:'chicken',name:'닭고기 투척자',color:'#cc9b70',timer:1.7,warning:0,target:null},{...b,id:'can',name:'캔 투척자',color:'#92a9b6',timer:2.4,warning:0,target:null}]}}
