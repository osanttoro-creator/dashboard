/* =============================================================
   fatura-escolhida.js — a fatura que a pessoa escolheu
   -------------------------------------------------------------
   POR QUE ESTE TESTE EXISTE

   Até 14/10/2026 o seletor de fatura numa despesa no crédito era
   decorativo: a lista mostrava faturas passadas, mas a escolha era
   desfeita a cada recálculo e o salvamento recusava qualquer fatura
   diferente da que a DATA indicava. A causa não era a interface — era
   o modelo: a fatura de um lançamento saía exclusivamente da data, e
   não havia onde guardar outra resposta.

   Agora existe `faturaRef`. Como ele muda a que fatura uma despesa
   pertence, ele mexe em dinheiro: total da fatura, quanto falta
   pagar e se ela está quitada. Nada disso pode ser conferido com o
   olho. Daí este teste.

   O QUE ELE GARANTE

   1. Sem escolha, a fatura continua saindo da data — lançamento
      antigo não muda de lugar ao atualizar o aplicativo.
   2. Com escolha, a compra sai da fatura da data e entra na
      escolhida, nas duas pontas (some de uma, aparece na outra).
   3. Pagamento parcial abate certo, e o que falta é o que falta.
   4. Fatura quitada que recebe compra retroativa deixa de estar
      quitada, mas NÃO perde o pagamento já registrado.
   5. Recorrência ignora a escolha: cada ocorrência tem data própria,
      e uma referência só jogaria o ano inteiro na mesma fatura.

   O QUE ELE NÃO CONFERE

   Não abre navegador e não grava no Supabase. Ele prova a conta, não
   a sincronização.
   ============================================================= */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const raiz = path.resolve(__dirname, '../..');

/* Um localStorage de mentira: o Store guarda nele, e aqui ninguém
   precisa do que ficou guardado. */
