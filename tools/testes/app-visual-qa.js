'use strict';
const os=require('node:os');
const path=require('node:path');
const {chromium}=require(process.env.OAZE_PLAYWRIGHT_MODULE||'C:/Users/santtoro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.OAZE_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  try{
    for(const [pageName,hash,width,height] of [['home','home',1440,900],['transactions','transactions',1440,900],['planning','investments/planning',1440,900],['home-tablet','home',600,700],['home-mobile','home',390,844]]){
      const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
      await page.goto(`http://127.0.0.1:4173/app?demo=1#${hash}`);
      await page.locator('#v3-view').waitFor();
      const file=path.join(os.tmpdir(),`oaze-${pageName}-qa.png`);
      await page.screenshot({path:file,fullPage:pageName==='home'||pageName==='transactions'});
      console.log(file);
      await page.close();
    }
  }finally{await browser.close();}
})().catch((error)=>{console.error(error);process.exitCode=1;});
