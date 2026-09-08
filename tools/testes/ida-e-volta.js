/* =============================================================
   ida-e-volta.js — o perfil sobrevive ao banco?
   -------------------------------------------------------------
   Repo.mapa traduz o perfil do app para linhas do Postgres.
   Repo.carregarEspaco faz o caminho inverso. São cerca de sessenta
   campos, com nomes diferentes dos dois lados (openingBalance vira
   saldo_inicial, categoryId vira category_id, e assim por diante).

   POR QUE ESTE TESTE EXISTE
   Um nome trocado nesse mapeamento não quebra nada. Não há erro,
   não há exceção, não há nada no console: o campo simplesmente
   volta indefinido, o app usa o padrão, e o usuário descobre meses
   depois que o limite do cartão dele é zero. Revisar duas listas
   de sessenta itens à mão não pega isso -- os olhos deslizam.

   O que pega é fechar o ciclo e comparar: perfil → linhas →
   perfil. Se o que volta não é igual ao que foi, o teste diz qual
   campo e com que valor.

   COMO RODAR
     node tools/testes/ida-e-volta.js
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.resolve(__dirname, '..', '..');

/* ---------------------------------------------------------------
   1 · o mínimo do ambiente do navegador que o repo.js usa
   --------------------------------------------------------------- */
const U = {
  todayISO: () => '2026-09-07',
  isValidISO: (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s),
  round2: (n) => Math.round((+n || 0) * 100) / 100,
  uid: (p) => p + '_teste'
};

const sandbox = {
  console, setTimeout, clearTimeout, Promise,
  navigator: { onLine: true, userAgent: 'node' },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  U
};
sandbox.window = sandbox;
sandbox.global = sandbox;

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'assets', 'js', 'repo.js'), 'utf8'),
  sandbox, { filename: 'repo.js' });

const Repo = sandbox.Repo;

/* ---------------------------------------------------------------
   2 · o perfil de prova
   ---------------------------------------------------------------
   Escolhido para exercitar o que costuma quebrar, não para ser
   bonito: ligações cruzadas, campos opcionais nulos, um valor
   falsy que não é ausência (limite 0, taxa 0), acentos, e uma
   fatura de cartão que aponta para conta. */
