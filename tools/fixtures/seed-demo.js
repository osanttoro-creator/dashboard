/* =============================================================
   tools/fixtures/seed-demo.js — dados fictícios PARA TESTE
   ------------------------------------------------------------
   ISTO NÃO FAZ PARTE DO APLICATIVO. O index.html não carrega este
   arquivo, o build de arquivo único não o embute e ele não vai
   para a hospedagem. Existe só para as capturas de tela e os
   testes automatizados, injetado pelo servidor de teste.

   Antes ele era Store.seedDemo, chamado por três botões dentro do
   produto. Dado fictício dentro da conta de alguém é pior do que
   parece: some entre os lançamentos reais, entra nos gráficos,
   entra na sincronização e vai junto para os outros aparelhos.

   Uso:  <script src="tools/fixtures/seed-demo.js"></script>
         OazeFixture.semear();
   ============================================================= */
(function (global) {
  'use strict';

  const Fixture = {};

  Fixture.semear = function () {
    const p = Store.profile();
    const catE = (n) => (p.categories.find((c) => c.kind === 'expense' && c.name === n) || {}).id || null;
    const catI = (n) => (p.categories.find((c) => c.kind === 'income' && c.name === n) || {}).id || null;

    // as contas "nascem" no início da janela histórica que vamos popular
    const openedAt = U.addMonths(U.todayYM(), -11) + '-01';

    let acc = p.accounts[0];
    if (!acc) {
      acc = Store.accounts.add({
        name: 'Conta corrente', bank: 'Itaú', type: 'Conta corrente', color: '#9A5F35',
        gradient: 'terracotta', last4: '2210',
        openingBalance: 3500, openedAt, archived: false
      });
    } else {
      if (!acc.openingBalance) acc.openingBalance = 3500;
      acc.openedAt = openedAt;
    }
    const acc2 = Store.accounts.add({
      name: 'Reserva', bank: 'Nubank', type: 'Conta de pagamento', color: '#7B5A8E',
      gradient: 'midnight', last4: '9034',
      openingBalance: 22000, openedAt, archived: false
    });
    const card = Store.cards.add({
      name: 'Cartão principal', bank: 'Nubank', color: '#7B5A8E', gradient: 'midnight', last4: '4352',
      limit: 8000, closingDay: 28, dueDay: 8, accountId: acc.id
    });
    Store.cards.add({
      name: 'Cartão da viagem', bank: 'Itaú', color: '#9A5F35', gradient: 'terracotta', last4: '8871',
      limit: 4000, closingDay: 15, dueDay: 25, accountId: acc.id
    });

    const today = U.todayISO();
    const ym = U.todayYM();
    const start = U.addMonths(ym, -11) + '-01';
    const d = (offsetMonths, day) => {
      const q = U.ymParts(U.addMonths(ym, offsetMonths));
      return U.isoOf(q.y, q.m, U.clampDay(q.y, q.m, day));
    };

    const txs = [
      { kind: 'income', description: 'Salário', amount: 7800, date: start, categoryId: catI('Salário'), accountId: acc.id, recurring: true, confirmed: true },
      { kind: 'expense', description: 'Aluguel', amount: 2200, date: start, categoryId: catE('Moradia'), accountId: acc.id, recurring: true, confirmed: true },
      { kind: 'expense', description: 'Internet + celular', amount: 189.9, date: U.addMonths(ym, -11) + '-10', categoryId: catE('Assinaturas'), accountId: acc.id, recurring: true, confirmed: true },
      { kind: 'expense', description: 'Plano de saúde', amount: 640, date: U.addMonths(ym, -11) + '-15', categoryId: catE('Saúde'), accountId: acc.id, recurring: true, confirmed: true },
      { kind: 'expense', description: 'Academia', amount: 129, date: U.addMonths(ym, -11) + '-05', categoryId: catE('Lazer'), accountId: acc.id, recurring: true, confirmed: true }
    ];
    // variáveis dos últimos 6 meses
    const varSpecs = [
      ['Supermercado', 'Alimentação', 620, 980, 'account'],
      ['Combustível', 'Transporte', 180, 420, 'card'],
      ['Restaurante', 'Alimentação', 90, 260, 'card'],
      ['Farmácia', 'Saúde', 40, 190, 'card'],
      ['Streaming', 'Assinaturas', 39.9, 59.9, 'card'],
      ['Compras online', 'Compras', 120, 700, 'card']
    ];
    for (let k = -5; k <= 0; k++) {
      varSpecs.forEach((s, idx) => {
        const amount = U.round2(s[2] + Math.random() * (s[3] - s[2]));
        txs.push({
          kind: 'expense', description: s[0], amount, date: d(k, 3 + idx * 4),
          categoryId: catE(s[1]), accountId: s[4] === 'card' ? null : acc.id,
          cardId: s[4] === 'card' ? card.id : null,
          confirmed: k < 0 ? true : Math.random() > 0.35
        });
      });
      if (k % 2 === 0) {
        txs.push({
          kind: 'income', description: 'Projeto freelance', amount: U.round2(900 + Math.random() * 2400),
          date: d(k, 18), categoryId: catI('Freelance / PJ'), accountId: acc.id, confirmed: k < 0
        });
      }
    }
    // dois lançamentos previstos no mês corrente
    txs.push({ kind: 'expense', description: 'IPTU (parcela)', amount: 312.4, date: d(0, 20), categoryId: catE('Impostos e taxas'), accountId: acc.id, confirmed: false });
    txs.push({ kind: 'income', description: 'Reembolso viagem', amount: 480, date: d(0, 25), categoryId: catI('Reembolso'), accountId: acc.id, confirmed: false });
    txs.push({ kind: 'transfer', description: 'Aporte na reserva', amount: 1000, date: d(0, 6), accountId: acc.id, toAccountId: acc2.id, confirmed: true });

    Store.profile().transactions = Store.profile().transactions.concat(txs.map(Store.normalizeTx));

    [['Tesouro Selic 2029', 'Tesouro Direto', 6000, -10, 11.5],
     ['CDB 110% CDI', 'CDB', 4500, -7, 12.2],
     ['ETF IVVB11', 'ETF', 3200, -5, 14],
     ['Bitcoin', 'Criptomoeda', 1500, -3, 20]].forEach((iv) => {
      const q = U.ymParts(U.addMonths(ym, iv[3]));
      Store.profile().investments.push({
        id: U.uid('inv'), name: iv[0], type: iv[1], amount: iv[2],
        date: U.isoOf(q.y, q.m, 10), rate: iv[4], currentValue: null, accountId: acc2.id, notes: ''
      });
    });

    // fatura do mês anterior já paga
    const prevRef = U.addMonths(ym, -1);
    Store.profile().invoices[Store.invoiceKey(card.id, prevRef)] = {
      paid: true, paidAt: U.monthStart(prevRef), accountId: acc.id, amount: 0
    };

    /* Orçamento e metas de exemplo. Sem eles as páginas nasceriam
       vazias na demonstração e o recurso pareceria não existir.
       Os limites saem do gasto médio real que acabamos de criar,
       um pouco apertados de propósito — orçamento folgado não
       ensina nada. */
    const mediaDe = (catId) => {
      let soma = 0, meses = 0;
      for (let i = 1; i <= 3; i++) {
        const ym = U.addMonths(U.todayYM(), -i);
        const de = U.monthStart(ym), ate = U.monthEnd(ym);
        soma += p.transactions
          .filter((t) => t.categoryId === catId && t.kind === 'expense' && t.date >= de && t.date <= ate)
          .reduce((a, b) => a + b.amount, 0);
        meses++;
      }
      return meses ? U.round2(soma / meses) : 0;
    };
    ['Moradia', 'Alimentação', 'Transporte', 'Lazer'].forEach((nome) => {
      const id = catE(nome);
      if (!id) return;
      const m = mediaDe(id);
      if (m > 0) p.budgets[id] = U.round2(Math.ceil((m * 0.95) / 10) * 10);
    });

    if (!p.goals.length) {
      const hoje = new Date();
      const emMeses = (n) => U.toISO(new Date(hoje.getFullYear(), hoje.getMonth() + n, 15));
      p.goals.push(
        { id: U.uid('goal'), name: 'Reserva de emergência', target: 30000, saved: 12400,
          deadline: emMeses(12), color: '#3B6558', icon: 'shield', accountId: null, createdAt: U.todayISO() },
        { id: U.uid('goal'), name: 'Viagem', target: 12000, saved: 4200,
          deadline: emMeses(8), color: '#B07C3E', icon: 'plane', accountId: null, createdAt: U.todayISO() },
        { id: U.uid('goal'), name: 'Troca do notebook', target: 8000, saved: 8000,
          deadline: null, color: '#34557A', icon: 'target', accountId: null, createdAt: U.todayISO() }
      );
    }

    Store.commit('seed');
    return today;
  };

  global.OazeFixture = Fixture;
})(window);
