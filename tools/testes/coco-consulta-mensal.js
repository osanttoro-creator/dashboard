'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');
const source = fs.readFileSync(path.join(root, 'assets/js/ai.js'), 'utf8');
let requested = '';
const U = {
  norm: (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(),
  todayYM: () => '2026-10',
  addMonths: (ym, amount) => {
    const [year, month] = ym.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1 + amount, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }
};
const totals = { income: 1343.08, expense: 776.57, balance: 566.51,
  entries: [{ kind: 'income', confirmed: true, contaNosTotais: true }] };
const Calc = { monthTotals: (ym) => { requested = ym; return totals; } };
const window = {};
vm.runInNewContext(source, { window, U, Calc });

const answer = window.AI.consultaMesPassado('Quero o total do mês passado');
assert.equal(requested, '2026-09');
assert.equal(answer.receitas, 1343.08);
assert.equal(answer.despesas, 776.57);
assert.equal(answer.saldo, 566.51);
assert.equal(answer.comDados, true);
assert.equal(window.AI.consultaMesPassado('Compare o total do mês passado com agosto'), null);
assert.equal(window.AI.consultaMesPassado('Quanto gastei por categoria no mês passado?'), null);
assert.equal(window.AI.consultaMesPassado('Quero o total do mês passado, e fiz uma compra de pão hoje de R$ 20 no débito'), null);
totals.entries = [{ kind: 'expense', confirmed: true, contaNosTotais: false }];
assert.equal(window.AI.consultaMesPassado('Saldo do mês passado').comDados, false);

const app = fs.readFileSync(path.join(root, 'preview-v3/app.js'), 'utf8');
const wallet = fs.readFileSync(path.join(root, 'preview-v3/wallet.css'), 'utf8');
assert.match(app, /AI\.corpoDaPergunta\(q,state\.ym\)/);
assert.match(app, /sourceNeedsReview/);
assert.match(wallet, /\.v3-card-top\{position:absolute;z-index:3/);
assert.match(wallet, /\.v3-card-select\{position:absolute;inset:0;z-index:2/);
console.log('Coco: total mensal exato, conta ambígua revisada e botão do olho acessível.');
