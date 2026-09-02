/* =============================================================
   pages/recurring.js — Recorrências e Assinaturas
   ------------------------------------------------------------
   Não há um "tipo assinatura" no modelo: assinatura é uma
   despesa fixa. Esta página é uma leitura dos lançamentos que já
   existem (recurring = true), não um cadastro paralelo — criar
   um segundo lugar para o mesmo dado seria criar divergência.
   ============================================================= */
(function (global) {
  'use strict';

  const el = U.el;
  const Rec = {};

  /* Categorias que costumam abrigar assinaturas. A aba "Assinaturas"
     é um filtro sobre as fixas, não outra coleção. */
  const ASSINATURA = /assinatura|streaming|mensalidade|plano|software|nuvem|academia/;

  Rec.render = function () {
    const prof = Store.profile();
    U.$$('#recTabs .tab').forEach((b) =>
      b.classList.toggle('is-active', b.dataset.rectab === App.recTab));

    const fixas = prof.transactions.filter((t) => t.recurring && t.kind !== 'transfer');
    const ehAssinatura = (t) =>
      ASSINATURA.test(U.norm(Calc.categoryName(t.categoryId))) || ASSINATURA.test(U.norm(t.description));

    const lista = App.recTab === 'subs' ? fixas.filter(ehAssinatura) : fixas;
    const despesas = lista.filter((t) => t.kind === 'expense');
    const receitas = lista.filter((t) => t.kind === 'income');

    renderKpis(fixas, lista, despesas, receitas);
    renderLista(lista);

    document.getElementById('recTitle').textContent =
      App.recTab === 'subs' ? 'Assinaturas e mensalidades' : 'Lançamentos fixos';
  };

  function renderKpis(todas, lista, despesas, receitas) {
    const saidaMes = U.sum(despesas, (t) => t.amount);
    const entradaMes = U.sum(receitas, (t) => t.amount);
    const encerrando = lista.filter((t) => t.recurEnd).length;

    UI.renderKpis('recKpis', [
      {
        label: 'Compromisso mensal',
        value: U.fmtBRL(saidaMes),
        accent: 'var(--expense)',
        hero: true,
        delta: saidaMes > 0
          ? `<span class="muted">${U.fmtBRL(U.round2(saidaMes * 12))} por ano</span>`
          : '<span class="muted">Nenhuma despesa fixa</span>'
      },
      {
        label: 'Entrada fixa',
        value: U.fmtBRL(entradaMes),
        accent: 'var(--income)',
        delta: `<span class="muted">${receitas.length} receita(s) recorrente(s)</span>`
      },
      {
        label: App.recTab === 'subs' ? 'Assinaturas ativas' : 'Recorrências ativas',
        value: String(lista.length),
        accent: 'var(--accent)',
        delta: encerrando
          ? `<span class="muted">${encerrando} com data para encerrar</span>`
          : `<span class="muted">de ${todas.length} recorrência(s) no total</span>`
      }
    ]);
  }

  function renderLista(lista) {
    const box = U.clear(document.getElementById('recList'));

    if (!lista.length) {
      box.appendChild(el('div', { class: 'empty-state' }, [
        el('span', { class: 'empty-ico' }, Icons.lucide('repeat', 26)),
        el('p', { class: 'empty-title', text: App.recTab === 'subs' ? 'Nenhuma assinatura encontrada' : 'Nenhuma recorrência' }),
        el('p', {
          class: 'empty-sub',
          text: App.recTab === 'subs'
            ? 'Assinaturas são despesas fixas em categorias como Assinaturas, Streaming ou Academia.'
            : 'Marque "repete todo mês" ao criar um lançamento para ele aparecer aqui.'
        }),
        el('button', { class: 'btn btn-primary btn-sm', text: '− Nova despesa fixa', onclick: () => Forms.openTransaction('expense') })
      ]));
      return;
    }

    const ordenada = lista.slice().sort((a, b) => b.amount - a.amount);
    const anual = U.sum(ordenada.filter((t) => t.kind === 'expense'), (t) => t.amount) * 12;

    const ul = el('ul', { class: 'rec-list' });
    ordenada.forEach((t) => {
      const cat = Calc.categoryById(t.categoryId);
      const cor = cat ? cat.color : 'var(--muted)';
      const encerra = t.recurEnd;
      const cartao = t.cardId ? Store.cards.get(t.cardId) : null;

      ul.appendChild(el('li', { class: 'rec-item' }, [
        el('span', {
          class: 'cat-badge',
          style: {
            width: '34px', height: '34px',
            background: 'color-mix(in srgb, ' + cor + ' 18%, transparent)', color: cor
          }
        }, Icons.lucide(Icons.forCategory(cat), 17)),

        el('div', { class: 'rec-main' }, [
          el('div', { class: 'rec-name', text: t.description }),
          el('div', { class: 'rec-meta' }, [
            el('span', { text: Calc.categoryName(t.categoryId) }),
            el('span', { text: 'dia ' + t.date.slice(8, 10) }),
            t.kind === 'expense' ? Icons.methodBadge(t.method, cartao ? cartao.name : undefined) : null,
            encerra ? UI.badge('até ' + U.monthLabel(encerra, true), 'inst') : null
          ].filter(Boolean))
        ]),

        el('div', { class: 'rec-nums' }, [
          el('span', {
            class: 'rec-val ' + (t.kind === 'income' ? 'val-pos' : 'val-neg'),
            text: (t.kind === 'income' ? '+ ' : '− ') + U.fmtBRL(t.amount)
          }),
          el('span', { class: 'rec-year', text: U.fmtBRL(U.round2(t.amount * 12)) + '/ano' })
        ]),

        el('div', { class: 'row-actions' }, [
          el('button', {
            class: 'icon-btn', title: 'Editar', 'aria-label': 'Editar ' + t.description,
            onclick: () => Forms.openTransaction(null, t.id)
          }, Icons.lucide('pencil', 15)),
          el('button', {
            class: 'icon-btn danger', title: 'Encerrar', 'aria-label': 'Encerrar ' + t.description,
            onclick: () => encerrar(t)
          }, Icons.lucide('x', 15))
        ])
      ]));
    });
    box.appendChild(ul);

    if (anual > 0) {
      box.appendChild(el('p', {
        class: 'rec-total',
        text: 'Somando tudo, estas recorrências comprometem ' + U.fmtBRL(U.round2(anual)) + ' por ano.'
      }));
    }
  }

  /** Encerrar ≠ excluir: o histórico até aqui continua valendo. */
  async function encerrar(t) {
    const ok = await UI.confirm({
      title: 'Encerrar recorrência',
      message: `<strong>${U.escape(t.description)}</strong> deixa de se repetir a partir do mês seguinte a ` +
        `<strong>${U.monthLabel(App.ym)}</strong>. Os lançamentos anteriores continuam no histórico.`,
      confirmLabel: 'Encerrar'
    });
    if (!ok) return;
    Store.transactions.update(t.id, { recurEnd: App.ym });
    UI.toast('Recorrência encerrada em ' + U.monthLabel(App.ym, true) + '.', 'success');
  }

  global.Rec = Rec;
})(window);
