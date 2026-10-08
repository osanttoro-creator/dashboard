/* Carteira circular na prévia: testa os limites sem tocar em dados reais. */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
let chromium;
try { ({ chromium } = require('playwright')); }
catch {
  ({ chromium } = require(process.env.OAZE_PLAYWRIGHT_MODULE ||
    'C:/Users/santtoro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
}

const edgePath = process.env.OAZE_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const baseUrl = process.env.OAZE_BASE_URL || 'http://127.0.0.1:4173';

(async () => {
  const browser = await chromium.launch({ ...(fs.existsSync(edgePath) ? { executablePath: edgePath } : {}), headless: true });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(baseUrl + '/preview-v3/index.html?demo=1#home');
      const centerId = () => page.locator('.v3-wallet-item.esta-no-centro').getAttribute('data-select');
      assert.equal(await centerId(), 'a1');

      if (width >= 900) {
        await page.locator('[data-carteira-prox]').click();
        assert.equal(await centerId(), 'a2');
        await page.locator('[data-carteira-prox]').click();
        assert.equal(await centerId(), 'a1', 'depois do último vem o primeiro');
        await page.locator('[data-carteira-ant]').click();
        assert.equal(await centerId(), 'a2', 'antes do primeiro vem o último');
        assert.equal(await page.locator('[data-carteira-prox]').isDisabled(), false);
        assert.equal(await page.locator('[data-carteira-ant]').isDisabled(), false);
      } else {
        await page.locator('.v3-wallet-item.esta-no-centro .v3-card-select').focus();
        await page.keyboard.press('ArrowLeft');
        assert.equal(await centerId(), 'a2', 'teclado volta do primeiro ao último');
        await page.keyboard.press('ArrowRight');
        assert.equal(await centerId(), 'a1', 'teclado avança do último ao primeiro');
      }

      await page.waitForTimeout(550);
      const box = await page.locator('.v3-wallet-list').boundingBox();
      const y = box.y + box.height / 2;
      const start = box.x + box.width * 0.82;
      const end = box.x + box.width * 0.14;
      await page.mouse.move(start, y);
      await page.mouse.down();
      await page.mouse.move(end, y, { steps: 12 });
      await page.mouse.up();
      assert.equal(await centerId(), width >= 900 ? 'a1' : 'a2', 'arrastar na ponta também percorre o anel');
      assert.match(await page.locator('.v3-wallet-pocket').innerText(), width >= 900 ? /itaú/i : /nubank/i);

      await page.locator('[data-wallet-kind="credit"]').click();
      assert.equal(await centerId(), 'c2');
      if (width >= 900) {
        await page.locator('[data-carteira-prox]').click();
        await page.locator('[data-carteira-prox]').click();
        assert.equal(await centerId(), 'c2', 'o crédito também fecha o anel');
      } else {
        await page.locator('.v3-wallet-item.esta-no-centro .v3-card-select').focus();
        await page.keyboard.press('ArrowLeft');
        assert.equal(await centerId(), 'c1', 'o crédito também volta pelo anel');
      }
      assert.equal(errors.length, 0, errors.join('\n'));
      await page.close();
      console.log(`Carteira circular ${width}px: débito, crédito e retorno pelas pontas OK`);
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
