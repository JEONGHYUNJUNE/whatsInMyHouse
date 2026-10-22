import {siteConfig} from './site-config.js';
const name=siteConfig.creator?.trim(),email=siteConfig.contactEmail?.trim();
for(const node of document.querySelectorAll('[data-site-contact]')){
 if(!name&&!email)continue;node.hidden=false;
 if(name)node.append(document.createTextNode(`제작: ${name}`));
 if(email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){if(name)node.append(document.createTextNode(' · '));const link=document.createElement('a');link.href=`mailto:${email}`;link.textContent=`문의 · 기록 삭제 요청: ${email}`;node.append(link);}
}
const ad=siteConfig.adsense;
// Remains completely hidden and makes no ad requests until both configured and approved.
if(ad?.enabled===true&&ad.approved===true&&/^ca-pub-\d{16}$/.test(ad.client||'')&&/^\d+$/.test(ad.slot||'')){
 const region=document.getElementById('site-ad');if(region){const slot=region.querySelector('ins');slot.dataset.adClient=ad.client;slot.dataset.adSlot=ad.slot;region.hidden=false;const script=document.createElement('script');script.async=true;script.crossOrigin='anonymous';script.src=`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ad.client}`;script.onload=()=>{(window.adsbygoogle=window.adsbygoogle||[]).push({});};script.onerror=()=>{region.hidden=true;};document.head.append(script);}
}
