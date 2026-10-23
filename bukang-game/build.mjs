import {mkdir,cp,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const response=await fetch('https://tennis-chung.vercel.app/bukang/config.js');
if(!response.ok)throw Error(`Public leaderboard configuration unavailable: ${response.status}`);
const text=await response.text(),match=text.match(/export const recordsConfig=(\{.*\});/);
if(!match)throw Error('Invalid public configuration format');
const config=JSON.parse(match[1]);
assert.match(config.url,/^https:\/\/[a-z0-9-]+\.supabase\.co$/);
if(config.key.startsWith('eyJ'))assert.equal(JSON.parse(Buffer.from(config.key.split('.')[1],'base64url')).role,'anon');
else assert.ok(config.key.startsWith('sb_publishable_'));
await mkdir('dist',{recursive:true});await cp('src','dist',{recursive:true});
await writeFile('dist/config.js',`// Public client configuration only.\nexport const recordsConfig=${JSON.stringify(config)};\n`);
// Enable first-party page-view analytics only for this standalone Vercel project.
// Keep the integration at build time so source syncs cannot accidentally drop it.
const analyticsSnippet='<script>window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments);};</script><script defer src="/_vercel/insights/script.js"></script>';
for(const page of ['index.html','about.html','privacy.html']){
 let output=await readFile('dist/'+page,'utf8');
 assert.ok(output.includes('</head>'));
 output=output.replace('</head>',analyticsSnippet+'</head>');
 if(page==='privacy.html')output=output.replace('<a class="back"','<section><h2>방문 통계</h2><p>방문자 수와 페이지 조회수, 유입 경로, 국가·기기·브라우저 통계를 확인하기 위해 Vercel Web Analytics를 사용합니다. 쿠키를 사용하지 않으며 닉네임이나 게임 기록을 방문 분석에 전송하지 않습니다.</p><p><a href="https://vercel.com/docs/analytics/privacy-policy" rel="noopener noreferrer">Vercel 방문 통계 안내</a></p></section><a class="back"');
 assert.equal(output.split('/_vercel/insights/script.js').length-1,1);
 await writeFile('dist/'+page,output);
}
const html=await readFile('dist/index.html','utf8');assert.ok(html.includes('<base href="/">'));
assert.ok(!html.includes('<base href="/bukang/">'));
console.log('Standalone game built; public leaderboard and Web Analytics connected.');
