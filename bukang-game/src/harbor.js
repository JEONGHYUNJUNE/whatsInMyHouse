// Layout interpreted from BISCO's North Port Waterfront Park guide.
// World units and waterway widths are adapted for mobile play, not survey data.
export const WORLD={width:8800,height:5400};
export const ROUTE=[{x:500,y:4500},{x:1800,y:4200},{x:1800,y:3400},{x:700,y:3000},{x:1008,y:2310},{x:1680,y:1733},{x:2730,y:1370},{x:4032,y:1139},{x:5250,y:842},{x:6132,y:825},{x:6951,y:1188},{x:7350,y:1848},{x:7392,y:2739},{x:7098,y:3350},{x:6384,y:3779},{x:5397,y:4059},{x:4557,y:4356}];
// A narrow, exposed shortcut bypasses the slower marina bend.
export const SHORTCUT=[ROUTE[1],ROUTE[4]];
export const SHORTCUT_RADIUS=108;
export const SEA={x:650,y:4380};
export const CHANNEL_RADIUS=205;
export const SPAWN={x:6384,y:3779,a:-.54};
export const KEY_POINTS=[{x:7350,y:2000},{x:5380,y:840},{x:2630,y:1400}];
export const EXIT={x:500,y:4500};
export const BRIDGES=[{i:6,t:.15,name:'제2보도교',w:44},{i:8,t:.6,name:'제3보도교',w:44},{i:11,t:.7,name:'제4보도교',w:46},{i:13,t:.6,name:'제5보도교',w:46},{i:4,t:.44,name:'마리나브릿지',w:76},{i:7,t:.55,name:'오페라브릿지',w:70}];
export function routePoint(i,t,offset=0){const a=ROUTE[i],b=ROUTE[i+1],angle=Math.atan2(b.y-a.y,b.x-a.x);return{x:a.x+(b.x-a.x)*t-Math.sin(angle)*offset,y:a.y+(b.y-a.y)*t+Math.cos(angle)*offset,a:angle}}
export function shortcutDistance(x,y){const [a,b]=SHORTCUT,dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy)));return Math.hypot(x-a.x-t*dx,y-a.y-t*dy)}
export function nearestWater(x,y){let best={distance:Infinity};for(let i=0;i<ROUTE.length-1;i++){const a=ROUTE[i],b=ROUTE[i+1],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy))),px=a.x+t*dx,py=a.y+t*dy,d=Math.hypot(x-px,y-py);if(d<best.distance)best={distance:d,x:px,y:py,i,t}}return best}
export function isWater(x,y,radius=28,chapter=1){if(x<radius+10||x>WORLD.width-radius-10||y<radius+10||y>WORLD.height-radius-10)return false;if(chapter===2)return true;return (x<SEA.x-radius&&y>SEA.y+radius)||shortcutDistance(x,y)<SHORTCUT_RADIUS-radius||nearestWater(x,y).distance<CHANNEL_RADIUS-radius}
export function makePeople(){const people=[];for(let i=0;i<ROUTE.length-1;i++)for(const side of [-1,1])for(let j=0;j<2;j++){const p=routePoint(i,.2+j*.44,side*(CHANNEL_RADIUS+38));people.push({...p,baseX:p.x,baseY:p.y,phase:i*1.3+j,side,color:['#b3aa8d','#798d9b','#9c7f76','#79958a'][(i+j)%4],role:'walker'})}const a=routePoint(11,.55,-(CHANNEL_RADIUS+24)),b=routePoint(6,.55,-(CHANNEL_RADIUS+24));return {people,throwers:[{...a,id:'chicken',name:'닭고기 투척자',color:'#cc9b70',timer:1.7,warning:0,target:null},{...b,id:'can',name:'캔 투척자',color:'#92a9b6',timer:2.4,warning:0,target:null}]}}
