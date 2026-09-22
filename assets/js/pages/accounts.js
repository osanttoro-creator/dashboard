/* =============================================================
   pages/accounts.js — Página 4 · Cartões e Contas
   ============================================================= */
(function (global) {
  'use strict';

  const el = U.el;
  const Acc = {};

  Acc.render = function () {
    /* Só duas abas desde 16/09/2026. Uma aba salva de antes ("import")
       deixaria a página sem conteúdo nenhum: volta para contas. */
    if (App.accTab !== 'accounts' && App.accTab !== 'cards') App.accTab = 'accounts';
    syncTabs();
    if (App.accTab === 'cards') renderCardDeck();
    else { renderAccounts(); renderHistory(); }
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
      return;
    }

    if (!prof.accounts.some((a) => a.id === App.accHistoryId)) App.accHistoryId = prof.accounts[0].id;

    const totalContas = Calc.totalAccountsBalance(upto);
    grid.appendChild(Cards.accountDeck(prof.accounts, upto, {
      stacked: true,
      focusedId: App.accHistoryId,
      /* O couro da carteira mostra o somado; com o ponteiro sobre uma
         conta, o saldo dela. O rótulo de cima some quando a carteira
         já diz a mesma coisa — dois totais iguais na mesma tela é um
         a mais para a pessoa conferir. */
      carteira: {
        rotulo: 'Saldo somado em contas',
        total: U.fmtBRL(totalContas),
        doItem: (account) => Cards.valorDaConta(account, upto)
      },
      onClick: (account) => { App.accHistoryId = account.id; Acc.render(); }
    }));

    if (prof.accounts.length > 1) {
      grid.appendChild(el('p', {
        class: 'deck-hint',
        text: 'Abra a carteira e escolha uma conta para ver o extrato.'
      }));
    }

    const ativa = Store.accounts.get(App.accHistoryId);
    grid.appendChild(el('div', { class: 'row gap-6 wallet-deck-actions' }, [
      el('button', {
        class: 'btn btn-ghost btn-sm', text: 'Ver extrato',
        onclick: () => document.getElementById('tableAccHistory').scrollIntoView({ behavior: 'smooth', block: 'center' })
      }),
      el('button', { class: 'btn btn-ghost btn-sm', text: '✎ Editar', onclick: () => Forms.openAccount(ativa.id) })
    ]));

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
    /* Conta em outra moeda: a coluna mostra o que saiu da conta, na
       moeda dela. O valor em real continua existindo na linha e é o
       que os relatórios somam. */
    const conta = Store.accounts.get(App.accHistoryId);
    const moeda = conta && conta.moeda && conta.moeda !== 'BRL' ? conta.moeda : null;

    if (!rows.length) {
      tbody.appendChild(UI.emptyRow(5, `Sem movimentações confirmadas entre ${U.fmtDateBR(from)} e ${U.fmtDateBR(to)}.`));
      return;
    }
    rows.slice().reverse().forEach((r) => {
      tbody.appendChild(el('tr', {}, [
        el('td', { text: U.fmtDateBR(r.date) }),
        el('td', { text: r.desc, translate: 'no' }),
        el('td', { text: r.cat }),
        el('td', { class: 'num ' + U.signClass(r.delta),
          text: (r.delta >= 0 ? '+ ' : '− ')
            + U.fmtMoeda(Math.abs(moeda ? (r.deltaMoeda || 0) : r.delta), moeda || 'BRL') }),
        el('td', { class: 'num', text: U.fmtMoeda(moeda ? (r.balanceMoeda || 0) : r.balance, moeda || 'BRL') })
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

    if (!prof.cards.length) {
      deckBox.appendChild(el('p', { class: 'empty-note', text: 'Nenhum cartão cadastrado. Cadastre para acompanhar faturas, limite e vencimentos.' }));
      deckBox.appendChild(el('button', { class: 'btn btn-primary btn-sm', text: '+ Novo cartão', onclick: () => Forms.openCard() }));
      return;
    }

    // cartão em foco: o escolhido, ou o primeiro
    if (!prof.cards.some((c) => c.id === App.cardFocusId)) App.cardFocusId = prof.cards[0].id;
    const card = Store.cards.get(App.cardFocusId);
    if (!App.invoiceRef) App.invoiceRef = Calc.currentInvoiceRef(card, App.ym);

    const totalAberto = prof.cards.reduce((s, c) => s + Calc.cardUsed(c.id), 0);
    const refDe = (c) => (c.id === App.cardFocusId ? App.invoiceRef : Calc.currentInvoiceRef(c, App.ym));
    deckBox.appendChild(Cards.deck(prof.cards, App.ym, {
      stacked: true,
      focusedId: App.cardFocusId,
      refFor: refDe,
      carteira: {
        rotulo: 'Faturas em aberto',
        total: U.fmtBRL(totalAberto),
        doItem: (c) => Cards.valorDoCartao(c, refDe(c))
      },
      onClick: (c) => {
        App.cardFocusId = c.id;
        App.invoiceRef = Calc.currentInvoiceRef(c, App.ym);
        renderCardDeck();
      }
    }));
    if (prof.cards.length > 1) {
      deckBox.appendChild(el('p', { class: 'deck-hint', text: 'Abra a carteira e escolha um cartão para ver a fatura.' }));
    }

    detail.appendChild(Cards.invoicePanel(card, App.invoiceRef, {
      onNav: (n) => { App.invoiceRef = U.addMonths(App.invoiceRef, n); renderCardDeck(); }
    }));

  }

  Acc.refreshCards = renderCardDeck;

  global.Acc = Acc;
})(window);
