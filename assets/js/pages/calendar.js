/* =============================================================
   pages/calendar.js — Calendário financeiro
   ------------------------------------------------------------
   O mês como grade. Cada dia mostra pontos (entrada, saída,
   fatura) e o saldo do dia; clicar abre a lista. Os eventos vêm
   de Calc.calendarEvents — a página não sabe somar nada.
   ============================================================= */
(function (global) {
  'use strict';

  const el = U.el;
  const Cal = {};

  Cal.render = function () {
    const ym = App.ym;
    const p = U.ymParts(ym);
    const eventos = Calc.calendarEvents(ym);

    document.getElementById('calTitle').textContent = U.smartCase(U.monthLabel(ym));
    montaGrade(p, eventos, ym);
    montaDia(eventos, ym);
  };

  function montaGrade(p, eventos, ym) {
    const grade = U.clear(document.getElementById('calGrid'));

    // cabeçalho da semana: domingo primeiro, como o calendário brasileiro
    ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].forEach((d) => {
      grade.appendChild(el('span', { class: 'cal-dow', text: d }));
    });

    const primeiro = new Date(p.y, p.m, 1).getDay();   // 0 = domingo
    const dias = U.daysInMonth(p.y, p.m);
    const hoje = U.todayISO();

    // casas vazias antes do dia 1, para o mês cair na coluna certa
    for (let i = 0; i < primeiro; i++) grade.appendChild(el('span', { class: 'cal-cell is-empty' }));

    for (let d = 1; d <= dias; d++) {
      const iso = U.isoOf(p.y, p.m, d);
      const evs = eventos[d] || [];
      const entrada = U.sum(evs.filter((e) => e.tipo === 'in'), (e) => e.valor);
      const saida = U.sum(evs.filter((e) => e.tipo === 'out' || e.tipo === 'due'), (e) => e.valor);
      const liquido = U.round2(entrada - saida);
      const selecionado = App.calDay === d;

      const cell = el('button', {
        type: 'button',
        class: 'cal-cell'
          + (iso === hoje ? ' is-today' : '')
          + (selecionado ? ' is-sel' : '')
          + (evs.length ? '' : ' is-quiet'),
        'aria-label': `${d} de ${U.MONTHS[p.m]}` + (evs.length ? `, ${evs.length} evento(s)` : ', sem eventos'),
        'aria-pressed': selecionado ? 'true' : 'false',
        onclick: () => { App.calDay = d; Cal.render(); }
      }, [
        el('span', { class: 'cal-num', text: String(d) }),
        evs.length
          ? el('span', { class: 'cal-dots' }, [
            evs.some((e) => e.tipo === 'in') ? el('i', { class: 'dot-in' }) : null,
            evs.some((e) => e.tipo === 'out') ? el('i', { class: 'dot-out' }) : null,
            evs.some((e) => e.tipo === 'due') ? el('i', { class: 'dot-due' }) : null
          ].filter(Boolean))
          : null,
        evs.length
          ? el('span', {
            class: 'cal-sum ' + (liquido >= 0 ? 'val-pos' : 'val-neg'),
            text: (liquido >= 0 ? '+' : '−') + U.fmtCompact(Math.abs(liquido))
          })
          : null
      ].filter(Boolean));

      grade.appendChild(cell);
    }
    void ym;
  }

  function montaDia(eventos, ym) {
    const titulo = document.getElementById('calDayTitle');
    const box = U.clear(document.getElementById('calDayList'));

    if (!App.calDay) {
      titulo.textContent = 'Selecione um dia';
      box.appendChild(UI.empty('Clique em um dia da grade para ver o que acontece nele.'));
      return;
    }

    const p = U.ymParts(ym);
    const iso = U.isoOf(p.y, p.m, U.clampDay(p.y, p.m, App.calDay));
    const evs = eventos[App.calDay] || [];
    titulo.textContent = U.fmtDateBR(iso);

    if (!evs.length) {
      box.appendChild(UI.empty('Nenhuma movimentação neste dia.'));
      return;
    }

    const ul = el('ul', { class: 'tx-list' });
    evs.forEach((e) => {
      const sinal = e.tipo === 'in' ? '+ ' : e.tipo === 'tr' ? '' : '− ';
      const classe = e.tipo === 'in' ? 'val-pos' : e.tipo === 'tr' ? '' : 'val-neg';

      ul.appendChild(el('li', {
        class: 'tx-item' + (e.confirmado ? '' : ' is-pending')
      }, [
        el('span', { class: 'cal-kind is-' + e.tipo, title: rotulo(e.tipo) },
          Icons.lucide(e.tipo === 'due' ? 'credit-card' : e.tipo === 'in' ? 'arrow-up-right' : e.tipo === 'tr' ? 'arrow-left-right' : 'arrow-down-right', 15)),
        el('div', { class: 'tx-main' }, [
          el('div', { class: 'tx-name', text: e.titulo }),
          el('div', { class: 'tx-meta' }, [
            el('span', { text: e.categoria }),
            !e.confirmado ? UI.badge(e.tipo === 'due' ? 'Em aberto' : 'Previsto', 'pend') : null
          ].filter(Boolean))
        ]),
        el('span', { class: 'tx-amount ' + classe, text: sinal + U.fmtBRL(e.valor) }),
        el('div', { class: 'tx-actions' }, [
          e.txId
            ? el('button', {
              class: 'icon-btn', title: 'Editar lançamento', 'aria-label': 'Editar ' + e.titulo,
              onclick: () => Forms.openTransaction(null, e.txId)
            }, Icons.lucide('pencil', 14))
            : el('button', {
              class: 'icon-btn', title: 'Ver fatura', 'aria-label': 'Ver fatura',
              onclick: () => App.goTo('accounts', { tab: 'cards', cardId: e.cardId, invoiceRef: e.ref })
            }, Icons.lucide('chevron-right', 14))
        ])
      ]));
    });
    box.appendChild(ul);
  }

  function rotulo(tipo) {
    return tipo === 'in' ? 'Entrada' : tipo === 'out' ? 'Saída'
      : tipo === 'due' ? 'Vencimento de fatura' : 'Transferência';
  }

  global.Cal = Cal;
})(window);
