/* =============================================================
   pages/reports.js — Análises
   ------------------------------------------------------------
   Consolidado do ano, comparação ano a ano e taxa de poupança.
   Tudo sai de Calc.monthlySeries e Calc.savingsRate: esta página
   não tem aritmética própria, só recorte e exportação.
   ============================================================= */
(function (global) {
  'use strict';

  const el = U.el;
  const Rep = {};

  Rep.render = function () {
    const ano = U.ymParts(App.ym).y;
    const serie = Calc.monthlySeries(`${ano}-01`, `${ano}-12`);
    renderKpis(serie, ano);
    renderTabela(serie, ano);
    renderYoY(ano);
    renderPoupanca(serie, ano);
  };

  function renderKpis(serie, ano) {
    const receitas = U.round2(U.sum(serie, (r) => r.income));
    const despesas = U.round2(U.sum(serie, (r) => r.expense));
    const saldo = U.round2(receitas - despesas);
    const taxa = receitas > 0 ? (saldo / receitas) * 100 : null;
    const investido = Calc.investedTotal(U.monthEnd(`${ano}-12`));

    // mês mais caro do ano: costuma ser a informação que muda comportamento
    const pior = serie.slice().sort((a, b) => b.expense - a.expense)[0];

    UI.renderKpis('repKpis', [
      {
        label: 'Receitas em ' + ano, value: U.fmtBRL(receitas), accent: 'var(--income)',
        delta: `<span class="muted">${serie.filter((r) => r.income > 0).length} mês(es) com entrada</span>`
      },
      {
        label: 'Despesas em ' + ano, value: U.fmtBRL(despesas), accent: 'var(--expense)',
        delta: pior && pior.expense > 0
          ? `<span class="muted">Pico em ${pior.label}: ${U.fmtBRL(pior.expense)}</span>`
          : '<span class="muted">—</span>'
      },
      {
        label: 'Sobrou no ano', value: U.fmtBRL(saldo),
        valueClass: U.signClass(saldo), hero: true,
        accent: saldo >= 0 ? 'var(--good)' : 'var(--critical)',
        delta: taxa != null
          ? `<strong class="${U.signClass(taxa)}">${U.fmtPct(taxa, 1)}</strong> <span class="muted">do que entrou</span>`
          : '<span class="muted">Sem receita para comparar</span>'
      },
      {
        label: 'Investido até dez', value: U.fmtBRL(investido), accent: 'var(--invest)',
        delta: '<span class="muted">Valor estimado no fim do ano</span>'
      }
    ]);
  }

  function renderTabela(serie, ano) {
    const tbody = U.clear(document.querySelector('#tableAnnual tbody'));
    const tfoot = U.clear(document.querySelector('#tableAnnual tfoot'));
    const invPorMes = {};
    Store.profile().investments.forEach((i) => {
      if (+i.date.slice(0, 4) === ano) {
        const m = i.date.slice(0, 7);
        invPorMes[m] = U.round2((invPorMes[m] || 0) + i.amount);
      }
    });

    serie.forEach((r) => {
      tbody.appendChild(el('tr', { class: r.ym === App.ym ? 'is-current' : '' }, [
        el('td', { text: U.smartCase(U.monthLabel(r.ym)) }),
        el('td', { class: 'num', text: U.fmtBRL(r.income) }),
        el('td', { class: 'num', text: U.fmtBRL(r.expense) }),
        el('td', { class: 'num ' + U.signClass(r.balance), text: U.fmtBRL(r.balance) }),
        el('td', { class: 'num ' + U.signClass(r.cumulative), text: U.fmtBRL(r.cumulative) }),
        el('td', { class: 'num', text: U.fmtBRL(invPorMes[r.ym] || 0) })
      ]));
    });

    const rec = U.round2(U.sum(serie, (r) => r.income));
    const des = U.round2(U.sum(serie, (r) => r.expense));
    tfoot.appendChild(el('tr', {}, [
      el('td', { text: 'Total ' + ano }),
      el('td', { class: 'num', text: U.fmtBRL(rec) }),
      el('td', { class: 'num', text: U.fmtBRL(des) }),
      el('td', { class: 'num ' + U.signClass(rec - des), text: U.fmtBRL(U.round2(rec - des)) }),
      el('td', { class: 'num', text: serie.length ? U.fmtBRL(serie[serie.length - 1].cumulative) : '—' }),
      el('td', { class: 'num', text: U.fmtBRL(U.round2(U.sum(Object.values(invPorMes), (v) => v))) })
    ]));
  }

  function renderYoY(ano) {
    const t = Charts.theme();
    const anos = Calc.yearsWithData().filter((y) => y <= ano).slice(-3);
    const comDados = anos.filter((y) => {
      const s = Calc.monthlySeries(`${y}-01`, `${y}-12`);
      return U.sum(s, (r) => r.income + r.expense) > 0;
    });

    UI.toggleEmptyOverlay('yoyEmpty', comDados.length < 2);
    document.getElementById('repYoyTitle').textContent =
      comDados.length >= 2 ? `Despesas: ${comDados.join(' × ')}` : 'Comparação ano a ano';

    if (comDados.length < 2) { Charts.destroy('chartYoY'); return; }

    Charts.lines('chartYoY',
      U.MONTHS_SHORT,
      comDados.map((y, i) => ({
        label: String(y),
        color: t.series[i % t.series.length],
        data: Calc.monthlySeries(`${y}-01`, `${y}-12`).map((r) => r.expense),
        dashed: y !== ano
      })),
      { markers: true });
  }

  function renderPoupanca(serie, ano) {
    const t = Charts.theme();
    /* null quando não houve receita: a linha some no mês em vez de
       fingir 0%, que significaria "não sobrou nada" — coisa diferente. */
    const taxas = serie.map((r) => (r.income > 0 ? U.round2(((r.income - r.expense) / r.income) * 100) : null));

    Charts.render('chartSavings', {
      type: 'line',
      data: {
        labels: serie.map((r) => r.label),
        datasets: [{
          label: 'Taxa de poupança',
          data: taxas,
          borderColor: t.income,
          backgroundColor: Charts.hexA(t.income, 0.12),
          fill: true, borderWidth: 1.8, tension: 0.18,
          pointRadius: (c) => (c.parsed && c.parsed.y == null ? 0 : 3.6),
          pointHoverRadius: 6,
          pointBackgroundColor: t.income, pointBorderColor: t.surface, pointBorderWidth: 2,
          spanGaps: true
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 320 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: t.tipBg, titleColor: t.ink, bodyColor: t.ink2,
            borderColor: t.tipLine, borderWidth: 1, padding: 12, cornerRadius: 12,
            callbacks: { label: (c) => ' Sobrou ' + U.fmtPct(c.parsed.y, 1) + ' do que entrou' }
          }
        },
        scales: {
          x: { grid: { display: false }, border: { color: t.axis }, ticks: { color: t.muted, font: { size: 11 } } },
          y: {
            grid: { color: t.grid }, border: { display: false },
            ticks: { color: t.muted, font: { size: 11 }, callback: (v) => v + '%' }
          }
        }
      }
    });
    void ano;
  }

  /** Exporta o consolidado. CSV com ponto e vírgula: é o que o Excel pt-BR espera. */
  Rep.exportCsv = function () {
    const ano = U.ymParts(App.ym).y;
    const serie = Calc.monthlySeries(`${ano}-01`, `${ano}-12`);
    const linhas = [['Mes', 'Receitas', 'Despesas', 'Saldo', 'Acumulado']];
    serie.forEach((r) => linhas.push([
      U.monthLabel(r.ym), br(r.income), br(r.expense), br(r.balance), br(r.cumulative)
    ]));
    const csv = '﻿' + linhas.map((l) => l.join(';')).join('\r\n');
    U.download(`oaze-consolidado-${ano}.csv`, csv, 'text/csv');
    UI.toast('CSV exportado.', 'success');
  };
  const br = (n) => String(U.round2(n)).replace('.', ',');

  global.Rep = Rep;
})(window);
