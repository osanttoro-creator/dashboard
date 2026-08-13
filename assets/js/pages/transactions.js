/* =============================================================
   pages/transactions.js — Página 2 · Receitas e Despesas
   Um item só entra nos totais quando a checkbox está marcada.
   As despesas são separadas em DÉBITO (sai da conta na hora) e
   CRÉDITO (entra na fatura) — só reorganização da exibição: a
   regra de cálculo continua a mesma do README.
   ============================================================= */
(function (global) {
  'use strict';

  const el = U.el;
  const Tx = {};

  Tx.render = function () {
    const ym = App.ym;
    const totals = Calc.monthTotals(ym);
    syncMethodFilter();
    renderKpis(ym, totals);
    renderIncomeColumn(ym, totals.entries);
    renderExpenseColumn(ym, totals.entries);
    renderCharts(ym, totals);
  };

  function syncMethodFilter() {
    U.$$('#txMethodFilter button').forEach((b) =>
      b.classList.toggle('is-active', b.dataset.method === App.txMethod));
  }

  /* ---------------- KPIs ---------------- */

  function renderKpis(ym, t) {
    const splitHtml = t.expense > 0
      ? `<span class="split-pill" title="Débito — sai direto da conta">Débito ${U.fmtBRL(t.expenseDebit)}</span>` +
        `<span class="split-pill is-credit" title="Crédito — entra na fatura do cartão">Crédito ${U.fmtBRL(t.expenseCredit)}</span>`
      : '<span class="muted">Nada confirmado ainda</span>';

    UI.renderKpis('txKpis', [
      {
        label: 'Receitas confirmadas',
        value: U.fmtBRL(t.income),
        accent: 'var(--income)',
        delta: t.pendingIncome > 0
          ? `<span class="muted">+ ${U.fmtBRL(t.pendingIncome)} previstos aguardando confirmação</span>`
          : '<span class="muted">Nada pendente</span>'
      },
      {
        label: 'Despesas confirmadas',
        value: U.fmtBRL(t.expense),
        accent: 'var(--expense)',
        delta: splitHtml
      },
      {
        label: 'Saldo do mês',
        value: U.fmtBRL(t.balance),
        valueClass: U.signClass(t.balance),
        accent: t.balance >= 0 ? 'var(--good)' : 'var(--critical)',
        hero: true,
        delta: `<span class="muted">Se tudo se confirmar:</span> <strong class="${U.signClass(t.plannedBalance)}">${U.fmtBRL(t.plannedBalance)}</strong>`
      }
    ]);
  }

  /* ---------------- filtros ---------------- */

  function matchesSearch(e) {
    if (App.txOnlyPending && e.confirmed) return false;
    const q = U.norm(App.txSearch);
    if (!q) return true;
    return U.norm(e.description).includes(q) || U.norm(Calc.categoryName(e.categoryId)).includes(q);
  }
  const matchesMethod = (e) => App.txMethod === 'all' || e.method === App.txMethod;

  /* ---------------- coluna de receitas ---------------- */

  function renderIncomeColumn(ym, entries) {
    const box = U.clear(document.getElementById('colIncome'));
    const all = entries.filter((e) => e.kind === 'income');
    const list = all.filter(matchesSearch);
    const confirmed = list.filter((e) => e.confirmed);

    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card-head' }, [
      el('h2', { text: 'Receitas' }),
      el('span', { class: 'card-note', text: `${confirmed.length} confirmadas · ${U.fmtBRL(U.sum(confirmed, (e) => e.amount))}` }),
      el('button', { class: 'btn btn-sm btn-income', text: '+ Receita', onclick: () => Forms.openTransaction('income') })
    ]));

    if (!all.length) card.appendChild(UI.empty('Nenhuma receita lançada neste mês.'));
    else if (!list.length) card.appendChild(UI.empty('Nenhum item corresponde ao filtro atual.'));
    else {
      section(card, 'Fixas', confirmed.filter((e) => e.recurring), ym, 'income');
      section(card, 'Variáveis', confirmed.filter((e) => !e.recurring), ym, 'income');
      section(card, 'Previstas', list.filter((e) => !e.confirmed), ym, 'income');
    }
    box.appendChild(card);
  }

  /* ---------------- coluna de despesas ---------------- */

  function renderExpenseColumn(ym, entries) {
    const box = U.clear(document.getElementById('colExpense'));
    const all = entries.filter((e) => e.kind === 'expense');
    const list = all.filter((e) => matchesSearch(e) && matchesMethod(e));

    const confirmed = list.filter((e) => e.confirmed);
    const debito = confirmed.filter((e) => e.method === 'account');
    const credito = confirmed.filter((e) => e.method === 'card');
    const pendentes = list.filter((e) => !e.confirmed);

    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card-head' }, [
      el('h2', { text: 'Despesas' }),
      el('span', {
        class: 'card-note',
        text: `${confirmed.length} confirmadas · ${U.fmtBRL(U.sum(confirmed, (e) => e.amount))}`
          + (App.txMethod !== 'all' ? ` · filtrando ${App.txMethod === 'card' ? 'crédito' : 'débito'}` : '')
      }),
      el('button', { class: 'btn btn-sm btn-danger', text: '− Despesa', onclick: () => Forms.openTransaction('expense') })
    ]));

    if (!all.length) {
      card.appendChild(UI.empty('Nenhuma despesa lançada neste mês.'));
    } else if (!list.length) {
      card.appendChild(UI.empty('Nenhum item corresponde ao filtro atual.'));
    } else {
      if (App.txMethod !== 'card') methodSection(card, 'account', debito, ym);
      if (App.txMethod !== 'account') methodSection(card, 'card', credito, ym);
      section(card, 'Previstos', pendentes, ym, 'expense');
    }
    box.appendChild(card);
  }

  /**
   * Seção de método. O cabeçalho ganha faixa colorida com o ícone, a
   * contagem e o total — a explicação de "o que é débito" mora no selo
   * de cada linha (title), não em um parágrafo repetido todo mês.
   */
  function methodSection(parent, method, items, ym) {
    const isCard = method === 'card';
    const m = Icons.METHOD[isCard ? 'card' : 'account'];
    const total = U.sum(items, (e) => e.amount);

    parent.appendChild(el('div', {
      class: 'tx-section-head is-method ' + (isCard ? 'is-credit' : 'is-debit'),
      title: m.full
    }, [
      Icons.lucide(m.icon, 15),
      el('h3', { text: isCard ? 'Crédito — cartão' : 'Débito — conta' }),
      el('span', { class: 'count', text: String(items.length) }),
      el('span', { class: 'sum val-neg', text: U.fmtBRL(total) })
    ]));

    if (!items.length) {
      parent.appendChild(el('p', {
        class: 'empty-note', style: { padding: '4px 4px 8px' },
        text: isCard ? 'Nada no cartão neste mês.' : 'Nada em débito neste mês.'
      }));
      return;
    }
    const ul = el('ul', { class: 'tx-list' });
    items.forEach((e) => ul.appendChild(row(e, ym)));
    parent.appendChild(ul);
  }

  function section(parent, title, items, ym, kind) {
    if (!items.length) return;
    const total = U.sum(items, (e) => e.amount);
    parent.appendChild(el('div', { class: 'tx-section-head' }, [
      el('h3', { text: title }),
      el('span', { class: 'count', text: String(items.length) }),
      el('span', { class: 'sum ' + (kind === 'income' ? 'val-pos' : ''), text: U.fmtBRL(total) })
    ]));
    const list = el('ul', { class: 'tx-list' });
    items.forEach((e) => list.appendChild(row(e, ym)));
    parent.appendChild(list);
  }

  /** Uma linha de lançamento com a checkbox de confirmação. */
  function row(e, ym) {
    const cb = el('input', { type: 'checkbox', 'aria-label': 'Confirmar ' + e.description });
    cb.checked = e.confirmed;
    cb.addEventListener('change', () => {
      Store.transactions.setConfirmed(e.txId, e.ym, cb.checked);
      UI.toast(cb.checked ? 'Confirmado — entrou no saldo.' : 'Desmarcado — saiu do saldo.');
    });

    const meta = [el('span', { text: U.fmtDayMonth(e.date) })];
    if (e.kind !== 'transfer') meta.push(el('span', { text: Calc.categoryName(e.categoryId) }));
    if (e.recurring) meta.push(UI.badge('Fixa', 'fix'));
    if (e.installment) meta.push(UI.badge(`${e.installment.index}/${e.installment.total}`, 'inst'));
    if (e.kind === 'expense') {
      const card = e.cardId ? Store.cards.get(e.cardId) : null;
      meta.push(Icons.methodBadge(e.method, card ? card.name : undefined));
    }
    if (!e.confirmed) meta.push(UI.badge('Previsto', 'pend'));
    if (e.source === 'import') meta.push(UI.badge('Importado', ''));

    return el('li', { class: 'tx-item' + (e.confirmed ? '' : ' is-pending') }, [
      el('label', { class: 'check' }, cb),
      Icons.categoryBadge(e.categoryId),
      el('div', { class: 'tx-main' }, [
        el('div', { class: 'tx-name', text: e.description, title: e.description }),
        el('div', { class: 'tx-meta' }, meta)
      ]),
      el('span', {
        class: 'tx-amount ' + (e.kind === 'income' ? 'val-pos' : e.kind === 'expense' ? 'val-neg' : ''),
        text: (e.kind === 'income' ? '+ ' : e.kind === 'expense' ? '− ' : '') + U.fmtBRL(e.amount)
      }),
      el('div', { class: 'tx-actions' }, [
        el('button', { class: 'icon-btn', title: 'Editar', text: '✎', onclick: () => Forms.openTransaction(null, e.txId) }),
        el('button', { class: 'icon-btn danger', title: 'Excluir', text: '🗑', onclick: () => remove(e, ym) })
      ])
    ]);
  }

  async function remove(e, ym) {
    if (e.recurring) {
      UI.openModal({
        title: 'Excluir lançamento fixo',
        body: el('p', {
          style: { fontSize: '13.5px', lineHeight: '1.6' },
          html: `<strong>${U.escape(e.description)}</strong> se repete todo mês. O que você quer fazer?`
        }),
        buttons: [
          { label: 'Cancelar', class: 'btn-outline', onClick: UI.closeModal },
          {
            label: `Pular só ${U.monthLabel(ym, true)}`, class: 'btn-outline',
            onClick: () => { Store.transactions.skipOccurrence(e.txId, ym); UI.toast('Ocorrência removida deste mês.'); UI.closeModal(); }
          },
          {
            label: 'Excluir todas', class: 'btn-danger',
            onClick: () => { Store.transactions.remove(e.txId); UI.toast('Lançamento fixo excluído.'); UI.closeModal(); }
          }
        ],
        noAutofocus: true
      });
      return;
    }
    const ok = await UI.confirm({
      title: 'Excluir lançamento',
      message: `Excluir <strong>${U.escape(e.description)}</strong> (${U.fmtBRL(e.amount)})?` +
        (e.installment ? ' Todas as parcelas do grupo serão removidas.' : ''),
      confirmLabel: 'Excluir', danger: true
    });
    if (ok) { Store.transactions.remove(e.txId); UI.toast('Lançamento excluído.'); }
  }

  /* ---------------- gráficos ---------------- */

  function renderCharts(ym, t) {
    const from = U.monthStart(ym), to = U.monthEnd(ym);
    const th = Charts.theme();
    // sálvia = débito (sai da conta) · terracota = crédito (vai para a fatura).
    // O mesmo par vale nos selos, nas pílulas e nos dois gráficos abaixo.
    const corDebito = th.salvia;
    const corCredito = th.terracota;

    /* despesas por categoria, empilhadas por forma de pagamento */
    const exp = Calc.expenseTotalsByMethod(from, to).slice(0, 10);
    UI.toggleEmptyOverlay('txExpCatEmpty', exp.length === 0);
    const title = document.getElementById('txExpCatTitle');
    if (exp.length) {
      const soDebito = exp.every((r) => r.credit === 0);
      const soCredito = exp.every((r) => r.debit === 0);
      title.textContent = soDebito ? 'Despesas por categoria — tudo em débito'
        : soCredito ? 'Despesas por categoria — tudo no cartão'
          : `Despesas por categoria — ${U.fmtPct(t.expense > 0 ? t.expenseCredit / t.expense * 100 : 0, 0)} no cartão`;
      Charts.stackedRankedBars('chartTxExpenseCat', exp.map((r) => r.name), [
        { label: 'Débito (conta)', color: corDebito, data: exp.map((r) => r.debit) },
        { label: 'Crédito (cartão)', color: corCredito, data: exp.map((r) => r.credit) }
      ]);
    } else {
      title.textContent = 'Despesas por categoria no mês';
      Charts.destroy('chartTxExpenseCat');
    }

    /* débito × crédito mês a mês no ano — mostra se o cartão está ganhando peso */
    const ano = U.ymParts(ym).y;
    const serie = Calc.monthlySeries(`${ano}-01`, `${ano}-12`);
    const totCred = U.sum(serie, (r) => r.expenseCredit);
    const totDeb = U.sum(serie, (r) => r.expenseDebit);
    const soma = U.round2(totCred + totDeb);
    document.getElementById('txSplitTitle').textContent = soma > 0
      ? `Débito × Crédito em ${ano} — ${U.fmtPct((totCred / soma) * 100, 0)} no cartão`
      : `Débito × Crédito em ${ano}`;
    Charts.lines('chartMethodTrend', serie.map((r) => r.label), [
      { label: 'Débito (conta)', color: corDebito, data: serie.map((r) => r.expenseDebit) },
      { label: 'Crédito (cartão)', color: corCredito, data: serie.map((r) => r.expenseCredit), pointStyle: 'rectRot' }
    ], { markers: true });

    const inc = Calc.categoryTotals('income', from, to);
    UI.toggleEmptyOverlay('txIncCatEmpty', inc.length === 0);
    if (inc.length) Charts.rankedBars('chartTxIncomeCat', inc.slice(0, 10));
    else Charts.destroy('chartTxIncomeCat');

    // Previsto em tom neutro (contexto) · Realizado colorido por natureza
    Charts.groupedBars('chartPlannedVsReal',
      ['Receitas', 'Despesas'],
      [
        { label: 'Previsto (tudo lançado)', color: Charts.hexA(th.muted, 0.45), data: [t.plannedIncome, t.plannedExpense] },
        { label: 'Realizado (confirmado)', color: [th.income, th.expense], data: [t.income, t.expense] }
      ]);
  }

  global.Tx = Tx;
})(window);
