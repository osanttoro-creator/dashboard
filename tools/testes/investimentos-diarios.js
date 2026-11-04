'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require('node:path').join(__dirname, '../../assets/js/calc.js'), 'utf8');
const iso = (date) => date.toISOString().slice(0, 10);
const U = {
  todayISO: () => '2026-11-03',
  todayYM: () => '2026-11',
  isValidISO: (value) => /^\d{4}-\d{2}-\d{2}$/.test(value),
  round2: (value) => Math.round((value + Number.EPSILON) * 100) / 100,
  addDaysISO: (date, days) => iso(new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000)),
  yearsBetween: (start, end) => (Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 31536000000
};
const window = {};
vm.runInNewContext(source, { window, U, Store: { profile: () => ({ investments: [] }) } });
const Calc = window.Calc;
const cdb = { type: 'CDB', indexer: 'cdi', date: '2026-10-01', amount: 900,
  currentValue: 1000, currentValueAt: '2026-11-01', rate: 100 };
Calc.setInvestmentMarket({ cdiStart: '2026-10-01', cdiAnnual: 12,
  cdi: [{date:'2026-11-02',value:0.05},{date:'2026-11-03',value:0.05}], quotes: {} });
assert.equal(Calc.investmentValueAt(cdb, '2026-11-01'), 1000);
assert.equal(Calc.investmentValueAt(cdb, '2026-11-03'), 1001);
assert.equal(Calc.investmentDailyChange(cdb, '2026-11-03').value, 0.5);
const future = Calc.investmentProjection(cdb, '2026-11-03');
assert.ok(future.value30 > future.base);
assert.ok(future.value365 > future.value30);
assert.equal(future.source, 'cdi');
const fixed = { type:'Tesouro Direto', date:'2026-10-01', amount:900,
  currentValue:1000, currentValueAt:'2026-11-01', rate:12 };
assert.ok(Calc.investmentValueAt(fixed, '2026-11-03') > 1000);
assert.ok(Calc.investmentProjection(fixed, '2026-11-03').value30 > 1000);
console.log('Investimentos: fotografia datada, rendimento diário e cenários brutos OK');