const perfilOriginal = {
  id: 'prf_1',
  name: 'Pessoal',
  accounts: [
    { id: 'acc_1', name: 'Nubank', bank: 'Nubank', type: 'Conta corrente',
      color: '#8A05BE', gradient: null, last4: '1234',
      openingBalance: 1250.75, openedAt: '2024-01-15', archived: false },
    { id: 'acc_2', name: 'Reserva', bank: 'Inter', type: 'Poupança',
      color: '#FF7A00', gradient: 'linear-gradient(90deg,#a,#b)', last4: '',
      openingBalance: 0, openedAt: '2025-06-01', archived: true }
  ],
  categories: [
    { id: 'cat_1', name: 'Alimentação', kind: 'expense', color: '#C4936A', icon: 'utensils' },
    { id: 'cat_2', name: 'Salário', kind: 'income', color: '#1F6B4F', icon: null }
  ],
  cards: [
    { id: 'card_1', name: 'Nubank Ultravioleta', bank: 'Nubank',
      color: '#4B0082', gradient: null, last4: '9876',
      limit: 5000, closingDay: 28, dueDay: 5, accountId: 'acc_1' },
    /* limite ZERO: um `|| 0` mal colocado no mapeamento devolveria o
       mesmo resultado, mas um `|| 1000` não -- e cartão sem limite
       cadastrado é caso real. */
    { id: 'card_2', name: 'Cartão sem limite', bank: '',
      color: '#333333', gradient: null, last4: '',
      limit: 0, closingDay: 1, dueDay: 10, accountId: null }
  ],
  transactions: [
    { id: 'tx_1', kind: 'expense', description: 'Mercado do mês', amount: 432.19,
      date: '2026-09-03', categoryId: 'cat_1', method: 'card',
      accountId: null, toAccountId: null, cardId: 'card_1',
      recurring: false, recurEnd: null, confirmed: true,
      occ: {}, installment: { n: 3, de: 1 }, notes: 'com acento é importante',
      source: 'import' },
    { id: 'tx_2', kind: 'income', description: 'Salário', amount: 7400,
      date: '2026-09-05', categoryId: 'cat_2', method: 'account',
      accountId: 'acc_1', toAccountId: null, cardId: null,
      recurring: true, recurEnd: '2027-12', confirmed: true,
      occ: { '2026-09': true }, installment: null, notes: '', source: 'manual' },
    { id: 'tx_3', kind: 'transfer', description: 'Para a reserva', amount: 500,
      date: '2026-09-06', categoryId: null, method: 'account',
      accountId: 'acc_1', toAccountId: 'acc_2', cardId: null,
      recurring: false, recurEnd: null, confirmed: false,
      occ: {}, installment: null, notes: '', source: 'manual' }
  ],
  investments: [
    { id: 'inv_1', name: 'Tesouro Selic', type: 'Renda fixa', amount: 10000,
      date: '2025-03-10', rate: 0, currentValue: 11240.55,
      accountId: 'acc_2', notes: 'aporte inicial' },
    { id: 'inv_2', name: 'Sem valor atual', type: 'Ações', amount: 2000,
      date: '2026-01-05', rate: 12.5, currentValue: null,
      accountId: null, notes: '' }
  ],
  goals: [
    { id: 'goal_1', name: 'Viagem', target: 8000, saved: 2350.40,
      deadline: '2027-01-31', color: '#5FD4E8', icon: 'plane', accountId: 'acc_2' },
    { id: 'goal_2', name: 'Sem prazo', target: 1000, saved: 0,
      deadline: null, color: '#A98BFF', icon: 'target', accountId: null }
  ],
  invoices: {
    'card_1|2026-08': { paid: true,  paidAt: '2026-09-05', accountId: 'acc_1', amount: 1832.44 },
    'card_1|2026-09': { paid: false, paidAt: null,         accountId: null,    amount: 432.19 }
  },
  budgets: { cat_1: 900 }
};

/* ---------------------------------------------------------------
   3 · o banco de mentira
   ---------------------------------------------------------------
   Guarda o que o upsert manda e devolve nas leituras. Não valida
   nada: quem valida é o Postgres, e o que este teste mede é o
   mapeamento, não o banco.

   O uuid é derivado do legacy_id de propósito. Assim uma ligação
   perdida aparece como null no resultado, e não como um uuid
   plausível que passaria despercebido. */
function bancoDeMentira() {
  const tabelas = {};
  const uuidDe = (t, legacy) => 'uuid-' + t + '-' + legacy;

  function tabela(nome) {
    if (!tabelas[nome]) tabelas[nome] = [];
    return tabelas[nome];
  }

  function consulta(nome) {
    let linhas = tabela(nome).slice();
    const q = {
      select() { return q; },
      eq() { return q; },
      is() { return q; },
      order() { return q; },
      range() { return q; },
      single: async () => ({ data: linhas[0], error: null }),
      then: (res) => res({ data: linhas, error: null })
    };
    return q;
  }

  return {
    linhas: tabelas,
    from(nome) {
      return {
        select: () => consulta(nome),
        upsert(dados) {
          const arr = Array.isArray(dados) ? dados : [dados];
          const t = tabela(nome);
          arr.forEach((d) => {
            const chave = d.legacy_id != null ? d.legacy_id
              : (d.card_id != null ? d.card_id + '|' + d.referencia : d.category_id);
            const linha = Object.assign({ id: uuidDe(nome, chave), deleted_at: null }, d);
            const i = t.findIndex((x) => x.id === linha.id);
            if (i >= 0) t[i] = linha; else t.push(linha);
          });
          return {
            select: () => ({
              single: async () => ({ data: t[t.length - 1], error: null }),
              then: (res) => res({ data: arr.map((d) => ({
                id: uuidDe(nome, d.legacy_id), legacy_id: d.legacy_id
              })), error: null })
            }),
            then: (res) => res({ data: null, error: null })
          };
        }
      };
    }
  };
}

