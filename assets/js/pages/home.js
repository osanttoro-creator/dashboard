/* =============================================================
   pages/home.js — Página 1 · Início (dashboard)
   ============================================================= */
(function (global) {
  'use strict';

  const el = U.el;
  const Home = {};

  Home.render = function () {
    const ym = App.ym;
    renderKpis(ym);
    renderYearLine(ym);        // o ano ocupa a área maior, à esquerda
    renderCategoryPie(ym);
    renderWallet(ym);
    renderYearIncomeExpense(ym);
  };

  /* ---------------- 1 · KPIs ---------------- */

  function renderKpis(ym) {
    const t = Calc.monthTotals(ym);
    const prev = Calc.monthTotals(U.addMonths(ym, -1));
    const opening = Calc.openingBalanceOfMonth(ym);
    const closing = U.round2(opening + t.balance);
    const monthEnd = U.monthEnd(ym);

    const invested = Calc.investedTotal(monthEnd);
    const contributed = Calc.contributedTotal(monthEnd);
    const gain = U.round2(invested - contributed);

    const pct = (cur, old) => (old > 0 ? ((cur - old) / old) * 100 : null);

    UI.renderKpis('homeKpis', [
      {
        label: 'Saldo inicial do mês',
        value: U.fmtBRL(opening),
        valueClass: U.signClass(opening),
        accent: 'var(--muted)',
        delta: 'Fechamento de ' + U.monthLabel(U.addMonths(ym, -1), true)
      },
      {
        label: 'Receita do mês',
        value: U.fmtBRL(t.income),
        accent: 'var(--income)',
        delta: U.deltaHtml(pct(t.income, prev.income), true) +
          ' <span class="muted">vs. mês anterior</span>' +
          (t.pendingIncome > 0 ? ` <span class="badge badge-pend">+ ${U.fmtBRL(t.pendingIncome)} previsto</span>` : '')
      },
      {
        label: 'Despesas do mês',
        value: U.fmtBRL(t.expense),
        accent: 'var(--expense)',
        delta: U.deltaHtml(pct(t.expense, prev.expense), false) +
          ' <span class="muted">vs. mês anterior</span>' +
          (t.pendingExpense > 0 ? ` <span class="badge badge-pend">+ ${U.fmtBRL(t.pendingExpense)} previsto</span>` : '')
      },
      {
        label: 'Saldo final do mês',
        value: U.fmtBRL(closing),
        valueClass: U.signClass(closing),
        accent: closing >= 0 ? 'var(--good)' : 'var(--critical)',
        hero: true,
        delta: `<span class="${U.signClass(t.balance)}">${t.balance >= 0 ? '+' : ''}${U.fmtBRL(t.balance)}</span> <span class="muted">no mês</span>`
      },
      {
        label: 'Total de investimentos',
        value: U.fmtBRL(invested),
        accent: 'var(--invest)',
        delta: contributed > 0
          ? `${U.deltaHtml(((invested - contributed) / contributed) * 100, true)} <span class="muted">sobre ${U.fmtBRL(contributed)} aportados</span>`
          : '<span class="muted">Nenhum aporte registrado</span>'
      }
    ]);
    void gain;
  }

  /* ---------------- 2 · pizza de categorias ---------------- */

  function renderCategoryPie(ym) {
    const rows = Calc.expenseTotalsByMethod(U.monthStart(ym), U.monthEnd(ym));
    const total = U.sum(rows, (r) => r.total);
    const title = document.getElementById('homePieTitle');
    const note = document.getElementById('homePieNote');

    if (!rows.length) {
      title.textContent = 'Gastos por categoria';
      note.textContent = U.monthLabel(ym);
      UI.toggleEmptyOverlay('catPieEmpty', true);
      Charts.destroy('chartCatPie');
      U.clear(document.getElementById('catRankList'));
      return;
    }
    UI.toggleEmptyOverlay('catPieEmpty', false);

    // título como insight, não como rótulo
    const top = rows[0];
    title.textContent = `${top.name} concentra ${U.fmtPct(top.pct, 0)} dos gastos`;
    note.textContent = `${U.monthLabel(ym)} · ${U.fmtBRL(total)} confirmados`;

    // pizza cheia em 3D (ver charts.js): a lista abaixo carrega os números
    Charts.pie3d('chartCatPie', Calc.topCategories(rows, 6), { legendPosition: 'bottom' });

    // Lista ranqueada — carrega os valores que a pizza não rotula, com o
    // ícone da categoria e a quebra débito × crédito na própria barra.
    const list = U.clear(document.getElementById('catRankList'));
    const max = rows[0].total || 1;
    rows.slice(0, 8).forEach((r) => {
      const wDeb = (r.debit / max) * 100;
      const wCre = (r.credit / max) * 100;
      const bar = el('span', {
        class: 'rank-bar',
        title: `Débito ${U.fmtBRL(r.debit)} · Crédito ${U.fmtBRL(r.credit)}`
      }, [
        r.debit > 0 ? el('i', { style: { width: wDeb + '%', background: r.color } }) : null,
        r.credit > 0 ? el('i', { class: 'is-credit', style: { width: wCre + '%', background: r.color } }) : null
      ].filter(Boolean));

      list.appendChild(el('li', {}, [
        Icons.categoryBadge(r.id === '__none__' ? null : r.id, 22),
        el('span', { class: 'rank-name', text: r.name }),
        el('span', { class: 'rank-val', text: U.fmtBRL(r.total) }),
        el('span', { class: 'rank-pct', text: U.fmtPct(r.pct, 0) }),
        bar
      ]));
    });

    // legenda do padrão: sólido = débito, hachurado = crédito
    const anyCredit = rows.some((r) => r.credit > 0);
    if (anyCredit) {
      list.appendChild(el('li', { class: 'rank-legend' }, [
        el('span'),
        el('span', { class: 'legend-icons', style: { gridColumn: '2 / -1', marginTop: '2px' } }, [
          el('span', {}, [el('i', { class: 'swatch-solid' }), document.createTextNode('Débito (conta)')]),
          el('span', {}, [el('i', { class: 'swatch-hatch' }), document.createTextNode('Crédito (cartão)')])
        ])
      ]));
    }
  }

  /* ---------------- 3 · carteira (débito + crédito) ---------------- */

  /**
   * A carteira do Início mostra os dois lados: contas de débito e cartões
   * de crédito, no mesmo formato. Ao lado, o detalhe do que está em foco.
   */
  function renderWallet(ym) {
    const box = U.clear(document.getElementById('homeCards'));
    const prof = Store.profile();
    const upto = App.balanceDate();

    if (!prof.accounts.length && !prof.cards.length) {
      box.appendChild(el('div', { class: 'empty-note' }, [
        document.createTextNode('Sua carteira está vazia. '),
        el('button', { class: 'btn btn-outline btn-sm', text: 'Cadastrar conta', onclick: () => Forms.openAccount() }),
        document.createTextNode(' '),
        el('button', { class: 'btn btn-outline btn-sm', text: 'Cadastrar cartão', onclick: () => Forms.openCard() })
      ]));
      return;
    }

    if (prof.accounts.length) {
      box.appendChild(walletBlock('Contas — débito', 'landmark',
        Cards.accountDeck(prof.accounts, upto, { limit: 3 }),
        `Saldo somado ${U.fmtBRL(Calc.totalAccountsBalance(upto))} em ${U.fmtDateBR(upto)}`,
        prof.accounts.length - 3));
    }

    if (prof.cards.length) {
      if (!prof.cards.some((c) => c.id === App.cardFocusId)) App.cardFocusId = prof.cards[0].id;
      const card = Store.cards.get(App.cardFocusId);
      const ref = Calc.currentInvoiceRef(card, ym);
      const inv = Calc.invoice(card.id, ref);

      const deck = Cards.deck(prof.cards, ym, {
        limit: 3,
        focusedId: App.cardFocusId,
        onClick: (c) => { App.cardFocusId = c.id; renderWallet(ym); }
      });
      const bloco = walletBlock('Cartões — crédito', 'credit-card', deck,
        `${card.name} · fatura de ${U.monthLabel(ref)}: ${U.fmtBRL(inv.planned)} · vence ${U.fmtDateBR(inv.dueDate)}`,
        prof.cards.length - 3);

      bloco.appendChild(el('div', { class: 'row gap-6', style: { flexWrap: 'wrap', marginTop: '4px' } }, [
        !inv.paid && inv.planned > 0
          ? el('button', {
            class: 'btn btn-outline btn-sm', text: 'Pagar fatura',
            onclick: () => Forms.openInvoicePayment(card.id, ref)
          })
          : null,
        el('button', {
          class: 'btn btn-ghost btn-sm', text: 'Ver itens da fatura →',
          onclick: () => App.goTo('accounts', { tab: 'cards', cardId: card.id, invoiceRef: ref })
        })
      ].filter(Boolean)));
      box.appendChild(bloco);
    }
  }

  function walletBlock(titulo, icone, deck, resumo, sobrando) {
    const bloco = el('div', { style: { display: 'grid', gap: '2px', marginBottom: '4px' } }, [
      el('div', { class: 'tx-section-head' }, [
        Icons.lucide(icone, 15),
        el('h3', { text: titulo }),
        el('span', { class: 'sum muted', text: resumo })
      ]),
      deck
    ]);
    if (sobrando > 0) {
      bloco.appendChild(el('p', { class: 'deck-hint', text: `+${sobrando} em "Cartões e Contas".` }));
    }
    return bloco;
  }

  /* ---------------- 4 · saldo acumulado no ano ---------------- */

  function renderYearLine(ym) {
    const year = U.ymParts(ym).y;
    const series = Calc.monthlySeries(`${year}-01`, `${year}-12`);
    const t = Charts.theme();

    document.getElementById('homeYearTitle').textContent = `Evolução do saldo em ${year}`;

    // saldo não é receita nem despesa — a linha usa a terracota de acento
    Charts.lines('chartYearBalance',
      series.map((r) => r.label),
      [{ label: 'Saldo acumulado', color: t.accent, data: series.map((r) => r.cumulative), fill: true }],
      { beginAtZero: false, markers: true });
  }

  /* ---------------- 5 · receitas × despesas no ano ---------------- */

  function renderYearIncomeExpense(ym) {
    const year = U.ymParts(ym).y;
    const series = Calc.monthlySeries(`${year}-01`, `${year}-12`);
    const t = Charts.theme();

    const income = U.sum(series, (r) => r.income);
    const expense = U.sum(series, (r) => r.expense);
    const bal = U.round2(income - expense);
    document.getElementById('home12mTitle').textContent = bal >= 0
      ? `${year} no azul: ${U.fmtBRL(bal)} acumulados`
      : `${year} no vermelho: ${U.fmtBRL(bal)} acumulados`;

    // linha com marcadores: dá para ler o valor de cada mês, não só a curva
    Charts.lines('chartYearIncomeExpense',
      series.map((r) => r.label),
      [
        { label: 'Receitas', color: t.income, data: series.map((r) => r.income) },
        { label: 'Despesas', color: t.expense, data: series.map((r) => r.expense), pointStyle: 'rectRot' }
      ],
      { markers: true });
  }

  global.Home = Home;
})(window);
