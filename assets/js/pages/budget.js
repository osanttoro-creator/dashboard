/* =============================================================
   pages/budget.js — Orçamento
   ------------------------------------------------------------
   Um limite mensal por categoria de despesa. O gasto vem de
   Calc.categoryTotals, o mesmo número da página de categorias:
   orçamento não recalcula nada, só compara.
   ============================================================= */
(function (global) {
  'use strict';

  const el = U.el;
  const Bud = {};

  Bud.render = function () {
    const ym = App.ym;
    const de = U.monthStart(ym), ate = U.monthEnd(ym);
    const limites = Store.budgets.all();
    const gastos = Calc.categoryTotals('expense', de, ate);
    const porCat = {};
    gastos.forEach((g) => { porCat[g.id] = g.total; });

    const linhas = Object.keys(limites).map((id) => {
      const cat = Calc.categoryById(id);
      const limite = limites[id];
      const gasto = porCat[id] || 0;
      return {
        id, limite, gasto,
        nome: cat ? cat.name : 'Categoria removida',
        cor: cat ? cat.color : 'var(--muted)',
        icone: cat ? Icons.forCategory(cat) : 'circle-ellipsis',
        pct: limite > 0 ? (gasto / limite) * 100 : 0,
        sobra: U.round2(limite - gasto),
        orfa: !cat
      };
    }).sort((a, b) => b.pct - a.pct);

    renderKpis(linhas, ym);
    renderLista(linhas, ym);
  };

  function renderKpis(linhas, ym) {
    const limite = U.sum(linhas, (r) => r.limite);
    const gasto = U.sum(linhas, (r) => r.gasto);
    const estourou = linhas.filter((r) => r.gasto > r.limite).length;
    const totalMes = Calc.monthTotals(ym).expense;
    const foraDoOrcamento = U.round2(totalMes - gasto);

    UI.renderKpis('budgetKpis', [
      {
        label: 'Limite definido',
        value: U.fmtBRL(limite),
        accent: 'var(--accent)',
        delta: linhas.length
          ? `<span class="muted">${linhas.length} categoria(s) com limite</span>`
          : '<span class="muted">Nenhum limite definido ainda</span>'
      },
      {
        label: 'Gasto dentro do limite',
        value: U.fmtBRL(gasto),
        accent: 'var(--expense)',
        valueClass: gasto > limite ? 'val-neg' : '',
        delta: limite > 0
          ? `${U.fmtPct((gasto / limite) * 100, 0)} do que você reservou`
          : '<span class="muted">—</span>'
      },
      {
        label: estourou ? 'Categorias estouradas' : 'Sobra do orçamento',
        value: estourou ? String(estourou) : U.fmtBRL(Math.max(0, U.round2(limite - gasto))),
        accent: estourou ? 'var(--critical)' : 'var(--good)',
        valueClass: estourou ? 'val-neg' : 'val-pos',
        hero: true,
        delta: foraDoOrcamento > 0
          ? `<span class="muted">+ ${U.fmtBRL(foraDoOrcamento)} gastos em categorias sem limite</span>`
          : '<span class="muted">Todo gasto do mês está coberto por um limite</span>'
      }
    ]);

    document.getElementById('budgetNote').textContent = U.monthLabel(ym);
  }

  function renderLista(linhas, ym) {
    const box = U.clear(document.getElementById('budgetList'));

    if (!linhas.length) {
      box.appendChild(el('div', { class: 'empty-state' }, [
        el('span', { class: 'empty-ico' }, Icons.lucide('target', 26)),
        el('p', { class: 'empty-title', text: 'Nenhum limite definido' }),
        el('p', { class: 'empty-sub', text: 'Escolha uma categoria e diga quanto pretende gastar por mês. O acompanhamento é automático.' }),
        el('button', { class: 'btn btn-primary btn-sm', text: '+ Definir limite', onclick: () => Bud.open() })
      ]));
      return;
    }

    linhas.forEach((r) => {
      const estado = r.pct >= 100 ? 'is-over' : r.pct >= 80 ? 'is-near' : '';
      // a barra passa de 100%: o excesso precisa ser visível, não recortado
      const largura = Math.min(100, r.pct);

      box.appendChild(el('div', { class: 'bud-row ' + estado }, [
        el('span', {
          class: 'cat-badge',
          style: {
            width: '34px', height: '34px',
            background: 'color-mix(in srgb, ' + r.cor + ' 18%, transparent)',
            color: r.cor
          }
        }, Icons.lucide(r.icone, 17)),

        el('div', { class: 'bud-main' }, [
          el('div', { class: 'bud-top' }, [
            el('span', { class: 'bud-name', text: r.nome }),
            r.orfa ? UI.badge('categoria removida', 'late') : null,
            el('span', { class: 'bud-val' }, [
              el('strong', { class: r.gasto > r.limite ? 'val-neg' : '', text: U.fmtBRL(r.gasto) }),
              el('span', { class: 'muted', text: ' de ' + U.fmtBRL(r.limite) })
            ])
          ].filter(Boolean)),
          el('span', { class: 'bud-bar' }, el('i', { style: { width: largura + '%', background: r.cor } })),
          el('div', { class: 'bud-foot' }, [
            el('span', { class: 'muted', text: U.fmtPct(r.pct, 0) + ' usado' }),
            el('span', {
              class: r.sobra >= 0 ? 'val-pos' : 'val-neg',
              text: r.sobra >= 0
                ? 'Restam ' + U.fmtBRL(r.sobra)
                : 'Passou ' + U.fmtBRL(Math.abs(r.sobra))
            })
          ])
        ]),

        el('div', { class: 'row-actions' }, [
          el('button', {
            class: 'icon-btn', title: 'Alterar limite', 'aria-label': 'Alterar limite de ' + r.nome,
            onclick: () => Bud.open(r.id)
          }, Icons.lucide('pencil', 15)),
          el('button', {
            class: 'icon-btn danger', title: 'Remover limite', 'aria-label': 'Remover limite de ' + r.nome,
            onclick: async () => {
              const ok = await UI.confirm({
                title: 'Remover limite',
                message: `Remover o limite de <strong>${U.escape(r.nome)}</strong>? Os lançamentos não são afetados.`,
                confirmLabel: 'Remover', danger: true
              });
              if (ok) { Store.budgets.remove(r.id); UI.toast('Limite removido.'); }
            }
          }, Icons.lucide('trash-2', 15))
        ])
      ]));
    });
    void ym;
  }

  /** Formulário de limite. Sem categoria escolhida, oferece as de despesa. */
  Bud.open = function (categoryId) {
    /* Orçamento é por categoria: já existir um para esta
       categoria é edição, não criação. */
    const jaTem = categoryId && Store.budgets && Store.budgets.get && Store.budgets.get(categoryId);
    if (!jaTem && global.Limites && !Limites.exigirEspaco('budgets')) return;
    const cats = Store.profile().categories.filter((c) => c.kind === 'expense');
    if (!cats.length) {
      UI.toast('Crie uma categoria de despesa antes de definir um limite.', 'error');
      return;
    }
    const atual = categoryId || cats[0].id;

    const sel = el('select', { class: 'input' });
    cats.forEach((c) => sel.appendChild(el('option', { value: c.id, text: c.name })));
    sel.value = atual;
    if (categoryId) sel.disabled = true;

    const valor = el('input', {
      class: 'input', type: 'text', inputmode: 'decimal',
      value: U.fmtNum(Store.budgets.get(atual) || 0)
    });

    /* sugestão baseada no que a pessoa realmente gasta — um limite tirado
       do nada é abandonado na primeira semana */
    const media = mediaDeGasto(atual);
    const dica = el('p', { class: 'hint' });
    function atualizaDica() {
      const m = mediaDeGasto(sel.value);
      dica.textContent = m > 0
        ? `Nos últimos 3 meses você gastou em média ${U.fmtBRL(m)} nesta categoria.`
        : 'Sem histórico nesta categoria nos últimos 3 meses.';
    }
    sel.addEventListener('change', () => {
      valor.value = U.fmtNum(Store.budgets.get(sel.value) || 0);
      atualizaDica();
    });
    atualizaDica();
    void media;

    UI.openModal({
      title: categoryId ? 'Alterar limite' : 'Definir limite mensal',
      body: el('div', { class: 'form-grid' }, [
        el('label', { class: 'field span-2' }, [
          el('span', { class: 'field-label', text: 'Categoria' }), sel
        ]),
        el('label', { class: 'field span-2' }, [
          el('span', { class: 'field-label', text: 'Limite por mês (R$)' }), valor, dica
        ])
      ]),
      buttons: [
        { label: 'Cancelar', class: 'btn-outline', onClick: UI.closeModal },
        {
          label: 'Salvar', class: 'btn-primary',
          onClick: () => {
            const v = U.parseMoney(valor.value) || 0;
            if (v <= 0) { UI.toast('Informe um valor maior que zero.', 'error'); return; }
            Store.budgets.set(sel.value, v);
            UI.toast('Limite salvo.', 'success');
            UI.closeModal();
          }
        }
      ]
    });
  };

  function mediaDeGasto(categoryId) {
    let soma = 0;
    for (let i = 1; i <= 3; i++) {
      const m = U.addMonths(App.ym, -i);
      const linhas = Calc.categoryTotals('expense', U.monthStart(m), U.monthEnd(m));
      const achou = linhas.find((l) => l.id === categoryId);
      if (achou) soma += achou.total;
    }
    return U.round2(soma / 3);
  }

  global.Bud = Bud;
})(window);
