import {ROUTE,SHORTCUT,CHANNEL_RADIUS,SHORTCUT_RADIUS,SEA,WORLD} from './harbor.js?v=waterfix3';
// Paint every bank before any water: banks at a branch must never cover
// navigable water belonging to another connected channel.
export function drawWaterways(ctx,color,{banks=true}={}){
 const channels=[{points:ROUTE,radius:CHANNEL_RADIUS},{points:SHORTCUT,radius:SHORTCUT_RADIUS}];
 function stroke(channel,width,paint){ctx.beginPath();channel.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=width;ctx.strokeStyle=paint;ctx.stroke();}
 if(banks)for(const channel of channels){stroke(channel,channel.radius*2+158,'#808174');stroke(channel,channel.radius*2+46,'#b4b3a0');stroke(channel,channel.radius*2+17,'#2d4148');}
 for(const channel of channels)stroke(channel,channel.radius*2,color);
 ctx.fillStyle=color;ctx.fillRect(0,SEA.y,SEA.x,WORLD.height-SEA.y);
}
