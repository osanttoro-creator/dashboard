/* =============================================================
   cards.js — a carteira: contas de débito e cartões de crédito
   desenhados como cartões físicos, no mesmo material.
   ------------------------------------------------------------
   Só apresentação: todos os números vêm de Calc.invoice(),
   Calc.cardUsed() e Calc.accountBalance(), exatamente como antes.
   ============================================================= */
(function (global) {
  'use strict';

  const el = U.el;
  const Cards = {};

  /* ---------------- gradientes ---------------- */

  /**
   * Pares (claro → escuro) no registro do oásis.
   * Cada ponta CLARA foi verificada até o texto branco do cartão passar
   * WCAG AA (≥ 4,5:1) sobre ela — considerando a camada de 18% que o CSS
   * aplica por cima. O pior caso da lista é 4,62:1 (terracota).
   * Alterar estes hexes exige refazer essa conta (ver README).
   */
  Cards.GRADIENTS = [
    { key: 'terracota', name: 'Terracota', a: '#C9794A', b: '#8E4E2A' },
    { key: 'salvia', name: 'Sálvia', a: '#6E7A5E', b: '#414A36' },
    { key: 'argila', name: 'Argila', a: '#96795A', b: '#5F4832' },
    { key: 'terra', name: 'Terra', a: '#5A3E2B', b: '#2E1F14' },
    { key: 'ocre', name: 'Ocre', a: '#A8763A', b: '#6E4818' },
    { key: 'adobe', name: 'Adobe', a: '#A0553F', b: '#652F22' },
    { key: 'oliva', name: 'Oliva', a: '#77743E', b: '#484621' },
    { key: 'oasis', name: 'Oásis', a: '#4E7A72', b: '#2A4A45' },
    { key: 'duna', name: 'Duna', a: '#8A7150', b: '#54422C' },
    { key: 'ferrugem', name: 'Ferrugem', a: '#9B4A2F', b: '#5E2718' },
    { key: 'bronze', name: 'Bronze', a: '#8A6A4F', b: '#523D2C' },
    { key: 'ametista', name: 'Ametista', a: '#6B4A76', b: '#3D2945' }
  ];

  Cards.gradientByKey = (key) => Cards.GRADIENTS.find((g) => g.key === key) || null;

  /**
   * Gradiente efetivo do cartão: o escolhido pelo usuário, senão um
   * derivado da cor do banco, senão um estável pelo id (sem sorteio,
   * para o cartão não trocar de cor a cada render).
   */
  Cards.gradientFor = function (card) {
    const chosen = Cards.gradientByKey(card.gradient);
    if (chosen) return chosen;
    const near = nearestGradient(card.color);
    if (near) return near;
    let h = 0;
    String(card.id || card.name || '').split('').forEach((ch) => { h = (h * 31 + ch.charCodeAt(0)) >>> 0; });
    return Cards.GRADIENTS[h % Cards.GRADIENTS.length];
  };

  function rgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '').trim());
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
  }
  function nearestGradient(hex) {
    const c = rgb(hex);
    if (!c) return null;
    let best = null, bestD = Infinity;
    Cards.GRADIENTS.forEach((g) => {
      const a = rgb(g.a);
      const d = (a.r - c.r) ** 2 + (a.g - c.g) ** 2 + (a.b - c.b) ** 2;
      if (d < bestD) { bestD = d; best = g; }
    });
    return bestD < 9000 ? best : null;   // só quando é de fato parecido
  }

  /**
   * "•••• 4352" — os 4 últimos dígitos são opcionais no cadastro e são
   * TUDO o que o app guarda de número. Nunca o número completo.
   */
  Cards.maskedNumber = function (card) {
    const last = String(card.last4 || '').replace(/\D/g, '').slice(-4);
    return '•••• •••• •••• ' + (last || '••••');
  };

  /** Na conta não existe "número do cartão": o identificador é a conta em si. */
  function accountNumber(acc) {
    const last = String(acc.last4 || '').replace(/\D/g, '').slice(-4);
    return last ? '•••• ' + last : U.smartCase(acc.type || 'Conta');
  }

  /* ---------------- casco comum ---------------- */

  /**
   * O corpo do cartão, usado por débito e crédito. O que muda entre os
   * dois é o conteúdo — o material é o mesmo, e é isso que faz a
   * página inteira ler como uma carteira.
   *
   * @param {object} o  { kind, title, sub, bank, grad, focused, status,
   *                      number, barPct, footLeft, footRight, title2, onClick }
   */
  function shell(o) {
    const filhos = [];
    if (o.status) filhos.push(el('span', { class: 'cc-status' }, o.status));

    filhos.push(el('span', { class: 'cc-row' }, [
      Icons.bankTile(o.bank || o.title, 34, o.grad.a),
      el('span', { class: 'cc-id' }, [
        el('span', { class: 'cc-title', text: o.title, title: o.title }),
        el('span', { class: 'cc-sub', text: o.sub || '' })
      ]),
      el('span', { class: 'cc-kind', text: o.kind })
    ]));

    filhos.push(el('span', { class: 'cc-number', text: o.number }));

    const base = [];
    if (o.barPct != null) {
      base.push(el('span', {
        class: 'cc-limit-bar' + (o.barPct >= 90 ? ' is-critical' : o.barPct >= 70 ? ' is-warning' : '')
      }, el('i', { style: { width: o.barPct + '%' } })));
    }
    base.push(el('span', { class: 'cc-foot', style: { marginTop: o.barPct != null ? '8px' : '0' } }, [
      el('span', { class: 'cc-holder' }, [
        el('span', { class: 'k', text: o.footLeft.k }),
        el('span', { class: 'v', text: o.footLeft.v })
      ]),
      el('span', { class: 'cc-invoice' }, [
        el('span', { class: 'k', text: o.footRight.k }),
        el('span', { class: 'v', text: o.footRight.v })
      ])
    ]));
    filhos.push(el('span', {}, base));

    return el('button', {
      type: 'button',
      class: 'wallet-card' + (o.focused ? ' is-focused' : ''),
      style: { '--cc-a': o.grad.a, '--cc-b': o.grad.b },
      'aria-pressed': o.focused ? 'true' : 'false',
      title: o.hint || o.title,
      onclick: o.onClick || null
    }, filhos);
  }
  Cards.shell = shell;

  /* ---------------- cartão de crédito ---------------- */

  /**
   * @param {object} card    cartão do Store
   * @param {string} ref     'YYYY-MM' da fatura a exibir
   * @param {object} opts    { focused, onClick }
   */
  Cards.render = function (card, ref, opts) {
    const o = opts || {};
    // Calc.invoice só conhece cartões já salvos; na prévia do formulário o
    // cartão ainda não existe, então montamos uma fatura vazia com datas reais.
    const inv = Calc.invoice(card.id, ref) || (function () {
      const d = Calc.invoiceDates(card, ref);
      return {
        planned: 0, total: 0, items: [], paid: false, isOpen: true, isOverdue: false,
        openDate: d.openDate, closeDate: d.closeDate, dueDate: d.dueDate
      };
    })();
    const used = Store.cards.get(card.id) ? Calc.cardUsed(card.id) : 0;
    const pct = card.limit > 0 ? Math.min(100, (used / card.limit) * 100) : 0;

    return shell({
      kind: 'Crédito',
      title: card.name,
      sub: card.bank || 'Cartão de crédito',
      bank: card.bank || card.name,
      grad: Cards.gradientFor(card),
      focused: o.focused,
      hint: `${card.name} · fatura de ${U.monthLabel(ref)}`,
      status: inv.paid ? UI.badge('Paga', 'ok')
        : inv.isOverdue ? UI.badge('Vencida', 'late')
          : inv.isOpen ? UI.badge('Aberta', 'pend') : UI.badge('A pagar', 'pend'),
      number: Cards.maskedNumber(card),
      barPct: pct,
      footLeft: card.limit > 0
        ? { k: 'Limite livre', v: U.fmtBRL(Math.max(0, card.limit - used)) }
        : { k: 'Vence', v: U.fmtDateBR(inv.dueDate) },
      footRight: { k: 'Fatura ' + U.monthLabel(ref, true), v: U.fmtBRL(inv.planned) },
      onClick: () => { if (o.onClick) o.onClick(card, ref); }
    });
  };

  /* ---------------- conta de débito ---------------- */

  /**
   * A conta ganha o mesmo cartão do crédito. Sem fatura e sem limite:
   * o número grande é o saldo, e a faixa diz "Débito".
   *
   * @param {object} acc   conta do Store
   * @param {string} upto  data ISO do saldo ("saldo em")
   */
  Cards.account = function (acc, upto, opts) {
    const o = opts || {};
    const saldo = Store.accounts && Store.accounts.get(acc.id)
      ? Calc.accountBalance(acc.id, upto)
      : U.round2(+acc.openingBalance || 0);
    const grad = Cards.gradientFor({ id: acc.id, name: acc.name, color: acc.color, gradient: acc.gradient });

    return shell({
      kind: 'Débito',
      title: acc.name,
      sub: acc.bank ? `${acc.bank} · ${acc.type}` : acc.type,
      bank: acc.bank || acc.name,
      grad,
      focused: o.focused,
      hint: `${acc.name} · saldo em ${U.fmtDateBR(upto)}`,
      number: accountNumber(acc),
      barPct: null,
      footLeft: { k: 'Saldo em', v: U.fmtDateBR(upto) },
      footRight: { k: 'Saldo atual', v: U.fmtBRL(saldo) },
      onClick: () => { if (o.onClick) o.onClick(acc); }
    });
  };

  /**
   * Leque de cartões. `limit` corta a quantidade (a visão do Início
   * mostra 2). Devolve o elemento pronto.
   */
  Cards.deck = function (cards, baseYM, opts) {
    const o = opts || {};
    const deck = el('div', { class: 'wallet-deck' });
    const list = o.limit ? cards.slice(0, o.limit) : cards;
    list.forEach((card) => {
      const ref = o.refFor ? o.refFor(card) : Calc.currentInvoiceRef(card, baseYM);
      deck.appendChild(Cards.render(card, ref, {
        focused: o.focusedId === card.id,
        onClick: o.onClick
      }));
    });
    return deck;
  };

  /** Leque de contas de débito, no mesmo formato do leque de cartões. */
  Cards.accountDeck = function (accounts, upto, opts) {
    const o = opts || {};
    const deck = el('div', { class: 'wallet-deck' });
    const list = o.limit ? accounts.slice(0, o.limit) : accounts;
    list.forEach((a) => {
      deck.appendChild(Cards.account(a, upto, { focused: o.focusedId === a.id, onClick: o.onClick }));
    });
    return deck;
  };

  /**
   * Painel da fatura do cartão em foco: itens, totais, datas e limite.
   * Reaproveita exatamente os dados de Calc.invoice().
   */
  Cards.invoicePanel = function (card, ref, opts) {
    const o = opts || {};
    const inv = Calc.invoice(card.id, ref);
    const used = Calc.cardUsed(card.id);
    const box = el('div', { class: 'cc-detail' });

    const head = el('div', { class: 'cc-detail-head' }, [
      Icons.bankTile(card.bank || card.name, 30, card.color),
      el('h3', { text: card.name }),
      inv.paid ? UI.badge(`Paga em ${U.fmtDateBR(inv.paidAt)}`, 'ok')
        : inv.isOverdue ? UI.badge('Vencida', 'late')
          : inv.isOpen ? UI.badge('Aberta', 'pend') : UI.badge('Fechada · a pagar', 'pend')
    ]);
    if (o.showNav !== false) {
      head.appendChild(el('div', { class: 'row gap-6 row-actions' }, [
        el('button', { class: 'icon-btn', title: 'Fatura anterior', text: '‹', onclick: () => o.onNav && o.onNav(-1) }),
        el('strong', { class: 'inv-ref', text: U.monthLabel(ref, true) }),
        el('button', { class: 'icon-btn', title: 'Próxima fatura', text: '›', onclick: () => o.onNav && o.onNav(1) })
      ]));
    }
    box.appendChild(head);

    const fig = (k, v) => el('div', { class: 'inv-fig' }, [
      el('span', { class: 'k', text: k }), el('span', { class: 'v', text: v })
    ]);
    box.appendChild(el('div', { class: 'inv-summary' }, [
      fig('Total da fatura', U.fmtBRL(inv.planned)),
      fig('Confirmado', U.fmtBRL(inv.total)),
      fig('Período', `${U.fmtDayMonth(inv.openDate)} – ${U.fmtDayMonth(inv.closeDate)}`),
      fig('Vencimento', U.fmtDateBR(inv.dueDate)),
      fig('Limite disponível', card.limit > 0 ? U.fmtBRL(Math.max(0, card.limit - used)) : '—')
    ]));

    box.appendChild(el('div', { class: 'row gap-6', style: { marginBottom: '14px', flexWrap: 'wrap' } }, [
      inv.paid
        ? el('button', {
          class: 'btn btn-outline btn-sm', text: 'Desfazer pagamento',
          onclick: () => { Store.setInvoicePaid(card.id, ref, false); UI.toast('Pagamento desfeito.'); }
        })
        : el('button', {
          class: 'btn btn-primary btn-sm', text: 'Marcar fatura como paga',
          onclick: () => Forms.openInvoicePayment(card.id, ref)
        }),
      el('button', {
        class: 'btn btn-outline btn-sm', text: '+ Lançar no crédito',
        onclick: () => Forms.openTransaction('expense', null, {
          method: 'card', cardId: card.id,
          date: inv.closeDate < U.todayISO() ? inv.closeDate : U.todayISO()
        })
      }),
      el('button', { class: 'btn btn-ghost btn-sm', text: '✎ Editar cartão', onclick: () => Forms.openCard(card.id) })
    ]));

    if (!inv.items.length) {
      box.appendChild(UI.empty('Nenhum lançamento nesta fatura.'));
      return box;
    }

    const table = el('table', { class: 'table table-compact' }, [
      el('thead', {}, el('tr', {}, [
        el('th'), el('th'), el('th', { text: 'Data' }), el('th', { text: 'Descrição' }),
        el('th', { text: 'Categoria' }), el('th', { class: 'num', text: 'Valor' }), el('th')
      ])),
      el('tbody')
    ]);
    const tbody = table.querySelector('tbody');

    inv.items.forEach((e) => {
      const cb = el('input', { type: 'checkbox', 'aria-label': 'Confirmar ' + e.description });
      cb.checked = e.confirmed;
      cb.addEventListener('change', () => Store.transactions.setConfirmed(e.txId, e.ym, cb.checked));
      tbody.appendChild(el('tr', { class: e.confirmed ? '' : 'is-pending' }, [
        el('td', {}, el('label', { class: 'check' }, cb)),
        el('td', {}, Icons.categoryBadge(e.categoryId, 22)),
        el('td', { text: U.fmtDayMonth(e.date) }),
        el('td', {}, [
          document.createTextNode(e.description + ' '),
          e.installment ? UI.badge(`${e.installment.index}/${e.installment.total}`, 'inst') : null,
          !e.confirmed ? UI.badge('Previsto', 'pend') : null
        ].filter(Boolean)),
        el('td', { text: Calc.categoryName(e.categoryId) }),
        el('td', { class: 'num', text: U.fmtBRL(e.amount) }),
        el('td', {}, el('div', { class: 'row-actions' },
          el('button', { class: 'icon-btn', title: 'Editar', text: '✎', onclick: () => Forms.openTransaction(null, e.txId) })))
      ]));
    });

    table.appendChild(el('tfoot', {}, el('tr', {}, [
      el('td', { colspan: 5, text: `Total da fatura (${inv.items.length} itens)` }),
      el('td', { class: 'num', text: U.fmtBRL(inv.planned) }),
      el('td')
    ])));

    box.appendChild(el('div', { class: 'table-wrap' }, table));
    return box;
  };

  global.Cards = Cards;
})(window);
