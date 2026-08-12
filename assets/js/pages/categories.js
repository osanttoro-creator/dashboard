/* =============================================================
   pages/categories.js — Página 5 · Categorias
   ============================================================= */
(function (global) {
  'use strict';

  const el = U.el;
  const Cat = {};

  function range() {
    const ym = App.ym;
    switch (App.catRange) {
      case 'month': return { from: U.monthStart(ym), to: U.monthEnd(ym), label: U.monthLabel(ym) };
      case '12m': return { from: U.monthStart(U.addMonths(ym, -11)), to: U.monthEnd(ym), label: 'últimos 12 meses' };
      case 'year': {
        const y = U.ymParts(ym).y;
        return { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) };
      }
      default: return { from: Calc.earliestDate(), to: U.monthEnd(U.addMonths(U.todayYM(), 12)), label: 'histórico completo' };
    }
  }

  Cat.render = function () {
    const r = range();
    document.getElementById('catRangeSelect').value = App.catRange;
    renderList('expense', 'catListExpense', r);
    renderList('income', 'catListIncome', r);
    renderChart(r);
  };

  function renderList(kind, containerId, r) {
    const box = U.clear(document.getElementById(containerId));
    const totals = Calc.categoryTotals(kind, r.from, r.to);
    const byId = new Map(totals.map((t) => [t.id, t]));
    const grand = U.sum(totals, (t) => t.total);

    const cats = Store.profile().categories
      .filter((c) => c.kind === kind)
      .sort((a, b) => (byId.get(b.id) ? byId.get(b.id).total : 0) - (byId.get(a.id) ? byId.get(a.id).total : 0));

    if (!cats.length) { box.appendChild(UI.empty('Nenhuma categoria cadastrada.')); return; }

    cats.forEach((c) => {
      const t = byId.get(c.id);
      const total = t ? t.total : 0;
      const pct = grand > 0 ? (total / grand) * 100 : 0;
      box.appendChild(el('div', { class: 'cat-row' }, [
        Icons.categoryBadge(c.id, 28),
        el('div', {}, [
          el('div', { class: 'cat-name', text: c.name }),
          el('div', { class: 'muted', text: t ? `${t.count} lançamento(s) · ${r.label}` : `sem lançamentos · ${r.label}` })
        ]),
        el('div', { class: 'cat-stat' }, [
          document.createTextNode(U.fmtBRL(total)),
          el('small', { text: U.fmtPct(pct) })
        ]),
        el('div', { class: 'row-actions' }, [
          el('button', { class: 'icon-btn', title: 'Editar', text: '✎', onclick: () => Forms.openCategory(kind, c.id) })
        ])
      ]));
    });

    const orphan = byId.get('__none__');
    if (orphan) {
      box.appendChild(el('div', { class: 'cat-row' }, [
        Icons.categoryBadge(null, 28),
        el('div', {}, [
          el('div', { class: 'cat-name', text: 'Sem categoria' }),
          el('div', { class: 'muted', text: `${orphan.count} lançamento(s) sem categoria definida` })
        ]),
        el('div', { class: 'cat-stat' }, [
          document.createTextNode(U.fmtBRL(orphan.total)),
          el('small', { text: U.fmtPct(grand > 0 ? (orphan.total / grand) * 100 : 0) })
        ]),
        el('span')
      ]));
    }
  }

  function renderChart(r) {
    const rows = Calc.categoryTotals('expense', r.from, r.to).slice(0, 12);
    const title = document.getElementById('catHistTitle');
    if (!rows.length) {
      Charts.destroy('chartCatHistory');
      title.textContent = 'Sem despesas confirmadas no período';
      return;
    }
    const grand = U.sum(rows, (x) => x.total);
    title.textContent = `${rows[0].name} responde por ${U.fmtPct(rows[0].pct, 0)} — ${r.label} · ${U.fmtBRL(grand)}`;
    Charts.rankedBars('chartCatHistory', rows);

    // legenda com o ícone ao lado do nome (o eixo do gráfico só tem texto)
    const box = document.getElementById('chartCatHistory').closest('.card');
    const old = box.querySelector('.legend-icons');
    if (old) old.remove();
    const legend = el('div', { class: 'legend-icons' });
    rows.slice(0, 12).forEach((row) => {
      legend.appendChild(el('span', {}, [
        Icons.categoryBadge(row.id === '__none__' ? null : row.id, 20),
        document.createTextNode(row.name)
      ]));
    });
    box.appendChild(legend);
  }

  global.Cat = Cat;
})(window);
