'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('preview-v3/app.js');
const wallet = read('preview-v3/wallet.css');
const icons = read('preview-v3/icons.css');
const catalog = read('assets/vendor/bancos.js');

assert.match(app, /data-wallet-kind="debit"/);
assert.match(app, /data-wallet-kind="credit"/);
/* Com o carrossel, escolher um cartão é trazê-lo para o meio — nunca
   desescolher. Clicar de novo no cartão aberto não pode esvaziar a
   carteira, e fechar não pode esquecer qual estava aberto: reabrir
   tem de voltar nele. */
assert.match(app, /state\.selected=target\.dataset\.select; render\(\); return;/);
assert.doesNotMatch(app, /state\.selected===target\.dataset\.select\?null/);
assert.match(app, /data-action="wallet-toggle" aria-expanded="\$\{state\.walletOpen\}"/);
assert.match(app, /action==='wallet-toggle'/);
assert.match(app, /state\.walletOpen=!state\.walletOpen/);
assert.doesNotMatch(app, /if\(!state\.walletOpen\)state\.selected=null/);
assert.doesNotMatch(app, /if \(target\.dataset\.select\)[^\n]*go\('wallet'\)/);
assert.match(app, /const list = walletItems\(\)/);
assert.match(app, /function walletItemValue\(item\)/);
assert.match(app, /const total=chosen \? walletItemValue\(chosen\)/);
assert.match(app, /Calc\.accountBalance\(item\.data\.id/);
assert.match(app, /Calc\.invoice\(item\.data\.id, state\.ym\)/);
assert.match(app, /data-select="\$\{esc\(d\.id\)\}"/);
assert.match(app, /aria-pressed="\$\{selected\}"/);
assert.match(app, /--card-plastic:\$\{plastic\}/);
assert.match(app, /itau:'#F3BC45'/);
assert.match(app, /type="radio" name="bank"/);
assert.doesNotMatch(app, /<input[^>]*name="bank"[^>]*type="text"/);
assert.match(app, /global\.Icons\?\.bank\(/);
assert.match(catalog, /itau:/);
assert.match(wallet, /\.v3-wallet-pocket/);
assert.match(wallet, /\.v3-wallet-item\.is-selected/);
assert.match(wallet, /aspect-ratio:1\.586/);
assert.match(wallet, /\.v3-wallet\.is-closed \.v3-wallet-list\{display:none\}/);
assert.match(wallet, /prefers-reduced-motion/);
assert.match(icons, /uicons-regular-rounded\.woff2/);
assert.match(icons, /\.v3-fi-eye::before/);
assert.match(icons, /\.v3-hide-money \.v3-fi-eye::before/);
assert.match(app, /Uicons by Flaticon/);
assert.ok(fs.statSync(path.join(root, 'assets/fonts/uicons-regular-rounded.woff2')).size > 100000);
assert.ok(fs.existsSync(path.join(root, 'assets/vendor/FLATICON-LICENSE.txt')));
for (const html of ['app-v3.html', 'preview-v3/index.html']) {
  const page = read(html);
  assert.match(page, /preview-v3\/wallet\.css/);
  assert.match(page, /preview-v3\/icons\.css/);
  assert.match(page, /v3-fi v3-fi-eye/);
  assert.match(page, /v3-fi v3-fi-reminders/);
  assert.match(page, /v3-notification-count/);
  assert.match(page, /assets\/vendor\/bancos\.js/);
  assert.match(page, /assets\/js\/icons\.js/);
}

/* =============================================================
   O CARROSSEL DA CARTEIRA
   -------------------------------------------------------------
   Aberta, a carteira mostra UM cartão e troca pelo lado. O que
   segura isso é o gesto: 1:1 com o dedo, com captura de ponteiro,
   animado por uma mola quadro a quadro — e não por transição CSS,
   que não pode ser interrompida sem saltar. Cada peça abaixo já foi
   perdida uma vez ao mexer no arquivo; por isso está aqui.
   ============================================================= */
const carteira = read('preview-v3/carteira.js');

assert.match(carteira, /setPointerCapture/, 'o arrasto precisa capturar o ponteiro');
assert.match(carteira, /requestAnimationFrame\(passo\)/, 'a mola anima quadro a quadro');
assert.match(carteira, /const k = 340/, 'a rigidez da mola é medida, não improvisada');
assert.match(carteira, /Math\.max\(partiuDe - 1, Math\.min\(partiuDe \+ 1/, 'um gesto anda um cartão');
assert.match(carteira, /prefers-reduced-motion/, 'quem pede menos movimento recebe o destino');
assert.match(carteira, /oaze\.carteira\.ultimo/, 'a carteira abre no último cartão aberto');
assert.match(carteira, /Math\.abs\(dx\) > Math\.abs\(dy\)/, 'gesto vertical continua rolando a página');

/* A posição vem do índice menos a posição atual: é essa fórmula que
   deixa o arrasto sair de graça. Se ela virar transition, o cartão
   atrasa em relação ao dedo. */
assert.match(wallet, /--d:calc\(var\(--deck-i,0\) - var\(--carta-pos,0\)\)/);
assert.match(wallet, /overflow-x:clip/, 'o vizinho some na borda da carteira, não por cima da página');
assert.match(wallet, /touch-action:pan-y/, 'o dedo na vertical ainda rola a página');
assert.match(app, /--deck-i:\$\{i \|\| 0\}/);
assert.match(app, /data-carteira-ant/);
assert.match(app, /data-carteira-prox/);
assert.match(app, /data-carteira-ponto/);
assert.match(app, /function montarCarteira\(\)/);
assert.match(app, /function atualizarBolso\(id\)/, 'o bolso acompanha o gesto sem redesenhar a tela');
for (const html of ['app-v3.html', 'preview-v3/index.html']) {
  assert.match(read(html), /preview-v3\/carteira\.js/, html + ' precisa carregar a carteira');
}

console.log('Carteira V3, carrossel, instituições e ícones locais protegidos por verificação.');