/* ---------------------------------------------------------------
   4 · a comparação
   --------------------------------------------------------------- */
const falhas = [];

function igual(caminho, a, b) {
  /* null e undefined são a mesma ausência para o app, mas viram
     coisas diferentes na viagem pelo banco. Tratá-los como iguais
     evita um teste que reprova por ruído. */
  const vazio = (v) => v === null || v === undefined || v === '';
  if (vazio(a) && vazio(b)) return;

  if (typeof a === 'number' && typeof b === 'number') {
    if (Math.abs(a - b) > 0.005) falhas.push(caminho + ': ' + a + ' virou ' + b);
    return;
  }
  if (typeof a === 'object' && a && typeof b === 'object' && b) {
    const chaves = new Set(Object.keys(a).concat(Object.keys(b)));
    chaves.forEach((k) => igual(caminho + '.' + k, a[k], b[k]));
    return;
  }
  if (a !== b) falhas.push(caminho + ': ' + JSON.stringify(a) + ' virou ' + JSON.stringify(b));
}

/* Campos que o app tem e o banco não guarda. Excluí-los aqui é uma
   decisão consciente, não uma exceção para o teste passar. */
const NAO_VIAJAM = new Set(['updatedAt', 'workspaceId']);

function comparaLista(nome, antes, depois, chave) {
  if (antes.length !== depois.length) {
    falhas.push(nome + ': eram ' + antes.length + ', voltaram ' + depois.length);
    return;
  }
  const porId = {};
  depois.forEach((x) => { porId[x[chave]] = x; });
  antes.forEach((a) => {
    const b = porId[a[chave]];
    if (!b) { falhas.push(nome + ': sumiu o item ' + a[chave]); return; }
    Object.keys(a).forEach((k) => {
      if (NAO_VIAJAM.has(k)) return;
      igual(nome + '[' + a[chave] + '].' + k, a[k], b[k]);
    });
  });
}

/* ---------------------------------------------------------------
   5 · roda
   --------------------------------------------------------------- */
(async function () {
  const sb = bancoDeMentira();
  sandbox.SupabaseBackend = { cliente: () => sb };

  console.log('');
  console.log('  ida-e-volta — o perfil sobrevive ao banco?');
  console.log('  ' + '-'.repeat(52));

  await Repo.enviarEspaco(perfilOriginal, 'user-teste');
  const wsId = 'uuid-workspaces-prf_1';
  const volta = await Repo.carregarEspaco(wsId, 'Pessoal', 'prf_1');

  comparaLista('contas',        perfilOriginal.accounts,     volta.accounts,     'id');
  comparaLista('categorias',    perfilOriginal.categories,   volta.categories,   'id');
  comparaLista('cartões',       perfilOriginal.cards,        volta.cards,        'id');
  comparaLista('lançamentos',   perfilOriginal.transactions, volta.transactions, 'id');
  comparaLista('investimentos', perfilOriginal.investments,  volta.investments,  'id');
  comparaLista('metas',         perfilOriginal.goals,        volta.goals,        'id');

  igual('invoices', perfilOriginal.invoices, volta.invoices);
  igual('budgets',  perfilOriginal.budgets,  volta.budgets);

  const quantos = [
    ['contas', perfilOriginal.accounts.length],
    ['categorias', perfilOriginal.categories.length],
    ['cartões', perfilOriginal.cards.length],
    ['lançamentos', perfilOriginal.transactions.length],
    ['investimentos', perfilOriginal.investments.length],
    ['metas', perfilOriginal.goals.length],
    ['faturas', Object.keys(perfilOriginal.invoices).length],
    ['orçamentos', Object.keys(perfilOriginal.budgets).length]
  ];
  quantos.forEach(([n, q]) => console.log('    ' + String(q).padStart(3) + '  ' + n));

  console.log('  ' + '-'.repeat(52));
  if (falhas.length) {
    console.log('  ' + falhas.length + ' CAMPO(S) NAO SOBREVIVERAM:');
    falhas.forEach((f) => console.log('    - ' + f));
    console.log('');
    process.exit(1);
  }
  console.log('  todos os campos voltaram iguais');
  console.log('');
})();
