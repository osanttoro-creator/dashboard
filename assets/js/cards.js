/* =============================================================
   cards.js — cartão de crédito desenhado como cartão físico
   ------------------------------------------------------------
   Só apresentação: todos os números vêm de Calc.invoice() e
   Calc.cardUsed(), exatamente como antes.
   ============================================================= */
(function (global) {
  'use strict';

  const el = U.el;
  const Cards = {};

  /* ---------------- gradientes ---------------- */

  /**
   * Pares (claro → escuro) derivados dos tokens do tema.
   * Cada ponta CLARA foi escurecida até o texto branco do cartão passar
   * WCAG AA (≥ 4,5:1) sobre ela — considerando a camada de 18% que o CSS
   * aplica por cima. Alterar estes hexes exige refazer essa conta.
   */
  Cards.GRADIENTS = [
    { key: 'roxo', name: 'Roxo', a: '#7C6CF0', b: '#5A4FCF' },
    { key: 'verde', name: 'Verde', a: '#2D9E68', b: '#166A44' },
    { key: 'coral', name: 'Coral', a: '#F0554D', b: '#A82F29' },
    { key: 'ambar', name: 'Âmbar', a: '#AE8436', b: '#835916' },
    { key: 'ciano', name: 'Ciano', a: '#3C98A3', b: '#1A565F' },
    { key: 'grafite', name: 'Grafite', a: '#3A4050', b: '#171A22' },
    { key: 'indigo', name: 'Índigo', a: '#5A78F0', b: '#2C3D9E' },
    { key: 'rosa', name: 'Rosa', a: '#D5669B', b: '#90305D' }
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

  /** "•••• 4352" — os 4 últimos dígitos são opcionais no cadastro. */
  Cards.maskedNumber = function (card) {
    const last = String(card.last4 || '').replace(/\D/g, '').slice(-4);
    return '•••• •••• •••• ' + (last || '••••');
  };

  /* ---------------- o cartão ---------------- */

  /**
   * @param {object} card    cartão do Store
   * @param {string} ref     'YYYY-MM' da fatura a exibir
   * @param {object} opts    { focused, compact, onClick }
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
    const grad = Cards.gradientFor(card);

    const status = inv.paid ? UI.badge('Paga', 'ok')
      : inv.isOverdue ? UI.badge('Vencida', 'late')
        : inv.isOpen ? UI.badge('Aberta', 'pend') : UI.badge('A pagar', 'pend');

    const brand = el('span', { class: 'cc-brand' + (Icons.hasBank(card.bank) ? '' : ' is-generic') },
      Icons.bank(card.bank || card.name, 24));

    const node = el('button', {
      type: 'button',
      class: 'credit-card' + (o.focused ? ' is-focused' : ''),
      style: { '--cc-a': grad.a, '--cc-b': grad.b },
      'aria-pressed': o.focused ? 'true' : 'false',
      title: `${card.name} · fatura de ${U.monthLabel(ref)}`,
      onclick: () => { if (o.onClick) o.onClick(card, ref); }
    }, [
      el('span', { class: 'cc-status' }, status),
      el('span', { class: 'cc-row' }, [
        brand,
        el('span', {}, [
          el('span', { class: 'cc-holder' }, [
            el('span', { class: 'v', text: card.name })
          ]),
          el('span', { class: 'cc-bank', style: { color: 'rgba(255,255,255,.85)', fontSize: '10.5px' }, text: card.bank || '' })
        ]),
        el('span', { class: 'cc-chip' })
      ]),
      el('span', { class: 'cc-number', text: Cards.maskedNumber(card) }),
      el('span', {}, [
        el('span', { class: 'cc-limit-bar' + (pct >= 90 ? ' is-critical' : pct >= 70 ? ' is-warning' : '') },
          el('i', { style: { width: pct + '%' } })),
        el('span', { class: 'cc-foot', style: { marginTop: '8px' } }, [
          el('span', { class: 'cc-holder' }, [
            el('span', { class: 'k', text: card.limit > 0 ? 'Limite livre' : 'Vence' }),
            el('span', { class: 'v', text: card.limit > 0 ? U.fmtBRL(Math.max(0, card.limit - used)) : U.fmtDateBR(inv.dueDate) })
          ]),
          el('span', { class: 'cc-invoice' }, [
            el('span', { class: 'k', text: 'Fatura ' + U.monthLabel(ref, true) }),
            el('span', { class: 'v', text: U.fmtBRL(inv.planned) })
          ])
        ])
      ])
    ]);
    return node;
  };

  /**
   * Leque de cartões. `limit` corta a quantidade (a visão do Início
   * mostra 2). Devolve o elemento pronto.
   */
  Cards.deck = function (cards, baseYM, opts) {
    const o = opts || {};
    const deck = el('div', { class: 'card-deck' });
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
      el('span', { class: 'bank-chip' + (Icons.hasBank(card.bank) ? '' : ' is-generic') }, Icons.bank(card.bank || card.name, 22)),
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
