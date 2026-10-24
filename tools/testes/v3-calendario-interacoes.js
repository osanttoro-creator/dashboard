'use strict';

/* Calendário V3: o mês precisa mostrar cada movimento editável e o
   quadradinho da agenda só confirma a ocorrência de uma despesa em conta. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('assets/app/app.js');
const css = read('assets/app/calendar.css');

assert.match(app, /l\.events\.filter\(\(e\) => e\.txId\)\.sort\(/,
  'a visão anual deve listar todos os lançamentos editáveis, ordenados por dia');
assert.doesNotMatch(app, /l\.events\.filter\(\(e\) => e\.txId\)\.slice\(0,\s*3\)/,
  'o mês não pode esconder movimentos depois dos três primeiros');
assert.match(app, /v3-cal-mes-entry-name/);
assert.match(app, /data-transaction="\$\{esc\(e\.txId\)\}"/,
  'tocar no lançamento do mês deve abrir a edição');
assert.match(app, /const counted = events\.filter\(\(e\) => e\.tipo !== 'tr'\)/,
  'transferência não deve virar entrada ou saída no resumo do mês');
assert.match(css, /\.v3-cal-mes-edicoes button\{display:grid;grid-template-columns:minmax\(0,1fr\) auto/,
  'nome e valor devem caber na mesma linha');
for (const tone of ['in', 'out', 'tr']) {
  assert.match(css, new RegExp('\\.v3-cal-amount\\.is-' + tone + '(?:\\{|,)'),
    'falta uma cor própria para ' + tone);
}

assert.match(app, /function agendaProximos\(\)/);
assert.match(app, /const upcomingRows = agendaProximos\(\)/,
  'a agenda deve manter lançamentos pagos à vista para permitir desfazer');
assert.match(app, /role="checkbox" aria-checked="\$\{!!r\.confirmado\}"/,
  'o quadradinho precisa anunciar seu estado ao leitor de tela');
assert.match(app, /data-cal-confirm="\$\{esc\(r\.txId\)\}"/,
  'o quadradinho deve apontar para o lançamento específico');
assert.match(app, /const canToggle = r\.tipo === 'out' && r\.txId && source && !source\.cardId/,
  'faturas, receitas e compras no crédito não podem ganhar controle de pago');
assert.match(app, /entry\.cardId \|\| source\.cardId \|\| entry\.cancelado/,
  'o handler precisa repetir a validação antes de gravar');
assert.match(app, /await V3Backend\.mutate\(\(\) => Store\.transactions\.setConfirmed\(id, ym, next\)\)/,
  'a alternância precisa salvar a ocorrência pelo backend');
assert.match(app, /if \(demo\) \{ toast\('Demonstração: nenhum dado foi alterado\.'\); return; \}/,
  'a prévia não pode fingir que gravou o pagamento');
assert.match(css, /\.v3-agenda-check:focus-visible/,
  'o quadradinho precisa de foco visível');

/* O Store e o Calc reais são executados em memória. Não há navegador,
   rede ou dados de conta: isto prova o isolamento entre duas ocorrências. */
const memory = new Map();
const context = { console, Intl, Date, URL, setTimeout, clearTimeout,
  localStorage: {
    getItem: (key) => memory.get(key) || null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key)
  },
  document: { documentElement: { setAttribute() {} } }
};
context.window = context;
vm.createContext(context);
for (const file of ['assets/js/utils.js', 'assets/js/store.js', 'assets/js/calc.js']) {
  vm.runInContext(read(file), context, { filename: file });
}

context.Store.loadRemoteMap({ test: {
  id: 'test', name: 'Teste',
  accounts: [{ id: 'account', name: 'Conta', bank: 'Banco', considerado: true }],
  cards: [{ id: 'card', name: 'Cartão', bank: 'Banco', considerado: true }],
  categories: [{ id: 'expense', name: 'Despesa', kind: 'expense' }],
  transactions: [
    { id: 'rent', kind: 'expense', description: 'Aluguel', amount: 100,
      date: '2099-01-15', accountId: 'account', categoryId: 'expense', recurring: true,
      confirmed: false, occ: {} },
    { id: 'credit', kind: 'expense', description: 'Compra no crédito', amount: 20,
      date: '2099-01-17', cardId: 'card', categoryId: 'expense', confirmed: false }
  ],
  investments: [], invoices: {}, goals: [], budgets: {}
} }, 'Teste', 'test');

const occurrence = (ym) => context.Calc.entriesForMonth(ym)
  .find((entry) => entry.txId === 'rent');
