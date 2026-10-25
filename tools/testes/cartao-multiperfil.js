'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const cache = new Map();
const localStorage = {
  getItem: (key) => cache.get(key) || null,
  setItem: (key, value) => cache.set(key, String(value)),
  removeItem: (key) => cache.delete(key)
};
const window = {};
let n = 0;
const U = {
  uid: (prefix) => `${prefix}-${++n}`,
  todayISO: () => '2026-10-25',
  round2: (value) => Math.round(value * 100) / 100,
  isValidISO: (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || ''),
  norm: (value) => String(value || '').toLowerCase()
};
const context = vm.createContext({ window, localStorage, console, Date, Intl, U });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../assets/js/store.js'), 'utf8'), context);

const Store = window.Store;
Store.load();
const original = Store.profile();
const secondary = Store.state().profiles.find((profile) => profile.id !== original.id);
assert.ok(secondary, 'a instalação padrão tem ao menos dois perfis');
original.cards = [{ id: 'card-1', name: 'Cartão único', visibleInProfiles: [secondary.id] }];
original.invoices = { 'card-1|2026-10': { pagamentos: [{ amount: 45 }] } };
original.transactions = [{ id: 'purchase-1', cardId: 'card-1', amount: 100 }];
assert.equal(secondary.cards.length, 0, 'o perfil secundário não recebe uma cópia do cartão');
assert.equal(Object.keys(secondary.invoices).length, 0, 'a fatura existe apenas na origem');
const normalized = Store.normalizeProfile(original);
assert.deepEqual(Array.from(normalized.cards[0].visibleInProfiles), [secondary.id]);
assert.equal(Store.removeCardWithHistory('card-1'), true);
assert.equal(original.cards.length, 0);
assert.equal(Object.keys(original.invoices).length, 0);
assert.equal(secondary.cards.length, 0);

console.log('OK — cartão vinculado preserva uma única fatura no perfil de origem.');
