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
   * Pares (claro → escuro) tirados da paleta OAZE: Midnight, Deep Teal,
   * Oásis, Earth, Terracota e derivados. Começam pelos tons profundos —
   * é o registro do produto — e seguem para os quentes, porque cinco
   * cartões iguais não se distinguem de relance.
   *
   * Cada ponta CLARA foi verificada até o texto branco do cartão passar
   * WCAG AA (≥ 4,5:1) sobre ela, já contando a camada de 18% que o CSS
   * aplica por cima. O pior caso da lista é 5,59:1 (Terracota).
   * Alterar estes hexes exige refazer essa conta (ver README).
   */
  Cards.GRADIENTS = [
    { key: 'midnight', name: 'Midnight', a: '#0F2C3D', b: '#061620' },
    { key: 'teal', name: 'Deep Teal', a: '#2D4F56', b: '#16282C' },
    { key: 'oasis', name: 'Oásis', a: '#3F5F55', b: '#20302B' },
    { key: 'earth', name: 'Earth', a: '#6E4E3D', b: '#37271E' },
    { key: 'terracotta', name: 'Terracota', a: '#A8734B', b: '#6E4A2E' },
    { key: 'sage', name: 'Sage', a: '#4A5B48', b: '#26301F' },
    { key: 'sand', name: 'Areia', a: '#8A7A62', b: '#4A4132' },
    { key: 'indigo', name: 'Índigo', a: '#2B3E63', b: '#151F33' },
    { key: 'pinho', name: 'Pinho', a: '#274A3F', b: '#132720' },
    { key: 'cobre', name: 'Cobre', a: '#9A5F35', b: '#5C3820' },
    { key: 'ardosia', name: 'Ardósia', a: '#3E4A52', b: '#1F262A' },
    { key: 'ameixa', name: 'Ameixa', a: '#4E3A55', b: '#281D2C' },
    /* Segunda leva (16/09/2026). Doze cartões repetiam cor em
       qualquer carteira com mais de doze peças; estes dez abrem
       matizes que faltavam. Mesma conta de contraste: a ponta clara
       de cada um fica acima de 4,5:1 com o texto branco ANTES da
       camada de 18% do CSS, que só escurece. O mais claro da lista
       é o Névoa, em 4,63:1. */
    { key: 'vinho', name: 'Vinho', a: '#7A3B45', b: '#3E1E23' },
    { key: 'jade', name: 'Jade', a: '#1E5E52', b: '#0E2E28' },
    { key: 'noite', name: 'Azul-noite', a: '#23324F', b: '#111827' },
    { key: 'ferrugem', name: 'Ferrugem', a: '#8C4A2F', b: '#4A2618' },
    { key: 'oliva', name: 'Oliva', a: '#6B6B3A', b: '#34341C' },
    { key: 'carvao', name: 'Carvão', a: '#32363A', b: '#17191B' },
    { key: 'lagoa', name: 'Lagoa', a: '#17656B', b: '#0A3134' },
    { key: 'cafe', name: 'Café', a: '#5A4432', b: '#2C2118' },
    { key: 'orquidea', name: 'Orquídea', a: '#8E4A6B', b: '#482435' },
    { key: 'nevoa', name: 'Névoa', a: '#4F7A92', b: '#273D49' }
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
    if (last) return '•••• ' + last;
    /* Sem os 4 dígitos mostramos o tipo — a menos que ele repita o nome
       que já está logo acima, o que gastaria uma linha dizendo o mesmo. */
    const tipo = U.smartCase(acc.type || 'Conta');
    return U.norm(tipo) === U.norm(acc.name || '') ? '•••• ••••' : tipo;
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

    /* Selo de situação e faixa de tipo dividem o mesmo canto. Empilhados
       numa coluna à direita, um nunca cobre o outro — que era o que
       acontecia com o selo posicionado em absoluto sobre o cabeçalho. */
    const canto = [];
    const selos = Array.isArray(o.status) ? o.status.filter(Boolean) : (o.status ? [o.status] : []);
    selos.forEach((s) => canto.push(el('span', { class: 'cc-status' }, s)));
    if (o.kind) canto.push(el('span', { class: 'cc-kind', text: o.kind }));

    filhos.push(el('span', { class: 'cc-row' }, [
      Icons.bankTile(o.bank || o.title, 34, o.grad.a),
      el('span', { class: 'cc-id' }, [
        el('span', { class: 'cc-title', text: o.title, title: o.title }),
        el('span', { class: 'cc-sub', text: o.sub || '' })
      ]),
      el('span', { class: 'cc-corner' }, canto)
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
    filhos.push(el('span', { class: 'cc-base' }, base));

    return el('button', {
      type: 'button',
      class: 'wallet-card' + (o.focused ? ' is-focused' : ''),
      style: { '--cc-a': o.grad.a, '--cc-b': o.grad.b },
      'aria-pressed': o.focused ? 'true' : 'false',
      title: o.hint || o.title,
      onclick: o.onClick || null
    }, filhos);
  }
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
        pago: 0, pagoFatura: 0, pagoAdiantado: 0, restante: 0, parcial: false,
        pagamentos: [], adiantamentos: {},
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
      status: [
        inv.paid ? UI.badge('Paga', 'ok')
          : inv.isOverdue ? UI.badge('Vencida', 'late')
            : inv.parcial ? UI.badge('Parcial', 'pend')
              : inv.isOpen ? UI.badge('Aberta', 'pend') : UI.badge('A pagar', 'pend'),
        card.considerado === false ? UI.badge('Fora dos totais', 'off') : null
      ],
      number: Cards.maskedNumber(card),
      barPct: pct,
      footLeft: card.limit > 0
        ? { k: 'Limite livre', v: U.fmtBRL(Math.max(0, card.limit - used)) }
        : { k: 'Vence', v: U.fmtDateBR(inv.dueDate) },
      /* O rodapé diz o MÊS DA COBRANÇA, não o dia da compra: é
         "fatura de jan/26" que a pessoa procura quando quer saber
         quando aquilo vai sair da conta. Com pagamento parcial, o
         número que importa passa a ser o que ainda falta. */
      footRight: inv.parcial
        ? { k: 'Falta · fatura ' + U.monthLabel(ref, true), v: U.fmtBRL(inv.restante) }
        : { k: 'Fatura ' + U.monthLabel(ref, true), v: U.fmtBRL(inv.planned) },
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
      status: acc.considerado === false ? [UI.badge('Fora dos totais', 'off')] : null,
      number: accountNumber(acc),
      barPct: null,
      footLeft: { k: 'Saldo em', v: U.fmtDateBR(upto) },
      footRight: { k: 'Saldo atual', v: U.fmtBRL(saldo) },
      onClick: () => { if (o.onClick) o.onClick(acc); }
    });
  };

  /**
   * Base única do baralho. Crédito, débito e a carteira do Início passam
   * por aqui para não ganharem interações, tamanhos ou acessibilidade
   * diferentes em cada página.
   */
  function collectionDeck(items, renderItem, opts) {
    const o = opts || {};
    const list = o.limit ? items.slice(0, o.limit) : items;
    const stacked = o.stacked !== false;
    const deck = el('div', {
      class: 'wallet-deck' + (stacked ? ' wallet-deck-stack' : ''),
      role: 'group',
      'aria-label': o.label || 'Carteira de cartões',
      'data-wallet-surface': o.surface || 'wallet',
      style: stacked ? {
        '--deck-count': String(list.length),
        '--deck-depth': String(Math.max(0, list.length - 1))
      } : null
    });
    let troca = null;
    let proximoSlot = 1;

    list.forEach((item, index) => {
      const itemId = String(o.itemId ? o.itemId(item) : item.id);
      const cartao = renderItem(item, {
        focused: o.focusedId === itemId,
        onClick: () => {
          if (!stacked) { if (o.onClick) o.onClick(item); return; }
          if (deck.dataset.focusedId === itemId) return;

          deck.dataset.focusedId = itemId;
          let slot = 1;
          deck.querySelectorAll('.wallet-card').forEach((node) => {
            const ativo = node.dataset.walletItemId === itemId;
            node.classList.toggle('is-focused', ativo);
            node.setAttribute('aria-pressed', ativo ? 'true' : 'false');
            node.style.setProperty('--deck-slot', String(ativo ? 0 : slot++));
          });

          clearTimeout(troca);
          troca = setTimeout(() => { if (o.onClick) o.onClick(item); }, 280);
        }
      });
      cartao.dataset.walletItemId = itemId;
      cartao.dataset.walletKind = o.itemKind ? o.itemKind(item) : (o.surface || 'card');
      cartao.setAttribute('aria-posinset', String(index + 1));
      cartao.setAttribute('aria-setsize', String(list.length));
      if (stacked) {
        cartao.classList.add('is-decked');
        cartao.style.setProperty('--deck-i', String(index));
        cartao.style.setProperty('--deck-slot', String(o.focusedId === itemId ? 0 : proximoSlot++));
      }
      deck.appendChild(cartao);
    });
    if (stacked) deck.dataset.focusedId = o.focusedId || '';
    return deck;
  }

  /** Baralho de cartões de crédito. */
  Cards.deck = function (cards, baseYM, opts) {
    const o = opts || {};
    return collectionDeck(cards, (card, state) => {
      const ref = o.refFor ? o.refFor(card) : Calc.currentInvoiceRef(card, baseYM);
      return Cards.render(card, ref, state);
    }, Object.assign({
      label: 'Cartões de crédito',
      surface: 'credit'
    }, o));
  };

  /** Baralho de contas de débito, no mesmo formato do crédito. */
  Cards.accountDeck = function (accounts, upto, opts) {
    const o = opts || {};
    return collectionDeck(accounts, (account, state) => Cards.account(account, upto, state), Object.assign({
      label: 'Contas de débito',
      surface: 'debit'
    }, o));
  };

  /**
   * Carteira integrada da Visão geral: contas e cartões dividem o mesmo
   * baralho, mas preservam tipo, cor, logo e os cálculos de cada origem.
   */
  Cards.walletDeck = function (accounts, cards, baseYM, upto, opts) {
    const o = opts || {};
    const items = accounts.map((data) => ({ key: 'account:' + data.id, kind: 'account', data }))
      .concat(cards.map((data) => ({ key: 'card:' + data.id, kind: 'card', data })));

    return collectionDeck(items, (item, state) => item.kind === 'account'
      ? Cards.account(item.data, upto, state)
      : Cards.render(item.data, Calc.currentInvoiceRef(item.data, baseYM), state), Object.assign({
      label: 'Contas de débito e cartões de crédito',
      surface: 'overview',
      itemId: (item) => item.key,
      itemKind: (item) => item.kind
    }, o));
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
        : inv.parcial ? UI.badge('Paga em parte', 'pend')
          : inv.isOverdue ? UI.badge('Vencida', 'late')
            : inv.isOpen ? UI.badge('Aberta', 'pend') : UI.badge('Fechada · a pagar', 'pend'),
      card.considerado === false ? UI.badge('Fora dos totais', 'off') : null
    ].filter(Boolean));
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
    /* O primeiro número é o mês da cobrança, não o dia da compra:
       "fatura de jan/26" é como a pessoa se refere a ela. O período
       de compras vira uma linha discreta abaixo, porque explica o
       recorte sem competir com o valor. */
    box.appendChild(el('div', { class: 'inv-summary' }, [
      fig('Fatura de', U.smartCase(U.monthLabel(ref, true))),
      fig('Total da fatura', U.fmtBRL(inv.planned)),
      inv.pago > 0 ? fig('Já pago', U.fmtBRL(inv.pago)) : fig('Confirmado', U.fmtBRL(inv.total)),
      fig('Falta pagar', inv.restante > 0 ? U.fmtBRL(inv.restante) : 'nada'),
      fig('Vencimento', U.fmtDateBR(inv.dueDate)),
      fig('Limite disponível', card.limit > 0 ? U.fmtBRL(Math.max(0, card.limit - used)) : '—')
    ]));
    box.appendChild(el('p', { class: 'hint inv-periodo' }, [
      document.createTextNode(`Entram nesta fatura as compras de ${U.fmtDayMonth(inv.openDate)} a ${U.fmtDayMonth(inv.closeDate)}.`),
      inv.pagoAdiantado > 0
        ? document.createTextNode(` ${U.fmtBRL(inv.pagoAdiantado)} já foram adiantados em compras avulsas.`)
        : null
    ].filter(Boolean)));

    box.appendChild(el('div', { class: 'row gap-6', style: { marginBottom: '14px', flexWrap: 'wrap' } }, [
      inv.restante > 0 || !inv.pago
        ? el('button', {
          class: 'btn btn-primary btn-sm',
          text: inv.pago > 0 ? 'Pagar o que falta' : 'Pagar fatura',
          onclick: () => Forms.openInvoicePayment(card.id, ref)
        })
        : null,
      inv.pago > 0 || inv.paid
        ? el('button', {
          class: 'btn btn-outline btn-sm', text: 'Desfazer pagamentos',
          onclick: async () => {
            const ok = await UI.confirm({
              title: 'Desfazer pagamentos',
              message: 'Isto apaga todos os pagamentos e adiantamentos registrados nesta fatura. Os lançamentos continuam onde estão.',
              confirmLabel: 'Desfazer', danger: true
            });
            if (ok) { Store.clearInvoicePayments(card.id, ref); UI.toast('Pagamentos desfeitos.'); }
          }
        })
        : null,
      !inv.paid && inv.restante > 0
        ? el('button', {
          class: 'btn btn-ghost btn-sm', text: 'Encerrar fatura',
          title: 'Marca como encerrada mesmo faltando valor — para quando a diferença foi estorno ou desconto',
          onclick: () => { Store.setInvoiceQuitada(card.id, ref, true); UI.toast('Fatura encerrada.'); }
        })
        : null,
      el('button', {
        class: 'btn btn-outline btn-sm', text: '+ Lançar no crédito',
        onclick: () => Forms.openTransaction('expense', null, {
          method: 'card', cardId: card.id,
          date: inv.closeDate < U.todayISO() ? inv.closeDate : U.todayISO()
        })
      }),
      el('button', { class: 'btn btn-ghost btn-sm', text: '✎ Editar cartão', onclick: () => Forms.openCard(card.id) })
    ].filter(Boolean)));

    if (inv.pagamentos.length) {
      box.appendChild(el('ul', { class: 'inv-pagamentos' }, inv.pagamentos.map((m) => el('li', {}, [
        el('span', { class: 'k', text: 'Pago em ' + U.fmtDateBR(m.at) }),
        el('span', { class: 'v', text: U.fmtBRL(m.amount) }),
        el('span', {
          class: 's',
          text: m.accountId ? 'da conta ' + Calc.accountName(m.accountId) : 'sem conta informada'
        })
      ]))));
    }

    if (!inv.items.length) {
      box.appendChild(UI.empty('Nenhum lançamento nesta fatura.'));
      return box;
    }

    /* A coluna de data virou "Cobrança": o que se quer saber de uma
       compra no crédito é em qual fatura ela cai, não em que dia ela
       foi feita. O dia continua acessível — está no título da linha,
       para quem precisar conferir. */
    const table = el('table', { class: 'table table-compact' }, [
      el('thead', {}, el('tr', {}, [
        el('th'), el('th'), el('th', { text: 'Cobrança' }), el('th', { text: 'Descrição' }),
        el('th', { text: 'Categoria' }), el('th', { class: 'num', text: 'Valor' }), el('th')
      ])),
      el('tbody')
    ]);
    const tbody = table.querySelector('tbody');

    inv.items.forEach((e) => {
      const cb = el('input', { type: 'checkbox', 'aria-label': 'Confirmar ' + e.description });
      cb.checked = e.confirmed;
      cb.addEventListener('change', () => Store.transactions.setConfirmed(e.txId, e.ym, cb.checked));
      const refDoItem = Calc.invoiceRefOfDate(card, e.date);
      const restaDoItem = U.round2(Math.max(0, e.amount - (e.adiantado || 0)));

      tbody.appendChild(el('tr', {
        class: (e.confirmed ? '' : 'is-pending') + (e.adiantado ? ' is-adiantado' : ''),
        title: e.description + ' · compra em ' + U.fmtDateBR(e.date)
          + (e.adiantado ? ' · adiantado ' + U.fmtBRL(e.adiantado)
            + (restaDoItem > 0 ? ', faltam ' + U.fmtBRL(restaDoItem) : '') : '')
      }, [
        el('td', {}, el('label', { class: 'check' }, cb)),
        el('td', {}, Icons.categoryBadge(e.categoryId, 22)),
        el('td', { class: 'inv-ref-cel', text: 'fatura ' + U.monthLabel(refDoItem, true) }),
        el('td', {}, [
          document.createTextNode(e.description + ' '),
          e.installment ? UI.badge(`${e.installment.index}/${e.installment.total}`, 'inst') : null,
          !e.confirmed ? UI.badge('Previsto', 'pend') : null,
          /* O selo diz o estado, não o valor: "Adiantado R$ 1.234,56"
             não cabia na linha do celular e passava por cima do
             valor da compra. O quanto está no título da linha. */
          e.adiantado ? UI.badge(restaDoItem > 0 ? 'Adiantada em parte' : 'Adiantada', 'ok') : null
        ].filter(Boolean)),
        el('td', { text: Calc.categoryName(e.categoryId) }),
        el('td', { class: 'num', text: U.fmtBRL(e.amount) }),
        el('td', {}, el('div', { class: 'row-actions' }, [
          e.adiantado
            ? el('button', {
              class: 'icon-btn', title: 'Desfazer o adiantamento desta compra',
              'aria-label': 'Desfazer o adiantamento de ' + e.description,
              onclick: () => {
                Store.removeInvoiceAdvance(card.id, ref, e.key);
                UI.toast('Adiantamento desfeito.');
              }
            }, Icons.lucide('x', 14))
            : el('button', {
              class: 'icon-btn', title: 'Adiantar o pagamento desta compra',
              'aria-label': 'Adiantar o pagamento de ' + e.description,
              onclick: () => Forms.openAdvancePayment(card.id, ref, e)
            }, Icons.lucide('hand-coins', 14)),
          el('button', {
            class: 'icon-btn', title: 'Editar', text: '✎',
            onclick: () => Forms.openTransaction(null, e.txId)
          })
        ]))
      ]));
    });

    const rodape = el('tfoot', {}, el('tr', {}, [
      el('td', { colspan: 5, text: `Total da fatura (${inv.items.length} itens)` }),
      el('td', { class: 'num', text: U.fmtBRL(inv.planned) }),
      el('td')
    ]));
    if (inv.pago > 0) {
      rodape.appendChild(el('tr', { class: 'is-quiet' }, [
        el('td', { colspan: 5, text: inv.restante > 0 ? 'Falta pagar' : 'Fatura quitada' }),
        el('td', { class: 'num', text: U.fmtBRL(inv.restante) }),
        el('td')
      ]));
    }
    table.appendChild(rodape);

    box.appendChild(el('div', { class: 'table-wrap' }, table));
    return box;
  };

  global.Cards = Cards;
})(window);
