import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../assets/app/app.js', import.meta.url), 'utf8');
const start = source.indexOf('  let investmentMarketRequest = null;');
const end = source.indexOf('  /* Data e hora de um carimbo de mercado', start);
assert.ok(start >= 0 && end > start, 'bloco de mercado não encontrado');
const block = source.slice(start, end);

const investments = [
  { type: 'CDB', indexer: 'cdi', currentValue: null, date: '2026-10-01' },
  { type: 'Ações', ticker: 'PETR4', quantity: 1, currentValue: null }
];
let phase = 0;
const calls = [];
let lastMarket;
const marketApi = async (body) => {
  calls.push(body.action);
  if (phase === 0) {
    if (body.action === 'indices') return { cdiDaily: { date: '2026-11-02', value: 0.05 } };
    if (body.action === 'cdi_history') throw new Error('CDI temporariamente indisponível');
    return { quotes: [] };
  }
  if (phase === 1) {
    if (body.action === 'indices') return { cdiDaily: { date: '2026-11-02', value: 0.05 } };
    if (body.action === 'cdi_history') return { observations: [{ date: '2026-11-02', value: 0.05 }] };
    return { quotes: [{ requestedSymbol: 'PETR4', price: 50, currency: 'BRL', marketTime: '2026-11-03T14:30:00Z' }] };
  }
  throw new Error('Fonte temporariamente indisponível');
};
const state = { sharedId: null, page: 'investments', market: {
  indices: null, error: '', historyError: '', quoteError: '', loading: false,
  loadedAt: 0, retryAt: 0, cdiStart: '', quoteKey: ''
} };
const refresh = new Function('demo', 'state', 'profile', 'global', 'V3Backend', 'U', 'Calc', 'render',
  block + '; return refreshInvestmentMarket;')(
  false, state, () => ({ investments }), { V3Backend: { investmentMarket: marketApi } },
  { investmentMarket: marketApi }, { todayISO: () => '2026-11-03' },
  { setInvestmentMarket: (data) => { lastMarket = data; } }, () => {}
);

await refresh(false);
assert.match(state.market.historyError, /CDI temporariamente/);
assert.match(state.market.quoteError, /Sem cotação para PETR4/);
assert.ok(state.market.retryAt - Date.now() <= 60_000);
const before = calls.length;
await refresh(false);
assert.equal(calls.length, before, 'evita repetição imediata');
phase = 1;
await refresh(true);
assert.equal(state.market.historyError, '');
assert.equal(state.market.quoteError, '');
assert.equal(lastMarket.cdi.length, 1);
assert.equal(lastMarket.quotes.PETR4.price, 50);
assert.ok(state.market.retryAt - Date.now() > 14 * 60_000);
phase = 2;
await refresh(true);
assert.equal(lastMarket.cdi.length, 1, 'falha temporária preserva CDI válido');
assert.equal(lastMarket.quotes.PETR4.price, 50, 'falha temporária preserva cotação válida');
assert.ok(state.market.retryAt - Date.now() <= 60_000);
console.log('Mercado: resposta vazia, repetição e últimos dados válidos OK');
