'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const values = new Map();
const storage = {
  getItem: (key) => values.get(key) || null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key)
};
const window = {};
let nextId = 0;
const U = { uid: (prefix) => `${prefix}-${++nextId}`, todayISO: () => '2026-10-23' };
const context = vm.createContext({ window, localStorage: storage, console, Date, Intl, U });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../assets/js/store.js'), 'utf8'), context);

const Store = window.Store;
Store.load();
const profile = Store.profile();
profile.accounts = [{ id: 'conta-a' }, { id: 'conta-b' }];
profile.cards = [{ id: 'cartao-a', accountId: 'conta-a' }, { id: 'cartao-b', accountId: 'conta-b' }];
profile.transactions = [
  { id: 'despesa-a', accountId: 'conta-a' },
  { id: 'transferencia-a', accountId: 'conta-b', toAccountId: 'conta-a' },
  { id: 'despesa-b', accountId: 'conta-b' }
];
profile.investments = [{ id: 'invest-a', accountId: 'conta-a' }];
profile.goals = [{ id: 'meta-a', saved: 100, deposits: [{ accountId: 'conta-a', amount: 100 }] }];
profile.invoices = {
  'cartao-a|2026-10': {
    pagamentos: [{ amount: 20, accountId: 'conta-a' }, { amount: 10, accountId: 'conta-b' }],
    adiantamentos: { compra1: { amount: 5, accountId: 'conta-a' }, compra2: { amount: 7, accountId: 'conta-b' } },
    quitada: true
  }
};

const revision = Store.revisao();
assert.equal(Store.removeAccountWithHistory('conta-a'), true);
assert.deepEqual(Array.from(profile.accounts, (a) => a.id), ['conta-b']);
assert.deepEqual(Array.from(profile.transactions, (tx) => tx.id), ['despesa-b']);
assert.equal(profile.cards[0].accountId, null);
assert.equal(profile.cards[1].accountId, 'conta-b');
assert.equal(profile.investments[0].accountId, null);
assert.equal(profile.goals[0].deposits[0].accountId, null);
assert.equal(profile.goals[0].saved, 100, 'a meta mantém o valor guardado');
assert.equal(profile.invoices['cartao-a|2026-10'].pagamentos.length, 1);
assert.equal(profile.invoices['cartao-a|2026-10'].pagamentos[0].accountId, 'conta-b');
assert.deepEqual(Object.keys(profile.invoices['cartao-a|2026-10'].adiantamentos), ['compra2']);
assert.equal(profile.invoices['cartao-a|2026-10'].quitada, false);
assert.equal(Store.revisao(), revision + 1);
assert.equal(Store.removeAccountWithHistory('conta-a'), false);
assert.equal(Store.revisao(), revision + 1);

console.log('OK — exclusão da conta remove dados vinculados sem duplicar nem alterar outras contas.');
