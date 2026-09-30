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
assert.match(app, /state\.selected=state\.selected===target\.dataset\.select\?null:target\.dataset\.select; render\(\); return;/);
assert.match(app, /data-action="wallet-toggle" aria-expanded="\$\{state\.walletOpen\}"/);
assert.match(app, /action==='wallet-toggle'/);
assert.match(app, /state\.walletOpen=!state\.walletOpen/);
assert.match(app, /if\(!state\.walletOpen\)state\.selected=null/);
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

console.log('Carteira V3, instituições e ícones locais protegidos por verificação.');
