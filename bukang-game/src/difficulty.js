import {routePoint, CHANNEL_RADIUS} from './harbor.js?v=extended2';
export const NETS=[{i:11,t:.42,phase:0},{i:8,t:.45,phase:3.4},{i:5,t:.5,phase:6.1},{i:2,t:.5,phase:1.8}];
export function netState(net,clock){const p=routePoint(net.i,net.t),cycle=(clock+net.phase)%10;return {...p,active:cycle<7,gap:Math.sin(clock*.8+net.phase)*92,gapWidth:104,remaining:Math.ceil(cycle<7?7-cycle:10-cycle)}}
export function netCollision(x,y,clock,radius=30){for(const net of NETS){const n=netState(net,clock);if(!n.active)continue;const dx=x-n.x,dy=y-n.y,along=dx*Math.cos(n.a)+dy*Math.sin(n.a),across=-dx*Math.sin(n.a)+dy*Math.cos(n.a);if(Math.abs(along)<radius+9&&Math.abs(across)<CHANNEL_RADIUS+radius&&Math.abs(across-n.gap)>n.gapWidth/2-radius)return n;}return null;}
export function patrols(clock){return [{i:10,t:.5+Math.sin(clock*.42)*.36,phase:0},{i:6,t:.5+Math.sin(clock*.34+2)*.38,phase:2}].map(p=>({...routePoint(p.i,p.t,Math.sin(clock*.6+p.phase)*62),a:routePoint(p.i,p.t).a+(Math.cos(clock*(p.phase?.34:.42)+p.phase)<0?Math.PI:0)})).concat(shortcutPatrol(clock))}
export function alertLevel(keys){return Math.min(3,keys+1)}
export function throwPattern(n,target,velocity,level){const lead=.2+level*.12,base={x:target.x+velocity.x*lead,y:target.y+velocity.y*lead};const angle=Math.atan2(base.y-n.y,base.x-n.x),side=level>=2?[-1,1]:[0];return side.map(s=>({x:base.x-Math.sin(angle)*s*62,y:base.y+Math.cos(angle)*s*62}));}
// If a closing or moving net overlaps the shark, always allow a retreat.
export function netBlocksMovement(from,to,clock){const n=netCollision(to.x,to.y,clock);if(!n)return null;const along=p=>Math.abs((p.x-n.x)*Math.cos(n.a)+(p.y-n.y)*Math.sin(n.a));if(along(from)<39&&along(to)>along(from)+.01)return null;return n;}

export function shortcutPatrol(clock){const a={x:1800,y:4200},b={x:1008,y:2310},t=.5+Math.sin(clock*.65)*.42;return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,a:Math.atan2(b.y-a.y,b.x-a.x)+(Math.cos(clock*.65)<0?Math.PI:0)}}
