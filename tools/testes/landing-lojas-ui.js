'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.OAZE_PLAYWRIGHT_MODULE || 'C:/Users/santtoro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browserPath = process.env.OAZE_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const localFiles = process.env.OAZE_LOCAL_FILES === '1';
const base = process.env.OAZE_BASE_URL || (localFiles ? 'https://oaze.test' : 'http://127.0.0.1:4173');

(async () => {
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(browserPath) ? { executablePath: browserPath } : {}) });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      if (localFiles) await page.route('https://oaze.test/**', async route => {
        const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
        const root = path.resolve(__dirname, '../..');
        const file = path.resolve(root, '.' + pathname);
        if (!file.startsWith(root + path.sep)) return route.fulfill({ status: 403 });
        try { await route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml', '.woff2':'font/woff2' })[path.extname(file)] || 'application/octet-stream' }); }
        catch { await route.fulfill({ status: 404, body: 'Not found' }); }
      });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/index.html');
      await page.locator('#heroi-titulo').waitFor();
      assert.equal(await page.locator('h1').count(), 1, 'a página precisa de um único título principal');
      assert.equal(await page.locator('.portal').count(), 0, 'o portal antigo não deve bloquear a entrada');
      assert.equal(await page.locator('.loja-botao.is-pending').count(), 2, 'lojas sem ficha pública ficam indisponíveis');
      assert.equal(await page.locator('.lojas-opcoes a').count(), 0, 'não criar redirecionamento sem endereço oficial');
      assert.equal(await page.locator('#formContato').count(), 1, 'formulário de contato visível na landing');
      assert.equal(await page.locator('a[href="mailto:info@oaze.site"]').count(), 2, 'endereço oficial na seção e no rodapé');
      assert.equal(await page.locator('main a[href="/app/planos"]').count(), 1, 'assinar abre os planos no app');
      assert.equal(await page.locator('main a[href^="/cadastro"], main a[href^="/entrar"]').count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'sem rolagem horizontal');
      assert.equal(await page.locator('.launch-hero-visual img').evaluate(img => img.complete && img.naturalWidth > 0), true);
      assert.equal(await page.locator('.launch-assistant-art img').getAttribute('src'), '/assets/brand/oaze-mascote-app.png');
      await page.locator('img[loading="lazy"]').evaluateAll(images => images.forEach(img => { img.loading = 'eager'; }));
      await page.waitForFunction(() => Array.from(document.images).every(img => img.complete && img.naturalWidth > 0));
      if (width === 390) {
        await page.locator('.hamburguer').click();
        assert.equal(await page.locator('.hamburguer').getAttribute('aria-expanded'), 'true');
        assert.equal(await page.locator('.menu').isVisible(), true);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.hamburguer').getAttribute('aria-expanded'), 'false');
      }
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
