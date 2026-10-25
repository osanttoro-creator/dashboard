'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.OAZE_PLAYWRIGHT_MODULE ||
  'C:/Users/santtoro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '../..');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, data) => {
    res.writeHead(error ? 404 : 200, { 'Content-Type': path.extname(file) === '.js' ? 'text/javascript' : path.extname(file) === '.css' ? 'text/css' : 'text/html' });
    res.end(error ? 'not found' : data);
  });
});
(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const browser = await chromium.launch({ ...(fs.existsSync(edge) ? { executablePath: edge } : {}), headless: true });
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      await page.goto(`http://127.0.0.1:${server.address().port}/tools/fixtures/app-demo.html?demo=1#home`);
      await page.locator('[data-action="new"]:visible').first().click();
      await page.locator('[data-action="calculator"]').click();
      const expression = page.locator('.v3-calculator input');
      assert.equal(await expression.getAttribute('readonly'), '');
      assert.equal(await expression.getAttribute('inputmode'), 'none');
      assert.notEqual(await expression.evaluate((el) => document.activeElement === el), true);
      for (const key of ['1','2','0','+','3','5',',','5','0']) await page.locator(`[data-calc-key="${key}"]`).click();
      assert.equal(await expression.inputValue(), '120+35,50');
      await page.locator('[data-action="calc-run"]').click();
      assert.equal(await page.locator('[data-calc-result]').textContent(), '155,50');
      await page.close();
    }
    console.log('Calculadora: teclado próprio funciona sem ativar o campo em 390 e 1440 px.');
  } finally { await browser.close(); server.close(); }
})().catch((error) => { console.error(error); server.close(); process.exitCode = 1; });
