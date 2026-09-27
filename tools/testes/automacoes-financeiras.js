'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const raiz = path.resolve(__dirname, '..', '..');
const falhas = [];
const ok = (cond, msg) => { if (!cond) falhas.push(msg); };
const pad = (n) => String(n).padStart(2, '0');
const U = {
  norm: (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
  uid: (p) => p + '_teste', round2: (n) => Math.round((+n || 0) * 100) / 100,
  fmtBRL: (n) => 'R$ ' + (+n || 0).toFixed(2), todayISO: () => '2026-09-25', todayYM: () => '2026-09',
  isValidISO: (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s),
  ymOf: (d) => d.slice(0, 7), ymParts: (ym) => ({ y: +ym.slice(0, 4), m: +ym.slice(5, 7) - 1 }),
  addMonths: (ym, k) => { const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + k, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); },
  clampDay: (y, m, d) => Math.min(d, new Date(y, m + 1, 0).getDate()),
  isoOf: (y, m, d) => y + '-' + pad(m + 1) + '-' + pad(d),
  addDaysISO: (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); },
  sum: (xs, fn) => xs.reduce((s, x) => s + fn(x), 0)
};
const sandbox = { console, U };
sandbox.window = sandbox;
vm.createContext(sandbox);
function carrega(f) { vm.runInContext(fs.readFileSync(path.join(raiz, f), 'utf8'), sandbox, { filename: f }); }
carrega('assets/js/automacoes/normalizar-estabelecimento.js');
carrega('assets/js/automacoes/categorizar.js');
carrega('assets/js/automacoes/detectar-recorrencias.js');

const E = sandbox.Estabelecimento;
ok(E.normalizar('NETFLIX.COM').merchantKey === 'netflix', 'Netflix.com não normalizou');
ok(E.normalizar('PIX Netflix Brasil 12/09 NSU 123456789').merchantKey === 'netflix', 'ruído PIX/NSU não foi removido');
ok(E.normalizar('Netflix Entretenimento').merchantKey === 'netflix', 'alias Netflix não foi relacionado');
ok(E.normalizar('123456').merchantKey === null, 'descrição numérica virou estabelecimento');
ok(E.normalizar('Loja Sol').merchantKey !== E.normalizar('Loja Sul').merchantKey, 'nomes parecidos demais foram unidos');

const profile = { categories: [
  { id: 'food', name: 'Alimentação', kind: 'expense' }, { id: 'subs', name: 'Assinaturas', kind: 'expense' },
  { id: 'salary', name: 'Salário', kind: 'income' }
], automation: { categoryRules: [{ merchantKey: 'netflix', kind: 'expense', categoryId: 'food', active: true }], merchantAliases: [], recurrenceDecisions: {} },
transactions: [] };
let s = sandbox.Categorizacao.sugerir('Netflix Brasil', 'expense', profile);
ok(s.categoryId === 'food' && s.source === 'confirmed-rule', 'regra confirmada não venceu heurística');
profile.automation.categoryRules = [];
s = sandbox.Categorizacao.sugerir('Netflix Brasil', 'expense', profile);
ok(s.categoryId === 'subs' && s.confidence === 'medium', 'regra curada não sugeriu Assinaturas');
ok(sandbox.Categorizacao.sugerir('', 'expense', profile).categoryId === null, 'descrição vazia ganhou categoria');

function tx(id, date, amount, extra) { return Object.assign({ id, kind: 'expense', description: 'Netflix Brasil', amount, date,
  categoryId: 'subs', method: 'card', cardId: 'card1', confirmed: true, recurring: false, installment: null }, extra || {}); }
const mensal = [tx('a','2026-06-10',39.9),tx('b','2026-07-10',39.9),tx('c','2026-08-10',42.9)];
let rec = sandbox.DetectorRecorrencias.detectar(mensal, profile);
ok(rec.length === 1 && rec[0].periodicity === 'monthly', 'três cobranças mensais não foram detectadas');
ok(sandbox.DetectorRecorrencias.detectar(mensal.map((t, i) => Object.assign({}, t, { installment: { total: 3, index: i + 1 } })), profile).length === 0, 'parcelas viraram recorrência');
ok(sandbox.DetectorRecorrencias.detectar(mensal.map((t) => Object.assign({}, t, { kind: 'transfer' })), profile).length === 0, 'transferência virou recorrência');
profile.automation.recurrenceDecisions[rec[0].id] = { status: 'blocked' };
ok(sandbox.DetectorRecorrencias.detectar(mensal, profile).length === 0, 'candidato ignorado reapareceu');

sandbox.Calc = {
  monthTotals: () => ({ income: 5000, expense: 3000 }),
  accountBalance: () => 2500
};
carrega('assets/js/automacoes/metas-automaticas.js');
const goal = { id: 'g1', target: 12000, saved: 6000, deadline: '2027-03-25', accountId: 'acc1', contribution: { amount: 800, day: 5 },
  automation: { active: true, status: 'active', amount: 1000, day: 5, accountId: 'acc1', floor: 1000 }, proposals: [] };
const gp = { goals: [goal], accounts: [{ id: 'acc1' }] };
const analise = sandbox.MetasAutomaticas.sugerir(goal, gp, '2026-09');
ok(analise.necessary === 1000, 'ritmo necessário incorreto');
ok(analise.suggested === 1000, 'sugestão não respeitou saldo/piso');
const p1 = sandbox.MetasAutomaticas.ensureProposal(goal, gp, '2026-09');
const p2 = sandbox.MetasAutomaticas.ensureProposal(goal, gp, '2026-09');
ok(p1 && p1 === p2 && goal.proposals.length === 1, 'proposta mensal não é idempotente');

/* A confirmação precisa ser idempotente também no Store: repetir o
   mesmo clique/reenvio não pode reservar dinheiro duas vezes. */
let salvo = JSON.stringify({ version: 1, theme: 'dark', activeProfileId: 'p1', profiles: [{
  id: 'p1', name: 'Pessoal', accounts: [], cards: [], categories: [], transactions: [], investments: [], invoices: {}, budgets: {},
  goals: [{ id: 'g1', name: 'Meta', target: 1000, saved: 0, deposits: [] }]
}] });
sandbox.localStorage = { setItem: (k, v) => { if (k === 'financas.v1') salvo = v; }, getItem: (k) => k === 'financas.v1' ? salvo : null, removeItem: () => {} };
sandbox.document = { documentElement: { setAttribute: () => {} } };
carrega('assets/js/store.js');
sandbox.Store.load();
sandbox.Store.goals.deposit('g1', 100, { proposalId: 'g1|2026-09', at: '2026-09-25' });
sandbox.Store.goals.deposit('g1', 100, { proposalId: 'g1|2026-09', at: '2026-09-25' });
ok(sandbox.Store.goals.get('g1').saved === 100, 'confirmação repetida duplicou o depósito');

if (falhas.length) { console.error(falhas.map((f) => 'FALHA: ' + f).join('\n')); process.exit(1); }
console.log('OK - normalização, categorização, recorrências e metas assistidas');
