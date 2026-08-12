/* =============================================================
   pages/annual.js — Página 6 · Resumo Anual
   ============================================================= */
(function (global) {
  'use strict';

  const el = U.el;
  const Annual = {};

  Annual.render = function () {
    const year = U.ymParts(App.ym).y;
    const sum = Calc.yearSummary(year);
    renderKpis(year, sum);
    renderTable(year, sum);
    renderBalanceChart(year, sum);
    renderYoY(year);
  };

  function renderKpis(year, sum) {
    const prev = Calc.yearSummary(year - 1);
    const hasPrev = prev.income > 0 || prev.expense > 0;
    const savingRate = sum.income > 0 ? (sum.balance / sum.income) * 100 : 0;
    const investedNow = Calc.investedTotal(`${year}-12-31`);
    const cashNow = Calc.totalAccountsBalance(U.monthEnd(App.ym));

    UI.renderKpis('annualKpis', [
      {
        label: `Receitas em ${year}`,
        value: U.fmtBRL(sum.income),
        accent: 'var(--income)',
        delta: hasPrev
          ? U.deltaHtml(prev.income > 0 ? ((sum.income - prev.income) / prev.income) * 100 : null, true) + ` <span class="muted">vs. ${year - 1}</span>`
          : `<span class="muted">Média de ${U.fmtBRL(sum.income / 12)}/mês</span>`
      },
      {
        label: `Despesas em ${year}`,
        value: U.fmtBRL(sum.expense),
        accent: 'var(--expense)',
        delta: hasPrev
          ? U.deltaHtml(prev.expense > 0 ? ((sum.expense - prev.expense) / prev.expense) * 100 : null, false) + ` <span class="muted">vs. ${year - 1}</span>`
          : `<span class="muted">Média de ${U.fmtBRL(sum.expense / 12)}/mês</span>`
      },
      {
        label: 'Saldo do ano',
        value: U.fmtBRL(sum.balance),
        valueClass: U.signClass(sum.balance),
        accent: sum.balance >= 0 ? 'var(--good)' : 'var(--critical)',
        hero: true,
        delta: `<span class="muted">Taxa de poupança:</span> <strong class="${U.signClass(savingRate)}">${U.fmtPct(savingRate)}</strong> da receita`
      },
      {
        label: 'Investido no ano',
        value: U.fmtBRL(sum.invested),
        accent: 'var(--invest)',
        delta: `<span class="muted">Patrimônio: ${U.fmtBRL(cashNow + investedNow)} (contas + investimentos)</span>`
      }
    ]);
  }

  function renderTable(year, sum) {
    const tbody = U.clear(document.querySelector('#tableAnnual tbody'));
    const tfoot = U.clear(document.querySelector('#tableAnnual tfoot'));
    const currentYM = U.todayYM();

    sum.series.forEach((r) => {
      tbody.appendChild(el('tr', { class: r.ym === App.ym ? 'is-current' : '' }, [
        el('td', {}, [
          el('button', {
            class: 'btn btn-ghost btn-sm', style: { padding: '0 4px' },
            text: U.MONTHS[U.ymParts(r.ym).m] + (r.ym === currentYM ? ' (atual)' : ''),
            onclick: () => { App.setYM(r.ym); App.goTo('transactions'); }
          })
        ]),
        el('td', { class: 'num', text: U.fmtBRL(r.income) }),
        el('td', { class: 'num', text: U.fmtBRL(r.expense) }),
        el('td', { class: 'num ' + U.signClass(r.balance), text: U.fmtBRL(r.balance) }),
        el('td', { class: 'num ' + U.signClass(r.cumulative), text: U.fmtBRL(r.cumulative) }),
        el('td', { class: 'num', text: r.invested ? U.fmtBRL(r.invested) : '—' })
      ]));
    });

    tfoot.appendChild(el('tr', {}, [
      el('td', { text: `Total ${year}` }),
      el('td', { class: 'num', text: U.fmtBRL(sum.income) }),
      el('td', { class: 'num', text: U.fmtBRL(sum.expense) }),
      el('td', { class: 'num ' + U.signClass(sum.balance), text: U.fmtBRL(sum.balance) }),
      el('td', { class: 'num ' + U.signClass(sum.endCumulative), text: U.fmtBRL(sum.endCumulative) }),
      el('td', { class: 'num', text: U.fmtBRL(sum.invested) })
    ]));

    document.getElementById('annualTableTitle').textContent =
      sum.balance >= 0
        ? `${year} fecha positivo em ${U.fmtBRL(sum.balance)}`
        : `${year} fecha negativo em ${U.fmtBRL(sum.balance)}`;
  }

  function renderBalanceChart(year, sum) {
    const t = Charts.theme();
    Charts.lines('chartAnnualBalance',
      sum.series.map((r) => r.label),
      [{ label: 'Saldo acumulado', color: t.accent, data: sum.series.map((r) => r.cumulative), fill: true }],
      { beginAtZero: false });
  }

  function renderYoY(year) {
    const years = Calc.yearsWithData().filter((y) => y <= year).slice(-4);
    const withData = years.map((y) => Calc.yearSummary(y)).filter((s) => s.income > 0 || s.expense > 0);

    const title = document.getElementById('yoyTitle');
    if (withData.length < 2) {
      UI.toggleEmptyOverlay('yoyEmpty', true);
      Charts.destroy('chartYoY');
      title.textContent = 'Comparação ano a ano';
      return;
    }
    UI.toggleEmptyOverlay('yoyEmpty', false);

    const t = Charts.theme();
    const last = withData[withData.length - 1];
    const prev = withData[withData.length - 2];
    const diff = prev.balance !== 0 ? ((last.balance - prev.balance) / Math.abs(prev.balance)) * 100 : null;
    title.textContent = diff != null
      ? `Saldo de ${last.year} ${diff >= 0 ? 'melhorou' : 'piorou'} ${U.fmtPct(Math.abs(diff), 0)} frente a ${prev.year}`
      : 'Comparação ano a ano';

    Charts.groupedBars('chartYoY',
      withData.map((s) => String(s.year)),
      [
        { label: 'Receitas', color: t.income, data: withData.map((s) => s.income) },
        { label: 'Despesas', color: t.expense, data: withData.map((s) => s.expense) }
      ]);
  }

  global.Annual = Annual;
})(window);
