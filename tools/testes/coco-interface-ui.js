'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.OAZE_PLAYWRIGHT_MODULE||'C:/Users/santtoro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../..');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(err?'not found':data);});});
(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
for(const [width,height] of [[1440,900],[390,844],[360,640]]){const page=await browser.newPage({viewport:{width,height}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/preview-v3/index.html?demo=1#coco`);await page.locator('.v3-coco-tools').waitFor();
assert.equal(await page.locator('.v3-coco-tool').count(),4);assert.equal(await page.locator('.v3-sidebar').isVisible(),false);
await page.locator('[data-topic="debts"]').click();assert.match(await page.locator('[name="question"]').inputValue(),/dívidas/);
await page.locator('[name="question"]').fill('Meu rascunho');await page.locator('[data-mode="voice"]').click();await page.locator('.v3-coco-voice-stage').waitFor();await page.locator('[data-mode="text"]').first().click();assert.equal(await page.locator('[name="question"]').inputValue(),'Meu rascunho');
await page.locator('[data-topic="analysis"]').click();await page.locator('.v3-coco-analysis').waitFor();await page.locator('[data-mode="voice"]').click();
const sizes=await page.evaluate(()=>({w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight,cw:innerWidth,ch:innerHeight,tools:document.querySelector('.v3-coco-tools').getBoundingClientRect().bottom,form:document.querySelector('#v3-chat-form').getBoundingClientRect().top}));assert.ok(sizes.w<=sizes.cw,JSON.stringify(sizes));assert.ok(sizes.h<=sizes.ch,JSON.stringify(sizes));assert.ok(sizes.tools<=sizes.form,JSON.stringify(sizes));assert.deepEqual(errors,[]);
if(process.env.OAZE_SCREENSHOTS){fs.mkdirSync(process.env.OAZE_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.OAZE_SCREENSHOTS,`coco-voice-${width}.png`)});await page.locator('[data-mode="text"]').first().click();await page.screenshot({path:path.join(process.env.OAZE_SCREENSHOTS,`coco-text-${width}.png`)});}await page.close();}
console.log('Coco UI: desktop/mobile, modos, rascunho e blocos inferiores sem scroll da tela.');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