assert.equal(occurrence('2099-01').confirmed, false);
assert.equal(occurrence('2099-02').confirmed, false);
const events = (ym) => Object.values(context.Calc.calendarEvents(ym)).flat();
assert.equal(events('2099-01').find((event) => event.txId === 'rent').confirmado, false,
  'despesa recorrente não paga deve aparecer prevista na agenda');
assert.equal(events('2099-02').find((event) => event.txId === 'rent').confirmado, false,
  'a ocorrência futura também deve aparecer, sem antecipar pagamento');

/* A UI inteira é carregada sem iniciar o boot: expomos apenas a visão
   anual para conferir o HTML real que o aplicativo gera. */
context.document.documentElement.dataset = { oazeMode: 'live' };
context.document.readyState = 'loading';
context.document.addEventListener = () => {};
const calendarApp = app.replace(/\}\)\(window\);\s*$/, 'window.__calendarTest = { state, calendarioAno, agendaProximos }; })(window);');
assert.notEqual(calendarApp, app, 'o teste deve conseguir instrumentar o app real');
vm.runInContext(calendarApp, context, { filename: 'assets/app/app.js' });
context.__calendarTest.state.ym = '2099-01';
const yearMarkup = context.__calendarTest.calendarioAno();
assert.match(yearMarkup, /data-transaction="rent"[^>]*>[\s\S]*?Aluguel[\s\S]*?− R\$ 100,00/,
  'o mês precisa exibir nome e valor da despesa pendente no mesmo botão editável');
assert.match(yearMarkup, /data-transaction="credit"[^>]*>[\s\S]*?Compra no crédito[\s\S]*?− R\$ 20,00/,
  'as compras no crédito também precisam figurar na lista mensal');
assert.match(context.__calendarTest.agendaProximos().map((event) => event.titulo).join('|'), /Aluguel/,
  'a agenda rápida deve incluir o lançamento não pago');

/* Executa o handler original em ambiente isolado, substituindo só os
   efeitos de rede/DOM. O Store e o Calc continuam sendo os reais. */
const start = app.indexOf('  async function toggleAgendaPaid(target) {');
const end = app.indexOf('  function agendaRecorrencias()', start);
assert.ok(start >= 0 && end > start, 'handler de confirmação rápida não encontrado');
let saves = 0;
const messages = [];
const handlerContext = {
  Store: context.Store,
  V3Backend: { mutate: async (change) => { saves++; change(); } },
  state: { ym: '2099-01' },
  statusBusy: false,
  demo: false,
  sample: {},
  ymOf: (date) => String(date).slice(0, 7),
  currentTransactions: () => context.Calc.entriesForMonth(handlerContext.state.ym, null, { incluirCancelados: true })
    .map((entry) => ({ ...entry, id: entry.txId })),
  toast: (message) => messages.push(message),
  render: () => {},
  document: { querySelectorAll: () => [] }
};
vm.createContext(handlerContext);
vm.runInContext(app.slice(start, end) + '\nglobalThis.toggleAgendaPaid = toggleAgendaPaid;', handlerContext);

(async () => {
  const target = (id) => ({ dataset: { calConfirm: id, calConfirmMonth: '2099-01' }, disabled: false });
  await handlerContext.toggleAgendaPaid(target('rent'));
  assert.equal(saves, 1, 'o clique deve salvar pelo backend exatamente uma vez');
  assert.equal(occurrence('2099-01').confirmed, true, 'o mês escolhido deve ficar pago');
  assert.equal(occurrence('2099-02').confirmed, false, 'o mês seguinte deve permanecer previsto');
  assert.equal(events('2099-01').find((event) => event.txId === 'rent').confirmado, true,
    'a agenda recalculada deve refletir o pagamento');
  assert.equal(context.Store.transactions.get('credit').confirmed, false,
    'confirmar o aluguel não altera compra no crédito');

  await handlerContext.toggleAgendaPaid(target('rent'));
  assert.equal(saves, 2);
  assert.equal(occurrence('2099-01').confirmed, false,
    'o segundo clique deve desfazer o pagamento sem tocar outras ocorrências');
  await handlerContext.toggleAgendaPaid(target('credit'));
  assert.equal(saves, 2, 'compra no crédito não deve ser confirmada pelo quadradinho da agenda');
  assert.ok(messages.some((message) => /Não foi possível alterar/.test(message)),
    'o caso inelegível precisa explicar que deve ser aberto para revisão');
  console.log('OK — calendário mensal editável, pendências e confirmação rápida isolada por ocorrência.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
