/* Smoke local da V3 real com backend em memória: não toca no Supabase. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
let chromium;
try { ({ chromium } = require('playwright')); }
catch {
  const fallback = process.env.OAZE_PLAYWRIGHT_MODULE || 'C:/Users/santtoro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
  ({ chromium } = require(fallback));
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
      page.on('dialog', (dialog) => dialog.accept());
      await page.route('**/preview-v3/live-backend.js', (route) => route.fulfill({ contentType: 'text/javascript', body: `
        let cocoSettings={consented_at:null,revoked_at:null,learning_paused:false};
        let memories=[];
        window.V3Backend={
          start:async()=>{Store.loadRemoteMap({},'Teste');window.Sync={currentUser:()=>({uid:'teste'})};Limites.carregar=async()=>true;Limites.cabe=()=>true;Limites.pode=()=>true;AI.chamarFuncao=async()=>({texto:'Revise antes de salvar.',acao_proposta:{tipo:'expense',descricao:'Compra sugerida',valor:7,data:'2026-09-30',forma_pagamento:'account',origem:'Conta teste',categoria:'Teste personalizado',confirmado:true}});return true},
          mutate:async(change)=>{change();return Store.profile()},
          createProfile:async(name)=>Store.addProfile(name),
          user:()=>({id:'teste'}),subscription:async()=>({plan_id:'free',status:'free'}),
          saving:()=>false,client:()=>null,
          cocoSettings:async()=>({...cocoSettings}),
          cocoConsent:async(accepted)=>{cocoSettings={...cocoSettings,consented_at:accepted?new Date().toISOString():cocoSettings.consented_at,revoked_at:accepted?null:new Date().toISOString()};},
          cocoPauseLearning:async(paused)=>{cocoSettings.learning_paused=paused;},
          cocoMemories:async()=>memories.slice(),
          cocoRemember:async(profileId,memory)=>{const row={...memory,id:'memory-'+(memories.length+1),created_at:new Date().toISOString()};memories.unshift(row);return row;},
          cocoForget:async(id)=>{memories=memories.filter((m)=>m.id!==id);},
          cocoReadMedia:async()=>({texto:'Gastei 7 reais no mercado',tipo:'foto',salvo:false}),
          withTimeout:(promise)=>promise
        };
      ` }));
      await page.goto(baseUrl + '/app-v3.html#wallet');
      await page.locator('.aviso-cookies-recusar').click();
      await page.locator('[data-action="add-account"]').first().click();
      await page.locator('#v3-form-account [name="name"]').fill('Conta teste');
      await page.locator('#v3-form-account [name="bank"][value="Itaú"]').check();
      await page.locator('#v3-form-account [name="amount"]').fill('123,45');
      await page.locator('#v3-form-account [type="submit"]').click();
      await page.locator('.v3-wallet-item').first().click();
      assert.match(await page.locator('.v3-wallet-pocket').innerText(), /123,45/);
      await page.locator('[data-action="edit-wallet-item"]').click();
      assert.equal(await page.locator('#v3-form-account [name="name"]').inputValue(), 'Conta teste');
      await page.locator('.v3-sheet-close').click();
      if (width < 900) await page.locator('#v3-mobile-nav [data-go="more"]').click();
      await page.locator('[data-go="categories"]:visible').first().click();
      await page.locator('[data-action="add-category"]').click();
      await page.locator('#v3-form-category [name="name"]').fill('Teste personalizado');
      await page.locator('#v3-form-category [type="submit"]').click();
      assert.equal(await page.locator('.v3-cat-manage button').filter({ hasText: 'Teste personalizado' }).count(), 1);
      await page.locator('[data-action="new"]:visible').first().click();
      await page.locator('#v3-form-tx [name="amount"]').fill('12,34');
      await page.locator('#v3-form-tx [name="description"]').fill('Compra teste');
      await page.locator('#v3-form-tx [name="category"]').selectOption({ label: 'Teste personalizado' });
      await page.locator('#v3-form-tx [name="source"]').selectOption({ index: 1 });
      await page.locator('#v3-form-tx [type="submit"]').click();
      await page.locator('[data-go="transactions"]:visible').first().click();
      assert.equal(await page.locator('[data-transaction]').filter({ hasText: 'Compra teste' }).count(), 1);
      await page.locator('[data-transaction]').filter({ hasText: 'Compra teste' }).click();
      assert.equal(await page.locator('#v3-form-tx [name="description"]').inputValue(), 'Compra teste');
      await page.locator('#v3-form-tx [name="description"]').fill('Compra corrigida');
      await page.locator('#v3-form-tx [type="submit"]').click();
      assert.equal(await page.locator('[data-transaction]').filter({ hasText: 'Compra corrigida' }).count(), 1);
      await page.locator('[data-go="wallet"]:visible').first().click();
      await page.locator('[data-action="add-account"]:visible').first().click();
      await page.locator('[data-account-type="card"]').click();
      await page.locator('#v3-form-account [name="name"]').fill('Cartão teste');
      await page.locator('#v3-form-account [name="bank"][value="Nubank"]').check();
      await page.locator('#v3-form-account [name="amount"]').fill('2000,00');
      await page.locator('#v3-form-account [type="submit"]').click();
      await page.locator('[data-wallet-kind="credit"]').first().click();
      assert.equal(await page.locator('.v3-wallet-item').count(), 1);
      await page.locator('[data-action="new"]:visible').first().click();
      await page.locator('#v3-form-tx [name="amount"]').fill('50,00');
      await page.locator('#v3-form-tx [name="description"]').fill('Compra no cartão');
      await page.locator('#v3-form-tx [name="category"]').selectOption({ label: 'Teste personalizado' });
      const cardId = await page.evaluate(() => Store.profile().cards[0].id);
      await page.locator('#v3-form-tx [name="source"]').selectOption('card:' + cardId);
      await page.locator('#v3-form-tx [name="date"]').fill('2026-09-15');
      await page.locator('#v3-form-tx [type="submit"]').click();
      await page.locator('#v3-period').click();
      await page.locator('#v3-form-period [name="ym"]').fill('2026-10');
      await page.locator('#v3-form-period [type="submit"]').click();
      await page.locator('.v3-wallet-item').first().click();
      await page.locator('[data-action="pay-invoice"]').click();
      assert.match(await page.locator('#v3-form-invoice').innerText(), /50,00/);
      await page.locator('#v3-form-invoice [name="accountId"]').selectOption({ index: 1 });
      await page.locator('#v3-form-invoice [type="submit"]').click();
      assert.equal(await page.evaluate(() => Object.values(Store.profile().invoices).flatMap((x) => x.pagamentos).length), 1);
      const firstProfile = await page.evaluate(() => Store.profile().id);
      if (width < 900) {
        await page.locator('#v3-mobile-nav [data-go="more"]').click();
        await page.locator('[data-go="settings"]:visible').first().click();
      }
      await page.locator('[data-action="profiles"]:visible').first().click();
      await page.locator('#v3-form-profile [name="name"]').fill('Outro espaço');
      await page.locator('#v3-form-profile [type="submit"]').click();
      assert.equal(await page.evaluate(() => Store.state().profiles.length), 2);
      await page.locator('[data-action="profiles"]:visible').first().click();
      await page.locator(`[data-profile="${firstProfile}"]`).click();
      assert.equal(await page.evaluate(() => Store.profile().accounts.length), 1);
      const beforeCoco = await page.evaluate(() => Store.profile().transactions.length);
      await page.locator('[data-action="coco"]:visible').first().click();
      await page.locator('#v3-coco-consent-form').waitFor();
      await page.locator('#v3-coco-consent-form [name="accept"]').check();
      await page.locator('#v3-coco-consent-form [type="submit"]').click();
      await page.locator('[data-coco-tab="Conversa"]').click();
      await page.locator('#v3-chat-form [name="question"]').fill('Gastei sete reais');
      await page.locator('#v3-chat-form [type="submit"]').click();
      await page.locator('[data-action="review-proposal"]').waitFor();
      assert.equal(await page.evaluate(() => Store.profile().transactions.length), beforeCoco);
      await page.locator('[data-action="review-proposal"]').click();
      assert.equal(await page.locator('#v3-form-tx [name="description"]').inputValue(), 'Compra sugerida');
      await page.locator('#v3-form-tx [type="submit"]').click();
      assert.equal(await page.evaluate(() => Store.profile().transactions.at(-1).source), 'uglez');
      await page.locator('[data-action="coco"]:visible').first().click();
      await page.locator('[data-coco-tab="Memória"]').click();
      await page.locator('#v3-memory-form [name="label"]').fill('Uber');
      await page.locator('#v3-memory-form [name="value"]').fill('Transporte');
      await page.locator('#v3-memory-form [type="submit"]').click();
      await page.locator('.v3-coco-memories').getByText('Uber').waitFor();
      await page.locator('[data-action="pause-learning"]').click();
      assert.match(await page.locator('[data-action="pause-learning"]').innerText(), /Retomar/);
      await page.locator('[data-action="forget-memory"]').click();
      assert.equal(await page.locator('[data-action="forget-memory"]').count(), 0);
      await page.locator('[data-coco-tab="Conversa"]').click();
      await page.locator('#v3-coco-file').setInputFiles({
        name: 'recibo.png', mimeType: 'image/png', buffer: Buffer.alloc(120, 1)
      });
      assert.equal(await page.locator('#v3-chat-form [name="question"]').inputValue(), 'Gastei 7 reais no mercado');
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`V3 UI ${width}px: conta, categoria, lançamento, cartão, fatura, espaço e Coco OK`);
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
