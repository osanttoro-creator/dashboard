'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const memory = new Map();
const context = {
  console, Date, Intl, Math, Number, String, Array, Object, Set, Map, JSON,
  isNaN, parseInt, parseFloat, setTimeout, clearTimeout,
  localStorage: {
    getItem: (key) => memory.get(key) || null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key)
  },
  crypto: { randomUUID: () => 'teste-uuid' }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
for (const file of ['assets/js/utils.js', 'assets/js/store.js', 'assets/js/calc.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}
const { Store, Calc } = context;

const ignored = Store.normalizeTx({
  id: 'tx-ignored', kind: 'expense', description: 'Despesa ignorada',
  date: '2026-10-02', amount: 30, accountId: 'conta', confirmed: true,
  ignored: true, remindDaysBefore: 3,
  receiptPath: 'pessoa/perfil/tx-ignored/teste-uuid.pdf'
});
assert.equal(ignored.ignored, true);
assert.equal(ignored.remindDaysBefore, 3);
assert.equal(ignored.receiptPath, 'pessoa/perfil/tx-ignored/teste-uuid.pdf');
assert.equal(Store.normalizeTx({ ...ignored, receiptPath: '../outro.pdf' }).receiptPath, null);
assert.equal(Store.normalizeTx({ ...ignored, remindDaysBefore: 99 }).remindDaysBefore, null);
assert.equal(Store.normalizeTx({ ...ignored, kind: 'income' }).ignored, false);

const profile = {
  id: 'perfil', accounts: [{ id: 'conta', name: 'Conta', openedAt: '2026-01-01', openingBalance: 100 }],
  cards: [], categories: [], investments: [], goals: [], budgets: {}, invoices: {},
  transactions: [ignored, Store.normalizeTx({
    id: 'tx-normal', kind: 'expense', description: 'Despesa comum',
    date: '2026-10-03', amount: 20, accountId: 'conta', confirmed: true
  })]
};
const totals = Calc.monthTotals('2026-10', profile);
assert.equal(totals.expense, 20, 'despesa ignorada não contamina o resumo');
assert.equal(Calc.accountBalance('conta', '2026-10-31', profile), 50,
  'ignorar no resumo não apaga a saída da conta');
assert.equal(Calc.entriesForMonth('2026-10', profile).length, 2,
  'lançamento ignorado continua no extrato e pode ser editado');

console.log('OK — lembrete e anexo normalizados; ignorar despesa não altera o saldo real.');
