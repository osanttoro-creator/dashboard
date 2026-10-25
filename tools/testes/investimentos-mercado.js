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
/* A ETIQUETA NÃO PODE MENTIR SOBRE O NÚMERO
   investmentValueSource espelha os desvios de investmentValueAt. Se
   um mudar sem o outro, a tela passa a dizer "cotação" ao lado de um
   valor estimado — que é pior do que não dizer nada. */
Calc.setInvestmentMarket({ quotes: { PETR4: { price: 90, currency: 'BRL', marketTime: new Date().toISOString() } } });
assert.equal(Calc.investmentValueSource(stock, today).origem, 'cotacao', 'cotação fresca é cotação');
assert.equal(Calc.investmentValueAt(stock, today), 900);
assert.equal(Calc.investmentValueSource({ ...stock, currentValue: 850 }, today).origem, 'manual', 'valor digitado é manual');
Calc.setInvestmentMarket({ quotes: { PETR4: { price: 90, currency: 'BRL', marketTime: '2020-01-01T00:00:00Z' } } });
assert.equal(Calc.investmentValueSource(stock, today).origem, 'aporte', 'cotação velha não vira cotação');
assert.equal(Calc.investmentValueAt(stock, today), 800, 'e o valor cai para o aportado, como a etiqueta diz');
assert.equal(Calc.investmentValueSource({ type: 'Outro', date: '2026-01-01', amount: 100, rate: 10 }, today).origem, 'estimativa');
Calc.setInvestmentMarket({ cdiStart: '2026-01-01', cdi: [
  { date: '2026-01-02', value: 1 }, { date: '2026-01-05', value: 1 }
] });
assert.equal(Calc.investmentDailyChange(cdb, '2026-01-05').value, 11.12);
assert.equal(Calc.investmentDailyChange({ ...cdb, currentValue: 1050 }, today), null);
assert.equal(Calc.investmentDailyChange(stock, today), null, 'ação sem cotação anterior não tem rendimento diário conhecido');
const future = new Date(today + 'T00:00:00Z'); future.setUTCDate(future.getUTCDate() + 20);
assert.equal(Calc.investmentValueAt({ type: 'Outro', date: '2026-01-01', amount: 100, rate: 10 }, future.toISOString().slice(0,10)),
  Calc.investmentValueAt({ type: 'Outro', date: '2026-01-01', amount: 100, rate: 10 }, today), 'valor corrente não antecipa juros do mês');

console.log('Investimentos de mercado: cálculos e prioridades OK');
