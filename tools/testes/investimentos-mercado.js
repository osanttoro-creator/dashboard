/* Cálculos sem rede, sem Supabase e sem dados pessoais. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const context = { console, Date, Intl, Math, Number, String, Array, Object, Set, Map };
context.window = context;
vm.createContext(context);
for (const file of ['assets/js/utils.js', 'assets/js/calc.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}
const { Calc, U } = context;
const today = U.todayISO();
const cdb = { type: 'CDB', indexer: 'cdi', date: '2026-01-01', amount: 1000, rate: 110, currentValue: null };
Calc.setInvestmentMarket({ cdiStart: '2026-01-01', cdi: [
  { date: '2026-01-02', value: 1 }, { date: '2026-01-05', value: 1 }
], quotes: {} });
assert.equal(Calc.cdiValueAt(cdb, '2026-01-05'), 1022.12);
assert.equal(Calc.investmentValueAt(cdb, '2026-01-05'), 1022.12);
assert.equal(Calc.investmentValueAt({ ...cdb, currentValue: 1050 }, today), 1050);
assert.equal(Calc.investmentValueAt({ ...cdb, date: '2015-01-01' }, today), 1000);
const stock = { type: 'Ações', date: '2026-01-01', amount: 800, rate: 0, ticker: 'PETR4', quantity: 10 };
Calc.setInvestmentMarket({ quotes: { PETR4: { price: 90, currency: 'BRL', marketTime: new Date().toISOString() } } });
assert.equal(Calc.investmentValueAt(stock, today), 900);
assert.equal(Calc.investmentValueAt({ ...stock, currentValue: 850 }, today), 850);
Calc.setInvestmentMarket({ quotes: { PETR4: { price: 90, currency: 'BRL', marketTime: '2020-01-01T00:00:00Z' } } });
assert.equal(Calc.investmentValueAt(stock, today), 800);
console.log('Investimentos de mercado: cálculos e prioridades OK');