const memoria = new Map();
const context = {
  console, Date, Intl, Math, Number, String, Array, Object, Set, Map, JSON, isNaN, parseInt, parseFloat,
  localStorage: {
    getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
    setItem: (k, v) => memoria.set(k, String(v)),
    removeItem: (k) => memoria.delete(k)
  },
  setTimeout, clearTimeout,
  crypto: { randomUUID: () => 'id-' + Math.random().toString(36).slice(2, 10) }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
for (const arquivo of ['assets/js/utils.js', 'assets/js/store.js', 'assets/js/calc.js']) {
  vm.runInContext(fs.readFileSync(path.join(raiz, arquivo), 'utf8'), context, { filename: arquivo });
}
const { Calc, Store, U } = context;

/* ---------- um perfil montado à mão ----------
   Cartão que fecha dia 8 e vence dia 15. Com isso:
   · compra em 05/10 cai na fatura de outubro;
   · compra em 20/10 cai na fatura de novembro. */
const cartao = { id: 'cartao1', name: 'Itaú Click', bank: 'Itaú', closingDay: 8, dueDay: 15, limit: 2500 };

function perfil(transactions, invoices) {
  return {
    id: 'p1', name: 'Teste', updatedAt: 1,
    accounts: [{ id: 'conta1', name: 'Conta', bank: 'Itaú', openedAt: '2026-01-01', opening: 0 }],
    cards: [cartao],
    categories: [{ id: 'cat1', name: 'Compras', kind: 'expense' }],
    transactions: transactions.map((t) => Store.normalizeTx(t)),
    investments: [], goals: [], budgets: {},
    invoices: invoices || {}
  };
}

const compra = (extra) => Object.assign({
  id: 'tx' + Math.random().toString(36).slice(2, 8),
  kind: 'expense', description: 'Compra', amount: 100,
  cardId: 'cartao1', categoryId: 'cat1', confirmed: true
}, extra);

const fatura = (prof, ref) => Calc.invoice('cartao1', ref, prof);
const somaDe = (prof, ref) => fatura(prof, ref).planned;

/* ---------- 1 · sem escolha, manda a data ---------- */
{
  const p = perfil([
    compra({ date: '2026-10-05', amount: 100 }),
    compra({ date: '2026-10-20', amount: 50 })
  ]);
  assert.equal(somaDe(p, '2026-10'), 100, 'compra de 05/10 pertence à fatura de outubro');
  assert.equal(somaDe(p, '2026-11'), 50, 'compra de 20/10 pertence à fatura de novembro');
  /* Dado antigo não tem o campo, e a ausência não pode virar escolha. */
  assert.equal(p.transactions[0].faturaRef, null, 'sem escolha, o campo fica vazio');
}

/* ---------- 2 · com escolha, a compra muda de fatura ---------- */
{
  const p = perfil([
    compra({ date: '2026-10-20', amount: 50, faturaRef: '2026-09' })
  ]);
  assert.equal(p.transactions[0].faturaRef, '2026-09', 'a escolha é guardada');
  assert.equal(somaDe(p, '2026-09'), 50, 'a compra entra na fatura escolhida');
  assert.equal(somaDe(p, '2026-11'), 0, 'e sai da fatura que a data indicava');
  /* A data da compra continua sendo a data da compra: mudar a fatura
     não pode reescrever quando o dinheiro foi gasto. */
  assert.equal(p.transactions[0].date, '2026-10-20', 'a data da compra não é reescrita');
}

/* ---------- 3 · pagamento parcial abate o que abate ---------- */
{
  const p = perfil(
    [compra({ date: '2026-10-05', amount: 1000 })],
    { 'cartao1|2026-10': { pagamentos: [{ amount: 400, at: '2026-10-12', accountId: 'conta1' }] } }
  );
  const f = fatura(p, '2026-10');
  assert.equal(f.planned, 1000, 'total da fatura');
  assert.equal(f.pago, 400, 'o que já foi pago');
  assert.equal(f.restante, 600, 'o que falta pagar');
  assert.equal(f.paid, false, 'fatura com saldo devedor não é fatura paga');
  assert.equal(f.parcial, true, 'e ela sabe que está parcialmente paga');
}

/* ---------- 4 · fatura quitada que recebe compra retroativa ---------- */
{
  const pagamento = [{ amount: 982.10, at: '2026-09-15', accountId: 'conta1' }];

  const antes = perfil(
    [compra({ date: '2026-09-05', amount: 982.10 })],
    { 'cartao1|2026-09': { pagamentos: pagamento } }
  );
  const fAntes = fatura(antes, '2026-09');
  assert.equal(fAntes.paid, true, 'antes da compra retroativa, a fatura está quitada');
  assert.equal(fAntes.restante, 0, 'e não falta nada');

  /* A mesma fatura, agora com uma compra lançada hoje e atribuída a
     ela. É o caso que o OAZE não deixava fazer. */
  const depois = perfil(
    [compra({ date: '2026-09-05', amount: 982.10 }),
     compra({ date: '2026-10-14', amount: 148.90, faturaRef: '2026-09' })],
    { 'cartao1|2026-09': { pagamentos: pagamento } }
  );
  const fDepois = fatura(depois, '2026-09');
  assert.equal(fDepois.planned, 1131, 'o total sobe pelo valor da compra');
  assert.equal(fDepois.pago, 982.10, 'O PAGAMENTO ANTERIOR CONTINUA LÁ, INTACTO');
  assert.equal(fDepois.pagamentos.length, 1, 'e continua sendo um pagamento registrado');
  assert.equal(fDepois.restante, 148.90, 'passa a faltar exatamente a compra nova');
  assert.equal(fDepois.paid, false, 'a fatura deixa de estar quitada');
  /* E a compra não pode aparecer duas vezes: ela saiu de outubro. */
  assert.equal(somaDe(depois, '2026-10'), 0, 'a compra não fica também na fatura da data');
}

/* ---------- 5 · recorrência ignora a escolha ---------- */
{
  const p = perfil([
    compra({ date: '2026-10-05', amount: 30, recurring: true, faturaRef: '2026-09' })
  ]);
  assert.equal(p.transactions[0].faturaRef, null,
    'numa recorrência a escolha é descartada na normalização');
  assert.equal(somaDe(p, '2026-10'), 30, 'cada ocorrência segue a própria data');
  assert.equal(somaDe(p, '2026-11'), 30, 'inclusive nos meses seguintes');
}

/* ---------- 6 · a escolha só vale em despesa de cartão ---------- */
{
  const p = perfil([
    { id: 'tx9', kind: 'expense', description: 'Débito', amount: 10,
      date: '2026-10-20', accountId: 'conta1', categoryId: 'cat1', confirmed: true, faturaRef: '2026-09' }
  ]);
  assert.equal(p.transactions[0].faturaRef, null,
    'despesa no débito não tem fatura para escolher');
}

console.log('Fatura escolhida: data, escolha, parcial, retroativa em fatura paga e recorrência protegidas.');
