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
profile.cards = [{ id: 'cartao-a', name: 'A' }, { id: 'cartao-b', name: 'B' }];
profile.transactions = [
  { id: 'compra-a', cardId: 'cartao-a' },
  { id: 'compra-b', cardId: 'cartao-b' },
  { id: 'salario', accountId: 'conta-a' }
];
profile.invoices = {
  'cartao-a|2026-09': { pagamentos: [{ amount: 100, accountId: 'conta-a' }] },
  'cartao-b|2026-09': { pagamentos: [{ amount: 50, accountId: 'conta-a' }] }
};

const revision = Store.revisao();
assert.equal(Store.removeCardWithHistory('cartao-a'), true);
assert.deepEqual(Array.from(profile.cards, (card) => card.id), ['cartao-b']);
assert.deepEqual(Array.from(profile.transactions, (tx) => tx.id), ['compra-b', 'salario']);
assert.deepEqual(Object.keys(profile.invoices), ['cartao-b|2026-09']);
assert.equal(Store.revisao(), revision + 1, 'a exclusão faz um único commit');
assert.equal(Store.removeCardWithHistory('cartao-a'), false, 'repetição não modifica dados');
assert.equal(Store.revisao(), revision + 1);

console.log('OK — exclusão do cartão remove só seus dados vinculados.');
