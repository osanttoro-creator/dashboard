'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.OAZE_PLAYWRIGHT_MODULE||'C:/Users/santtoro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browserPath=process.env.OAZE_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const base=process.env.OAZE_BASE_URL||'http://127.0.0.1:4173';
(async()=>{
 const browser=await chromium.launch({headless:true,...(fs.existsSync(browserPath)?{executablePath:browserPath}:{})});
 try{
  for(const width of [390,1440]){
   const page=await browser.newPage({viewport:{width,height:844},reducedMotion:'reduce'});
   await page.goto(base+'/app?demo=1#coco');
   await page.locator('[data-topic="analysis"]').click();
   const insight=await page.locator('.v3-coco-insight').innerText();
   assert.match(insight,/Moradia soma R\$ 1\.850,00, 38% das saídas do mês\./);
   assert.match(insight,/Previsto para sair: R\$ 119,90/);
   assert.match(insight,/Valores previstos não são projeções/);
   await page.close();
  }
  console.log('Coco: leitura calculada confere com o total do mês em desktop e celular.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
