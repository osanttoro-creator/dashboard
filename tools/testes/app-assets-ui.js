'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.OAZE_PLAYWRIGHT_MODULE ||
  'C:/Users/santtoro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const root = path.resolve(__dirname, '../..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, data) => {
    res.writeHead(error ? 404 : 200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    res.end(error ? 'not found' : data);
  });
});

(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const edge = process.env.OAZE_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const browser = await chromium.launch({ ...(fs.existsSync(edge) ? { executablePath: edge } : {}), headless: true });
  try {
    for (const width of [1440, 600, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('response', (response) => {
        if (response.status() >= 400 && new URL(response.url()).pathname.startsWith('/assets/')) {
          errors.push(`${response.status()} ${response.url()}`);
        }
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/tools/fixtures/app-demo.html?demo=1#home`);
      await page.locator('.v3-wallet').waitFor();
      assert.equal(await page.locator('.v3-logo img').count(), 1);
      assert.equal(await page.locator('.v3-home-identity .v3-top-actions').count(), 1, `ações e identificação devem dividir o cabeçalho em ${width}px`);
      const head = await page.locator('.v3-home-identity').boundingBox();
      const metrics = await page.locator('.v3-home .v3-wallet').boundingBox();
      assert.ok(head && metrics && head.y + head.height <= metrics.y + 1, `cabeçalho sobrepõe a carteira em ${width}px`);
      await page.goto(`http://127.0.0.1:${server.address().port}/tools/fixtures/app-demo.html?demo=1#transactions`);
      await page.reload();
      await page.locator('.v3-trans-head').waitFor();
      assert.deepEqual(await page.locator('.v3-filter .v3-pill-rapido').allTextContents(), ['Todos', 'Entradas', 'Saídas', 'Entre contas', 'Recorrentes', 'Crédito']);
      await page.locator('[data-filter="Cartões"]').click();
      assert.equal(await page.locator('.v3-tx-grupo--income').count(), 0);
      assert.ok(await page.locator('.v3-due-invoice').count() > 0);
      await page.locator('[data-action="new"]:visible').first().click();
      await page.locator('#v3-form-tx [name="amount"]').fill('123,45');
      await page.locator('[data-date-choice="other"]').click();
      assert.equal(await page.locator('#v3-form-tx [name="date"]').isVisible(), true);
      assert.equal(await page.locator('#v3-form-tx [name="situacao"]').inputValue(), 'pendente');
      await page.locator('[data-payment-kind="credit"]').click();
      assert.equal(await page.locator('#v3-form-tx [name="situacao"]').isVisible(), false);
      await page.locator('[data-compose-kind="Aporte"]').click();
      assert.equal(await page.locator('#v3-form-investment [name="amount"]').inputValue(), '123,45');
      await page.locator('[data-action="calculator"]').click();
      assert.equal(await page.locator('.v3-calculator input').getAttribute('inputmode'), 'none');
      assert.equal(await page.locator('.v3-calculator input').getAttribute('readonly'), '');
      for (const key of ['1','2','0','+','3','5',',','5','0']) await page.locator(`[data-calc-key="${key}"]`).click();
      await page.locator('[data-action="calc-run"]').click();
      assert.equal(await page.locator('[data-calc-result]').textContent(), '155,50');
      await page.goto(`http://127.0.0.1:${server.address().port}/tools/fixtures/app-demo.html?demo=1#investments/planning`);
      await page.reload();
      await page.locator('.v3-planning-reserve').waitFor();
      assert.equal(await page.locator('#v3-form-planning-guide').count(), 1);
      await page.locator('#v3-form-planning-guide [name="reservePercent"]').fill('10');
      await page.locator('#v3-form-planning-guide button[type="submit"]').click();
      assert.ok(await page.locator('.v3-planning-proposal-row').count() > 0);
      await page.locator('.v3-planning-proposal-row button').first().click();
      assert.ok(Number((await page.locator('#v3-form-budget [name="limit"]').inputValue()).replace(/\./g,'').replace(',','.')) > 0);
      await page.goto(`http://127.0.0.1:${server.address().port}/tools/fixtures/app-demo.html?demo=1#investments/goals`);
      await page.reload();
      await page.locator('.v3-goal').first().locator('[data-goal]').click();
      assert.equal(await page.locator('#v3-form-goal [name="annualRate"]').count(), 1);
      await page.goto(`http://127.0.0.1:${server.address().port}/tools/fixtures/app-demo.html?demo=1#categories`);
      await page.reload();
      await page.locator('[data-cat-kind="income"]').click();
      assert.equal(await page.locator('.v3-category-overview .v3-spend-ring').count(), 1);
      assert.match(await page.locator('.v3-category-overview').innerText(), /receitas recebidas/i);
      await page.goto(`http://127.0.0.1:${server.address().port}/tools/fixtures/app-demo.html?demo=1#calendar`);
      await page.reload();
      await page.locator('.v3-agenda-extra').waitFor();
      const agendaCheck = page.locator('.v3-agenda-check').first();
      assert.ok(await agendaCheck.count() > 0);
      const checked = await agendaCheck.getAttribute('aria-checked');
      await agendaCheck.click();
      assert.equal(await page.locator('.v3-agenda-check').first().getAttribute('aria-checked'), checked, 'a demonstração não grava alterações');
      await page.goto(`http://127.0.0.1:${server.address().port}/tools/fixtures/app-demo.html?demo=1#settings`);
      await page.reload();
      await page.locator('.v3-settings').waitFor();
      assert.equal(await page.getByText('Versão desta tela').count(), 0);
      assert.deepEqual(errors, [], `falha ao carregar app em ${width}px`);
      await page.close();
    }
    console.log('App: carteira, filtros, lançamentos, planejamento, metas, agenda e configurações passam em desktop, tablet e celular.');
  } finally { await browser.close(); server.close(); }
})().catch((error) => { console.error(error); server.close(); process.exitCode = 1; });
