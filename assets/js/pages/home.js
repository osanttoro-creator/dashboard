/* =============================================================
   pages/home.js — Visão geral
   ------------------------------------------------------------
   A ordem responde, de cima para baixo:
     quanto eu tenho · como estou · quanto entrou e saiu ·
     o que o UGLEZ viu · onde o dinheiro foi · o que vem aí ·
     como foi o mês · minha carteira · o que aconteceu.
   ============================================================= */
(function (global) {
  'use strict';

  const el = U.el;
  const Home = {};

  Home.render = function () {
    const ym = App.ym;
    renderHero(ym);
    renderScore(ym);
    renderKpis(ym);
    renderFlow(ym);
    Ug.renderHome(ym);
    renderCategoryPie(ym);
    renderUpcoming(ym);
    renderMonthSummary(ym);
    renderWallet(ym);
    renderRecent(ym);
  };

  /* ---------------- 1 · patrimônio líquido ---------------- */

  function renderHero(ym) {
    const upto = App.balanceDate();
    const total = Calc.netWorth(upto);
    const antes = Calc.netWorth(U.monthEnd(U.addMonths(ym, -1)));
    const dif = U.round2(total - antes);
    const pct = antes !== 0 ? (dif / Math.abs(antes)) * 100 : null;

    UI.setValue('heroValue', U.fmtBRL(total));

    const disponivel = Calc.available(upto);
    const investido = Calc.investedTotal(upto);
    document.getElementById('heroSub').textContent =
      `${U.fmtBRL(disponivel)} disponível · ${U.fmtBRL(investido)} investido · em ${U.fmtDateBR(upto)}`;

    const dir = dif > 0.005 ? 'up' : dif < -0.005 ? 'down' : 'flat';
    const seta = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '→';
    const delta = U.clear(document.getElementById('heroDelta'));
    // a direção está na seta e no sinal; a cor só reforça
    delta.appendChild(el('span', {
      class: 'hero-trend is-' + dir,
      text: `${seta} ${dif >= 0 ? '+' : '−'}${U.fmtBRL(Math.abs(dif))}`
        + (pct != null ? ` (${dif >= 0 ? '+' : '−'}${U.fmtPct(Math.abs(pct), 1)})` : '')
    }));
    delta.appendChild(el('span', { class: 'muted', text: 'desde ' + U.monthLabel(U.addMonths(ym, -1), true) }));

    const meses = [];
    for (let i = 11; i >= 0; i--) meses.push(U.monthEnd(U.addMonths(ym, -i)));
    Charts.spark('chartHeroSpark', meses.map((m) => Calc.netWorth(m)));
  }

  /* ---------------- 2 · OAZE Score ---------------- */

  function renderScore(ym) {
    const s = Calc.score(ym);
    const anel = U.clear(document.getElementById('scoreRing'));
    const partes = U.clear(document.getElementById('scoreParts'));

    const cor = s.total >= 80 ? 'var(--good)' : s.total >= 60 ? 'var(--invest)'
      : s.total >= 40 ? 'var(--warning)' : 'var(--critical)';
    // 2πr com r=38 ≈ 238.8
    const volta = 238.8;

    anel.appendChild(el('svg', { viewBox: '0 0 88 88', width: '108', height: '108', 'aria-hidden': 'true' }, [
      el('circle', { cx: '44', cy: '44', r: '38', class: 'ring-bg' }),
      el('circle', {
        cx: '44', cy: '44', r: '38', class: 'ring-fg',
        style: { stroke: cor, strokeDasharray: String(volta), strokeDashoffset: String(volta * (1 - s.total / 100)) }
      })
    ]));
    anel.appendChild(el('div', { class: 'score-num' }, [
      el('strong', { text: String(s.total) }),
      el('span', { class: 'score-faixa', style: { color: cor }, text: s.faixa })
    ]));

    s.partes.forEach((p) => {
      partes.appendChild(el('li', { class: 'score-part' + (p.ok ? ' is-ok' : ''), title: p.detalhe }, [
        el('span', { class: 'score-dot' }, Icons.lucide(p.ok ? 'check' : 'circle-alert', 12)),
        el('span', { class: 'score-part-name', text: p.nome }),
        el('span', { class: 'score-part-pts', text: p.pontos + '/20' })
      ]));
    });
  }

  /** Explica o score. Um número sem critério não ajuda ninguém. */
  Home.explainScore = function () {
    const s = Calc.score(App.ym);
    UI.openModal({
      title: 'Como o OAZE Score é calculado',
      body: el('div', { style: { fontSize: '13.5px', lineHeight: '1.65' } }, [
        el('p', { text: 'Cinco perguntas, 20 pontos cada, todas respondidas a partir dos seus próprios lançamentos. Nada vem de fora e nada é opinião.' }),
        el('ul', { style: { marginTop: '12px', display: 'grid', gap: '10px' } },
          s.partes.map((p) => el('li', {}, [
            el('strong', { text: p.nome + ' — ' + p.pontos + '/20' }),
            el('br'),
            el('span', { class: 'muted', text: p.detalhe })
          ]))),
        el('p', { style: { marginTop: '14px' }, class: 'muted',
          text: 'Faixas: 80+ excelente · 60+ saudável · 40+ atenção · abaixo de 40, frágil.' })
      ]),
      buttons: [{ label: 'Entendi', class: 'btn-primary', onClick: UI.closeModal }],
      noAutofocus: true
    });
  };

  /* ---------------- 3 · receitas, despesas, disponível ---------------- */

  function renderKpis(ym) {
    const t = Calc.monthTotals(ym);
    const prev = Calc.monthTotals(U.addMonths(ym, -1));
    const pct = (cur, old) => (old > 0 ? ((cur - old) / old) * 100 : null);
    const disponivel = Calc.available(App.balanceDate());

    UI.renderKpis('homeKpis', [
      {
        label: 'Saldo disponível',
        value: U.fmtBRL(disponivel),
        valueClass: U.signClass(disponivel),
        accent: 'var(--accent)',
        delta: '<span class="muted">Em contas, já descontadas as faturas em aberto</span>'
      },
      {
        label: 'Receitas do mês',
        value: U.fmtBRL(t.income),
        accent: 'var(--income)',
        delta: U.deltaHtml(pct(t.income, prev.income), true)
          + ' <span class="muted">vs. mês anterior</span>'
          + (t.pendingIncome > 0 ? ` <span class="badge badge-pend">+ ${U.fmtBRL(t.pendingIncome)} previsto</span>` : '')
      },
      {
        label: 'Despesas do mês',
        value: U.fmtBRL(t.expense),
        accent: 'var(--expense)',
        delta: U.deltaHtml(pct(t.expense, prev.expense), false)
          + ' <span class="muted">vs. anterior</span>'
          + `<span class="split-pill" title="Débito — sai da conta">Déb ${U.fmtBRL(t.expenseDebit)}</span>`
          + `<span class="split-pill is-credit" title="Crédito — entra na fatura">Créd ${U.fmtBRL(t.expenseCredit)}</span>`
      }
    ]);
  }

  /* ---------------- 4 · fluxo financeiro ---------------- */

  function renderFlow(ym) {
    const ano = U.ymParts(ym).y;
    const serie = Calc.monthlySeries(`${ano}-01`, `${ano}-12`);
    const t = Charts.theme();

    const rec = U.round2(U.sum(serie, (r) => r.income));
    const des = U.round2(U.sum(serie, (r) => r.expense));
    document.getElementById('homeFlowTitle').textContent = rec - des >= 0
      ? `${ano}: sobraram ${U.fmtBRL(U.round2(rec - des))}`
      : `${ano}: faltaram ${U.fmtBRL(Math.abs(U.round2(rec - des)))}`;

    Charts.lines('chartFlow', serie.map((r) => r.label), [
      { label: 'Receitas', color: t.income, data: serie.map((r) => r.income) },
      { label: 'Despesas', color: t.expense, data: serie.map((r) => r.expense), pointStyle: 'rectRot' },
      { label: 'Saldo do mês', color: t.accent, data: serie.map((r) => r.balance), dashed: true }
    ], { markers: true, beginAtZero: false });
  }

  /* ---------------- 5 · distribuição de gastos ---------------- */

  function renderCategoryPie(ym) {
    const rows = Calc.expenseTotalsByMethod(U.monthStart(ym), U.monthEnd(ym));
    const total = U.sum(rows, (r) => r.total);
    const title = document.getElementById('homePieTitle');
    const note = document.getElementById('homePieNote');
    const list = U.clear(document.getElementById('catRankList'));

    if (!rows.length) {
      title.textContent = 'Distribuição de gastos';
      note.textContent = U.monthLabel(ym);
      UI.toggleEmptyOverlay('catPieEmpty', true);
      Charts.destroy('chartCatPie');
      return;
    }
    UI.toggleEmptyOverlay('catPieEmpty', false);

    const top = rows[0];
    title.textContent = `${top.name} concentra ${U.fmtPct(top.pct, 0)} dos gastos`;
    note.textContent = `${U.monthLabel(ym)} · ${U.fmtBRL(total)} confirmados`;

    // pizza cheia em 3D (ver charts.js). Os números estão nas peças abaixo.
    Charts.pie3d('chartCatPie', Calc.topCategories(rows, 6), { legendPosition: 'bottom' });

    const max = rows[0].total || 1;
    rows.slice(0, 8).forEach((r) => {
      const wDeb = (r.debit / max) * 100;
      const wCre = (r.credit / max) * 100;
      list.appendChild(el('li', {
        class: 'cat-tile', tabindex: '0',
        title: `${r.name}: ${U.fmtBRL(r.total)} (${U.fmtPct(r.pct, 0)})`
      }, [
        Icons.categoryBadge(r.id === '__none__' ? null : r.id, 30),
        el('span', { class: 'cat-tile-id' }, [
          el('span', { class: 'cat-tile-name', text: r.name }),
          el('span', { class: 'cat-tile-bar' }, [
            r.debit > 0 ? el('i', { style: { width: wDeb + '%', background: r.color } }) : null,
            r.credit > 0 ? el('i', { class: 'is-credit', style: { width: wCre + '%', background: r.color } }) : null
          ].filter(Boolean))
        ]),
        el('span', { class: 'cat-tile-num' }, [
          el('span', { class: 'cat-tile-val', text: U.fmtBRL(r.total) }),
          el('span', { class: 'cat-tile-pct', text: U.fmtPct(r.pct, 0) })
        ]),
        el('span', { class: 'cat-tile-split' }, [
          r.debit > 0 ? el('span', { text: `Débito ${U.fmtBRL(r.debit)}` }) : null,
          r.credit > 0 ? el('span', { text: `Crédito ${U.fmtBRL(r.credit)}` }) : null
        ].filter(Boolean))
      ]));
    });

    if (rows.some((r) => r.credit > 0)) {
      list.appendChild(el('li', { class: 'legend-icons', style: { marginTop: '2px' } }, [
        el('span', {}, [el('i', { class: 'swatch-solid' }), document.createTextNode('Débito (conta)')]),
        el('span', {}, [el('i', { class: 'swatch-hatch' }), document.createTextNode('Crédito (cartão)')])
      ]));
    }
  }

  /* ---------------- 6 · próximos eventos ---------------- */

  function renderUpcoming(ym) {
    const box = U.clear(document.getElementById('upcomingList'));
    const prof = Store.profile();
    const hoje = U.todayISO();
    const itens = [];

    prof.cards.forEach((c) => {
      [ym, U.addMonths(ym, 1)].forEach((base) => {
        const ref = Calc.currentInvoiceRef(c, base);
        const inv = Calc.invoice(c.id, ref);
        if (!inv || inv.paid || inv.planned <= 0) return;
        if (itens.some((i) => i.chave === c.id + inv.dueDate)) return;
        itens.push({
          chave: c.id + inv.dueDate, data: inv.dueDate, valor: inv.planned,
          titulo: 'Fatura ' + c.name, sub: 'Cartão de crédito',
          atrasado: inv.dueDate < hoje,
          ir: () => App.goTo('accounts', { tab: 'cards', cardId: c.id, invoiceRef: ref })
        });
      });
    });

    [ym, U.addMonths(ym, 1)].forEach((base) => {
      Calc.entriesForMonth(base).forEach((e) => {
        if (e.confirmed || e.kind === 'income' || e.method === 'card') return;
        itens.push({
          chave: e.txId + e.date, data: e.date, valor: e.amount,
          titulo: e.description, sub: Calc.categoryName(e.categoryId),
          atrasado: e.date < hoje,
          ir: () => Forms.openTransaction(null, e.txId)
        });
      });
    });

    if (!itens.length) {
      box.appendChild(UI.empty('Nada a pagar nos próximos dias.'));
      return;
    }
    itens.sort((a, b) => (a.data < b.data ? -1 : 1));

    const ul = el('ul', { class: 'due-list' });
    itens.slice(0, 6).forEach((i) => {
      ul.appendChild(el('li', {
        class: 'due-item' + (i.atrasado ? ' is-late' : ''), tabindex: '0',
        title: i.titulo, onclick: i.ir
      }, [
        el('span', { class: 'due-day' }, [
          el('span', { class: 'd', text: i.data.slice(8, 10) }),
          el('span', { class: 'm', text: U.MONTHS_SHORT[+i.data.slice(5, 7) - 1] })
        ]),
        el('span', { class: 'due-id' }, [
          el('span', { class: 'due-name', text: i.titulo }),
          el('span', { class: 'due-sub', text: i.sub })
        ]),
        el('span', { class: 'due-val', text: U.fmtBRL(i.valor) })
      ]));
    });
    box.appendChild(ul);
    if (itens.length > 6) box.appendChild(el('p', { class: 'hint', text: `+${itens.length - 6} depois destes.` }));
  }

  /* ---------------- 7 · resumo do mês ---------------- */

  function renderMonthSummary(ym) {
    const box = U.clear(document.getElementById('monthSummary'));
    const t = Calc.monthTotals(ym);
    const taxa = Calc.savingsRate(ym);
    const saldo = t.balance;

    document.getElementById('monthSummaryNote').textContent = U.smartCase(U.monthLabel(ym));

    box.appendChild(el('div', { class: 'fig-stack' }, [
      el('div', { class: 'fig-big' }, [
        el('span', { class: 'k', text: saldo >= 0 ? 'Sobrou no mês' : 'Faltou no mês' }),
        el('span', { class: 'v ' + U.signClass(saldo), text: U.fmtBRL(Math.abs(saldo)) })
      ]),
      el('div', { class: 'fig-row' }, [
        fig('Taxa de poupança', taxa != null ? U.fmtPct(taxa, 1) : '—', taxa != null ? U.signClass(taxa) : ''),
        fig('Lançamentos', String(t.entries.length), ''),
        fig('A confirmar', String(t.pendingCount), t.pendingCount ? 'val-neg' : '')
      ])
    ]));

    if (t.pendingCount > 0) {
      box.appendChild(el('button', {
        class: 'btn btn-outline btn-sm', style: { marginTop: '12px' },
        text: `Revisar ${t.pendingCount} pendente(s)`,
        onclick: () => { App.txOnlyPending = true; App.goTo('transactions'); }
      }));
    }
  }
  const fig = (k, v, cls) => el('div', { class: 'inv-fig' }, [
    el('span', { class: 'k', text: k }),
    el('span', { class: 'v ' + (cls || ''), text: v })
  ]);

  /* ---------------- 8 · carteira ---------------- */

  function renderWallet(ym) {
    const box = U.clear(document.getElementById('homeCards'));
    const prof = Store.profile();
    const upto = App.balanceDate();

    if (!prof.accounts.length && !prof.cards.length) {
      box.appendChild(el('div', { class: 'empty-note' }, [
        document.createTextNode('Sua carteira está vazia. '),
        el('button', { class: 'btn btn-outline btn-sm', text: 'Cadastrar conta', onclick: () => Forms.openAccount() })
      ]));
      return;
    }
    if (prof.accounts.length) {
      box.appendChild(Cards.accountDeck(prof.accounts, upto, { limit: 2 }));
    }
    if (prof.cards.length) {
      if (!prof.cards.some((c) => c.id === App.cardFocusId)) App.cardFocusId = prof.cards[0].id;
      box.appendChild(Cards.deck(prof.cards, ym, {
        limit: 2, focusedId: App.cardFocusId,
        onClick: (c) => { App.cardFocusId = c.id; renderWallet(ym); }
      }));
    }
  }

  /* ---------------- 9 · movimentações recentes ---------------- */

  function renderRecent(ym) {
    const box = U.clear(document.getElementById('recentList'));
    const entradas = Calc.entriesForMonth(U.addMonths(ym, -1))
      .concat(Calc.entriesForMonth(ym))
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    if (!entradas.length) {
      box.appendChild(UI.empty('Nenhuma movimentação registrada ainda.'));
      return;
    }
    const table = el('table', { class: 'table table-compact' }, [
      el('thead', {}, el('tr', {}, [
        el('th', { text: 'Data' }), el('th'), el('th', { text: 'Descrição' }),
        el('th', { text: 'Categoria' }), el('th', { class: 'num', text: 'Valor' })
      ])),
      el('tbody')
    ]);
    const tbody = table.querySelector('tbody');
    entradas.slice(0, 8).forEach((e) => {
      tbody.appendChild(el('tr', { class: e.confirmed ? '' : 'is-pending' }, [
        el('td', { text: U.fmtDayMonth(e.date) }),
        el('td', {}, Icons.categoryBadge(e.categoryId, 24)),
        el('td', {}, [
          document.createTextNode(e.description + ' '),
          !e.confirmed ? UI.badge('Previsto', 'pend') : null
        ].filter(Boolean)),
        el('td', { text: Calc.categoryName(e.categoryId) }),
        el('td', {
          class: 'num ' + (e.kind === 'income' ? 'val-pos' : e.kind === 'expense' ? 'val-neg' : ''),
          text: (e.kind === 'income' ? '+ ' : e.kind === 'expense' ? '− ' : '') + U.fmtBRL(e.amount)
        })
      ]));
    });
    box.appendChild(el('div', { class: 'table-wrap' }, table));
  }

  global.Home = Home;
})(window);
