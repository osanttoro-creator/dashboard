/* =============================================================
   pages/investments.js — Página 3 · Investimentos
   ============================================================= */
(function (global) {
  'use strict';

  const el = U.el;
  const Inv = {};
  let projectionDrawn = false;

  Inv.render = function () {
    const ym = App.ym;
    const at = U.monthEnd(ym);
    renderKpis(at, ym);
    renderTypeFilter();
    renderTable(at);
    renderEvolution(ym);
    if (!projectionDrawn) { Inv.runProjection(); projectionDrawn = true; }
    else Inv.runProjection();
  };

  /* ---------------- KPIs ---------------- */

  function renderKpis(at, ym) {
    const prof = Store.profile();
    const value = Calc.investedTotal(at);
    const contributed = Calc.contributedTotal(at);
    const gain = U.round2(value - contributed);
    const prevValue = Calc.investedTotal(U.monthEnd(U.addMonths(ym, -1)));
    const yearStart = U.ymParts(ym).y + '-01-01';
    const yearContrib = U.round2(prof.investments
      .filter((i) => i.date >= yearStart && i.date <= at)
      .reduce((s, i) => s + i.amount, 0));

    UI.renderKpis('invKpis', [
      {
        label: 'Patrimônio investido',
        value: U.fmtBRL(value),
        accent: 'var(--invest)',
        hero: true,
        delta: prevValue > 0
          ? U.deltaHtml(((value - prevValue) / prevValue) * 100, true) + ' <span class="muted">vs. mês anterior</span>'
          : '<span class="muted">Primeiro mês com aportes</span>'
      },
      {
        label: 'Total aportado',
        value: U.fmtBRL(contributed),
        accent: 'var(--muted)',
        delta: `<span class="muted">${prof.investments.filter((i) => i.date <= at).length} aporte(s) registrados</span>`
      },
      {
        label: 'Rendimento estimado',
        value: U.fmtBRL(gain),
        valueClass: U.signClass(gain),
        accent: gain >= 0 ? 'var(--good)' : 'var(--critical)',
        delta: contributed > 0
          ? U.deltaHtml((gain / contributed) * 100, true) + ' <span class="muted">sobre o aportado</span>'
          : '<span class="muted">—</span>'
      },
      {
        label: 'Aportado em ' + U.ymParts(ym).y,
        value: U.fmtBRL(yearContrib),
        accent: 'var(--s1)',
        delta: `<span class="muted">Média de ${U.fmtBRL(yearContrib / Math.max(1, U.ymParts(ym).m + 1))}/mês</span>`
      }
    ]);
  }

  /* ---------------- filtro de tipo ---------------- */

  function renderTypeFilter() {
    const sel = document.getElementById('invTypeFilter');
    const types = Array.from(new Set(Store.profile().investments.map((i) => i.type))).sort();
    UI.fillSelect(sel, types.map((t) => ({ value: t, label: t })), App.invType, 'Todos os tipos');
  }

  /* ---------------- tabela ---------------- */

  function renderTable(at) {
    const tbody = U.clear(document.querySelector('#tableInvestments tbody'));
    let list = Store.profile().investments.slice();
    if (App.invType) list = list.filter((i) => i.type === App.invType);
    list.sort((a, b) => (a.date < b.date ? 1 : -1));

    if (!list.length) {
      tbody.appendChild(UI.emptyRow(8, 'Nenhum investimento cadastrado. Use "+ Novo aporte" para começar.'));
      return;
    }

    list.forEach((iv) => {
      const current = Calc.investmentValueAt(iv, at);
      const gain = U.round2(current - iv.amount);
      const gainPct = iv.amount > 0 ? (gain / iv.amount) * 100 : 0;
      tbody.appendChild(el('tr', {}, [
        el('td', {}, [
          el('strong', { text: iv.name }),
          iv.notes ? el('div', { class: 'muted', text: iv.notes }) : null,
          iv.currentValue != null ? el('div', { class: 'muted', text: 'valor informado manualmente' }) : null
        ].filter(Boolean)),
        el('td', { text: iv.type }),
        el('td', { text: U.fmtDateBR(iv.date) }),
        el('td', { class: 'num', text: U.fmtBRL(iv.amount) }),
        el('td', { class: 'num', text: iv.rate ? U.fmtPct(iv.rate) : '—' }),
        el('td', { class: 'num', text: U.fmtBRL(current) }),
        el('td', { class: 'num ' + U.signClass(gain), text: `${gain >= 0 ? '+' : ''}${U.fmtBRL(gain)} (${U.fmtPct(gainPct)})` }),
        el('td', { class: 'num' }, el('div', { class: 'row-actions' }, [
          el('button', { class: 'icon-btn', title: 'Editar', text: '✎', onclick: () => Forms.openInvestment(iv.id) })
        ]))
      ]));
    });
  }

  /* ---------------- evolução ---------------- */

  function renderEvolution(ym) {
    const prof = Store.profile();
    if (!prof.investments.length) {
      Charts.destroy('chartInvEvolution');
      document.getElementById('invEvoTitle').textContent = 'Evolução do patrimônio investido';
      return;
    }
    const first = prof.investments.reduce((m, i) => (i.date < m ? i.date : m), prof.investments[0].date);
    const fromYM = U.ymOf(first);
    const toYM = U.monthsBetween(fromYM, ym) >= 0 ? ym : fromYM;
    const series = Calc.investmentSeries(fromYM, toYM, prof);
    const last = series[series.length - 1] || { value: 0, contributed: 0 };
    const gain = U.round2(last.value - last.contributed);

    document.getElementById('invEvoTitle').textContent = gain >= 0
      ? `Patrimônio cresceu ${U.fmtBRL(gain)} acima dos aportes`
      : 'Patrimônio abaixo do total aportado';

    const t = Charts.theme();
    Charts.lines('chartInvEvolution',
      series.map((r) => r.label),
      [
        { label: 'Valor estimado', color: t.invest, data: series.map((r) => r.value), fill: true },
        { label: 'Aportes acumulados', color: t.muted, data: series.map((r) => r.contributed), dashed: true }
      ]);
  }

  /* ---------------- projeção ---------------- */

  Inv.runProjection = function () {
    const initial = U.parseMoney(document.getElementById('projInitial').value) || 0;
    const monthly = U.parseMoney(document.getElementById('projMonthly').value) || 0;
    const rateRaw = U.parseMoney(document.getElementById('projRate').value) || 0;
    const period = document.getElementById('projRatePeriod').value;
    const months = Math.max(1, Math.min(960, parseInt(document.getElementById('projMonths').value, 10) || 12));

    const monthlyRate = period === 'month' ? rateRaw / 100 : Calc.yearRateToMonth(rateRaw);
    const rows = Calc.projection(initial, monthly, monthlyRate, months);
    const last = rows[rows.length - 1];
    const interest = U.round2(last.value - last.invested);

    const figs = U.clear(document.getElementById('projFigures'));
    [
      { k: 'Valor final', v: U.fmtBRL(last.value), accent: 'var(--invest)' },
      { k: 'Total investido', v: U.fmtBRL(last.invested), accent: 'var(--muted)' },
      { k: 'Juros acumulados', v: U.fmtBRL(interest), accent: 'var(--good)' },
      { k: 'Juros / total', v: last.value > 0 ? U.fmtPct((interest / last.value) * 100) : '—', accent: 'var(--s1)' }
    ].forEach((f) => {
      figs.appendChild(el('div', { class: 'kpi', style: { '--accent': f.accent, padding: '12px 13px' } }, [
        el('span', { class: 'kpi-label', text: f.k }),
        el('span', { class: 'kpi-value', style: { fontSize: '19px' }, text: f.v })
      ]));
    });

    // rótulo a cada 6 meses para o eixo não virar sopa
    const step = months > 120 ? 12 : months > 36 ? 6 : months > 12 ? 3 : 1;
    const idx = rows.map((_, i) => i).filter((i) => i % step === 0 || i === rows.length - 1);
    const t = Charts.theme();
    Charts.lines('chartProjection',
      idx.map((i) => (i % 12 === 0 && i > 0 ? `${i / 12} ano${i / 12 > 1 ? 's' : ''}` : `${i} m`)),
      [
        { label: 'Valor projetado', color: t.invest, data: idx.map((i) => rows[i].value), fill: true },
        { label: 'Só os aportes (sem juros)', color: t.muted, data: idx.map((i) => rows[i].invested), dashed: true }
      ]);
  };

  global.Inv = Inv;
})(window);
