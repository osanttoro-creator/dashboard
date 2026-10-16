/* Prévia local: o formulário de investimento e os indicadores não podem quebrar a tela. */
const assert = require('node:assert/strict');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(process.env.OAZE_PLAYWRIGHT_MODULE || 'C:/Users/santtoro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.OAZE_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 850 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto((process.env.OAZE_BASE_URL || 'http://127.0.0.1:4173') + '/preview-v3/index.html?demo=1#investments');
    await page.locator('.v3-market-panel').waitFor();
    assert.match(await page.locator('.v3-market-panel').innerText(), /demonstração/i);
    await page.locator('[data-action="add-investment"][data-type="CDB"]').click();
    assert.equal(await page.locator('#v3-invest-amount-label').isVisible(), true);
    assert.equal(await page.locator('#v3-form-investment .v3-mais').evaluate((el) => el.open), false);
    await page.locator('#v3-form-investment .v3-mais summary').click();
    assert.equal(await page.locator('#v3-form-investment [name="indexer"]').inputValue(), 'cdi');
    assert.equal(await page.locator('#v3-form-investment [name="rate"]').inputValue(), '100');
    assert.equal(await page.locator('#v3-invest-market-fields').isVisible(), false);
    await page.locator('#v3-form-investment [name="type"]').selectOption('Ações');
    assert.equal(await page.locator('#v3-invest-market-fields').isVisible(), true);
    assert.equal(await page.locator('#v3-invest-cdb').isVisible(), false);
    await page.locator('#v3-form-investment [name="rate"]').fill('');
    await page.locator('#v3-form-investment [name="type"]').selectOption('CDB');
    assert.equal(await page.locator('#v3-form-investment [name="rate"]').inputValue(), '100');
    const amount = page.locator('#v3-form-investment [name="amount"]');
    await amount.fill('500,00');
    await amount.dispatchEvent('input');
    assert.match(await page.locator('.v3-invest-assist-valuation').innerText(), /aguardando CDI histórico/i);
    await page.locator('#v3-form-investment [name="type"]').selectOption('Ações');
    assert.match(await page.locator('.v3-invest-assist-valuation').innerText(), /faltam ticker e quantidade/i);
    await page.locator('#v3-form-investment [name="ticker"]').fill('PETR4');
    await page.locator('#v3-form-investment [name="quantity"]').fill('10');
    assert.match(await page.locator('.v3-invest-assist-valuation').innerText(), /cotação não disponível/i);
    await page.locator('#v3-form-investment [name="currentValue"]').fill('620,00');
    assert.match(await page.locator('.v3-invest-assist-valuation').innerText(), /valor informado/i);
    assert.deepEqual(errors, []);
    console.log('Investimentos UI: painel, CDB, ticker/quantidade e prévia OK');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
