/* =============================================================
   pages/accounts.js — Página 4 · Cartões e Contas
   ============================================================= */
(function (global) {
  'use strict';

  const el = U.el;
  const Acc = {};

  Acc.render = function () {
    syncTabs();
    if (App.accTab === 'accounts') { renderAccounts(); renderHistory(); }
    else if (App.accTab === 'cards') renderCardDeck();
    else Importer.renderTargets();
  };

  function syncTabs() {
    U.$$('#accTabs .tab').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === App.accTab));
    U.$$('.tabpane').forEach((p) => p.classList.toggle('is-active', p.dataset.tab === App.accTab));
  }

  /* ============================================================
     CONTAS
     ============================================================ */

  /**
   * As contas de débito usam o MESMO cartão de carteira dos cartões de
   * crédito. Clicar em um traz o extrato dele abaixo.
   */
  function renderAccounts() {
    const prof = Store.profile();
    const grid = U.clear(document.getElementById('accountGrid'));
    const upto = App.balanceDate();

    if (!prof.accounts.length) {
      grid.appendChild(el('div', { class: 'card' }, [
        el('p', { class: 'empty-note', text: 'Nenhuma conta cadastrada ainda. Cadastre a primeira para começar a lançar movimentações.' }),
        el('button', { class: 'btn btn-primary btn-sm', text: '+ Nova conta', onclick: () => Forms.openAccount() })
      ]));
      document.getElementById('accTotalLabel').textContent = '';
      return;
    }

    if (!prof.accounts.some((a) => a.id === App.accHistoryId)) App.accHistoryId = prof.accounts[0].id;

    prof.accounts.forEach((a) => {
      const wrap = el('div', { style: { display: 'grid', gap: '6px' } }, [
        Cards.account(a, upto, {
          focused: a.id === App.accHistoryId,
          onClick: () => { App.accHistoryId = a.id; Acc.render(); }
        }),
        el('div', { class: 'row gap-6' }, [
          el('button', {
            class: 'btn btn-ghost btn-sm', text: 'Ver extrato',
            onclick: () => {
              App.accHistoryId = a.id; Acc.render();
              document.getElementById('tableAccHistory').scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }),
          el('button', { class: 'btn btn-ghost btn-sm', text: '✎ Editar', onclick: () => Forms.openAccount(a.id) })
        ])
      ]);
      grid.appendChild(wrap);
    });

    const total = Calc.totalAccountsBalance(upto);
    document.getElementById('accTotalLabel').innerHTML =
      `Saldo somado em contas: <strong class="${U.signClass(total)}">${U.fmtBRL(total)}</strong>`;
  }

  /** Ladrilho do banco na cor da marca. */
  function bankChip(name, color, small) {
    return Icons.bankTile(name, small ? 22 : 32, color);
  }
  Acc.bankChip = bankChip;

  function renderHistory() {
    const prof = Store.profile();
    const sel = document.getElementById('accHistorySelect');
    UI.fillSelect(sel, prof.accounts.map((a) => ({ value: a.id, label: a.name })), App.accHistoryId);
    App.accHistoryId = sel.value || null;

    const tbody = U.clear(document.querySelector('#tableAccHistory tbody'));
    if (!App.accHistoryId) {
      tbody.appendChild(UI.emptyRow(5, 'Cadastre uma conta para ver o extrato.'));
      return;
    }
    const from = U.monthStart(U.addMonths(App.ym, -2));
    const to = App.balanceDate();
    const rows = Calc.accountStatement(App.accHistoryId, from, to);

    if (!rows.length) {
      tbody.appendChild(UI.emptyRow(5, `Sem movimentações confirmadas entre ${U.fmtDateBR(from)} e ${U.fmtDateBR(to)}.`));
      return;
    }
    rows.slice().reverse().forEach((r) => {
      tbody.appendChild(el('tr', {}, [
        el('td', { text: U.fmtDateBR(r.date) }),
        el('td', { text: r.desc }),
        el('td', { text: r.cat }),
        el('td', { class: 'num ' + U.signClass(r.delta), text: (r.delta >= 0 ? '+ ' : '− ') + U.fmtBRL(Math.abs(r.delta)) }),
        el('td', { class: 'num', text: U.fmtBRL(r.balance) })
      ]));
    });
  }

  /* ============================================================
     CARTÕES — leque de cartões + fatura do que estiver em foco
     ============================================================ */

  function renderCardDeck() {
    const prof = Store.profile();
    const deckBox = U.clear(document.getElementById('cardDeck'));
    const detail = U.clear(document.getElementById('cardDetail'));
    const label = document.getElementById('cardTotalLabel');

    if (!prof.cards.length) {
      label.textContent = '';
      deckBox.appendChild(el('p', { class: 'empty-note', text: 'Nenhum cartão cadastrado. Cadastre para acompanhar faturas, limite e vencimentos.' }));
      deckBox.appendChild(el('button', { class: 'btn btn-primary btn-sm', text: '+ Novo cartão', onclick: () => Forms.openCard() }));
      return;
    }

    // cartão em foco: o escolhido, ou o primeiro
    if (!prof.cards.some((c) => c.id === App.cardFocusId)) App.cardFocusId = prof.cards[0].id;
    const card = Store.cards.get(App.cardFocusId);
    if (!App.invoiceRef) App.invoiceRef = Calc.currentInvoiceRef(card, App.ym);

    deckBox.appendChild(Cards.deck(prof.cards, App.ym, {
      focusedId: App.cardFocusId,
      refFor: (c) => (c.id === App.cardFocusId ? App.invoiceRef : Calc.currentInvoiceRef(c, App.ym)),
      onClick: (c) => {
        App.cardFocusId = c.id;
        App.invoiceRef = Calc.currentInvoiceRef(c, App.ym);
        renderCardDeck();
      }
    }));
    if (prof.cards.length > 1) {
      deckBox.appendChild(el('p', { class: 'deck-hint', text: 'Clique em um cartão para ver a fatura dele abaixo.' }));
    }

    detail.appendChild(Cards.invoicePanel(card, App.invoiceRef, {
      onNav: (n) => { App.invoiceRef = U.addMonths(App.invoiceRef, n); renderCardDeck(); }
    }));

    const totalAberto = prof.cards.reduce((s, c) => s + Calc.cardUsed(c.id), 0);
    label.innerHTML = `Comprometido em faturas em aberto: <strong class="val-neg">${U.fmtBRL(totalAberto)}</strong>`;
  }

  Acc.refreshCards = renderCardDeck;

  global.Acc = Acc;
})(window);

