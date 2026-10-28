'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.OAZE_PLAYWRIGHT_MODULE || 'C:/Users/santtoro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browserPath = process.env.OAZE_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const base = process.env.OAZE_BASE_URL || 'http://127.0.0.1:4173';

(async () => {
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(browserPath) ? { executablePath: browserPath } : {}) });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/index.html');
      await page.locator('#heroi-titulo').waitFor();
      assert.equal(await page.locator('h1').count(), 1, 'a página precisa de um único título principal');
      assert.equal(await page.locator('.portal').count(), 0, 'o portal antigo não deve bloquear a entrada');
      assert.equal(await page.locator('.loja-botao.is-pending').count(), 2, 'lojas sem ficha pública ficam indisponíveis');
      assert.equal(await page.locator('.lojas-opcoes a').count(), 0, 'não criar redirecionamento sem endereço oficial');
      assert.equal(await page.locator('main a[href^="/app"], main a[href^="/cadastro"], main a[href^="/entrar"]').count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'sem rolagem horizontal');
      assert.equal(await page.locator('.cena-computador img').evaluate(img => img.complete && img.naturalWidth > 0), true);
      assert.equal(errors.length, 0, errors.join('\n'));
      if (process.env.OAZE_SCREENSHOT_DIR) {
        fs.mkdirSync(process.env.OAZE_SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.OAZE_SCREENSHOT_DIR, 'landing-' + width + '.png'), fullPage: true });
      }
      await page.close();
      console.log('Landing de lojas ' + width + 'px: OK');
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
