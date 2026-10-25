'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.OAZE_PLAYWRIGHT_MODULE||'C:/Users/santtoro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browserPath=process.env.OAZE_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const base=process.env.OAZE_BASE_URL||'http://127.0.0.1:4173';
(async()=>{
  const browser=await chromium.launch({headless:true,...(fs.existsSync(browserPath)?{executablePath:browserPath}:{})});
  try{
    for(const width of [1440,390]){
      const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(base+'/tools/fixtures/app-demo.html?demo=1#wallet');
      await page.locator('.v3-wallet-item.esta-no-centro').waitFor();
      const selected=page.locator('.v3-wallet-item.esta-no-centro');
      assert.equal(await selected.locator('.v3-card-oaze').count(),1);
      assert.equal(await selected.locator('.v3-card-footer').innerText().then(x=>/visa|mastercard|elo/i.test(x)),false);
      const hidden=page.locator('.v3-wallet-item:not(.esta-no-centro) .v3-card-select');
      for(let i=0;i<await hidden.count();i++)assert.equal(await hidden.nth(i).getAttribute('tabindex'),'-1');
      if(process.env.OAZE_SCREENSHOT_DIR){fs.mkdirSync(process.env.OAZE_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.OAZE_SCREENSHOT_DIR,`wallet-${width}.png`)});}
      await page.locator('[data-action="edit-wallet-item"]').click();
      const form=page.locator('#v3-form-account');await form.waitFor();
      assert.equal(await form.locator('.v3-account-value-row [name="amount"]').count(),1);
      assert.equal(await form.locator('.v3-account-value-row [name="moeda"]').count(),1);
      assert.equal(await form.locator('.v3-bank-collapse').getAttribute('open'),null);
      assert.equal(await form.locator('.v3-account-more [name="last4"]').count(),1);
      assert.equal(await form.locator('[name="openedAt"]').count(),1);
      if(process.env.OAZE_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.OAZE_SCREENSHOT_DIR,`wallet-form-${width}.png`)});
      await page.locator('#v3-sheet [data-action="close"]').first().click();
      await page.locator('[data-wallet-kind="credit"]').click();
      await page.locator('[data-action="edit-wallet-item"]').click();
      await page.locator('#v3-form-account').waitFor();
      assert.equal(await page.locator('#v3-form-account .v3-account-value-row [name="amount"]').count(),1);
      assert.equal(await page.locator('#v3-form-account [data-wallet-type="card"]').count(),1);
      assert.equal(errors.length,0,errors.join('\n'));
      await page.close();
      console.log(`Carteira redesenhada ${width}px: foco, campos e crédito OK`);
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
