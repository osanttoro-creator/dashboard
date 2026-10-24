'use strict';

const assert = require('node:assert/strict');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(process.env.OAZE_PLAYWRIGHT_MODULE || 'C:/Users/santtoro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.OAZE_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  try {
    for (const width of [955, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 850 } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto((process.env.OAZE_BASE_URL || 'http://127.0.0.1:4173') + '/tools/fixtures/app-demo.html?demo=1#transactions');
      const controls = page.locator('.v3-trans-head .v3-filter');
      assert.deepEqual(await controls.locator('button').allTextContents(), ['Entradas', 'Saídas', 'Crédito', 'Transações', 'Filtros']);
      await controls.locator('[data-filter="Entradas"]').click();
      assert.equal(await controls.locator('[data-filter="Entradas"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('.v3-tx-grupo--expense').count(), 0);
      await controls.locator('[data-filter="Saídas"]').click();
      assert.equal(await controls.locator('[data-filter="Saídas"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('.v3-tx-grupo--income').count(), 0);
      await controls.locator('[data-filter="Saídas"]').click();
      assert.equal(await controls.locator('[data-filter="Saídas"]').getAttribute('aria-pressed'), 'false');
      await controls.locator('[data-filter="Cartões"]').click();
      assert.equal(await controls.locator('[data-filter="Cartões"]').getAttribute('aria-pressed'), 'true');
      assert.ok(await page.locator('.v3-due-invoice').count()>0);
      await controls.locator('[data-filter="Todos"]').click();
      assert.equal(await controls.locator('[data-filter="Todos"]').getAttribute('aria-pressed'), 'true');
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('Filtros rápidos: Entradas, Saídas, Crédito, Transações e Filtros funcionam em desktop e mobile.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
