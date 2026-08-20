/* =============================================================
   shell.js — controles da top bar: busca, notificações e menu
   ------------------------------------------------------------
   Nada aqui calcula dinheiro. A busca lê o Store e as
   notificações saem do Calc — este arquivo só apresenta e navega.
   Regra do projeto: uma conta, um lugar.
   ============================================================= */
(function (global) {
  'use strict';

  const el = U.el;
  const Shell = {};

  /* ============================================================
     1 · POPOVERS
     ============================================================ */

  let aberto = null;

  function posiciona(pop, botao) {
    const r = botao.getBoundingClientRect();
    pop.hidden = false;                     // precisa estar visível para medir
    const largura = pop.offsetWidth;
    const esq = Math.max(12, Math.min(r.right - largura, global.innerWidth - largura - 12));
    pop.style.left = esq + 'px';
    pop.style.top = (r.bottom + 8) + 'px';
  }

  function fecha() {
    if (!aberto) return;
    aberto.pop.hidden = true;
    aberto.botao.setAttribute('aria-expanded', 'false');
    aberto = null;
  }
  Shell.fechar = fecha;

  function alterna(popId, botaoId, antes) {
    const pop = document.getElementById(popId);
    const botao = document.getElementById(botaoId);
    if (aberto && aberto.pop === pop) { fecha(); return; }
    fecha();
    if (antes) antes();
    posiciona(pop, botao);
    botao.setAttribute('aria-expanded', 'true');
    aberto = { pop, botao };
  }

  /* ============================================================
     2 · NOTIFICAÇÕES — derivadas, nunca armazenadas
     ------------------------------------------------------------
     Some sozinho quando o motivo some. Nada de "marcar como lida".
     ============================================================ */

  const dias = (a, b) => Math.round((Date.parse(b + 'T00:00:00') - Date.parse(a + 'T00:00:00')) / 86400000);

  Shell.notificacoes = function () {
    const prof = Store.profile();
    const hoje = U.todayISO();
    const out = [];

    prof.cards.forEach((c) => {
      [App.ym, U.addMonths(App.ym, 1)].forEach((base) => {
        const ref = Calc.currentInvoiceRef(c, base);
        const inv = Calc.invoice(c.id, ref);
        if (!inv || inv.paid || inv.planned <= 0) return;
        const chave = c.id + '|' + inv.dueDate;
        if (out.some((n) => n.chave === chave)) return;
        const d = dias(hoje, inv.dueDate);
        if (inv.dueDate < hoje) {
          out.push({
            chave, tipo: 'alert', icone: 'circle-alert',
            titulo: 'Fatura vencida — ' + c.name,
            sub: `${U.fmtBRL(inv.planned)} · venceu em ${U.fmtDateBR(inv.dueDate)}`,
            ir: () => App.goTo('accounts', { tab: 'cards', cardId: c.id, invoiceRef: ref })
          });
        } else if (d <= 7) {
          out.push({
            chave, tipo: 'warn', icone: 'calendar-clock',
            titulo: `Fatura vence ${d === 0 ? 'hoje' : 'em ' + d + ' dia(s)'} — ${c.name}`,
            sub: `${U.fmtBRL(inv.planned)} · ${U.fmtDateBR(inv.dueDate)}`,
            ir: () => App.goTo('accounts', { tab: 'cards', cardId: c.id, invoiceRef: ref })
          });
        }
      });
    });

    const t = Calc.monthTotals(App.ym);
    if (t.pendingCount > 0) {
      out.push({
        chave: 'pend', tipo: 'info', icone: 'clock',
        titulo: `${t.pendingCount} lançamento(s) por confirmar`,
        sub: `${U.fmtBRL(U.round2(t.pendingIncome + t.pendingExpense))} aguardando em ${U.monthLabel(App.ym, true)}`,
        ir: () => { App.txOnlyPending = true; App.goTo('transactions'); }
      });
    }

    const upto = App.balanceDate();
    prof.accounts.forEach((a) => {
      const saldo = Calc.accountBalance(a.id, upto);
      if (saldo < 0) {
        out.push({
          chave: 'neg|' + a.id, tipo: 'alert', icone: 'circle-alert',
          titulo: a.name + ' está negativa',
          sub: `${U.fmtBRL(saldo)} em ${U.fmtDateBR(upto)}`,
          ir: () => { App.accHistoryId = a.id; App.goTo('accounts', { tab: 'accounts' }); }
        });
      }
    });

    // orçamento estourado é notícia: o limite existe justamente para avisar
    const limites = Store.budgets.all();
    const gastos = Calc.categoryTotals('expense', U.monthStart(App.ym), U.monthEnd(App.ym));
    gastos.forEach((g) => {
      const lim = limites[g.id];
      if (lim && g.total > lim) {
        out.push({
          chave: 'orc|' + g.id, tipo: 'warn', icone: 'target',
          titulo: 'Orçamento estourado — ' + g.name,
          sub: `${U.fmtBRL(g.total)} de ${U.fmtBRL(lim)}`,
          ir: () => App.goTo('budget')
        });
      }
    });

    const ordem = { alert: 0, warn: 1, info: 2 };
    return out.sort((a, b) => ordem[a.tipo] - ordem[b.tipo]);
  };

  Shell.renderNotifCount = function () {
    const n = document.getElementById('notifCount');
    if (!n) return;
    let qtd = 0;
    try { qtd = Shell.notificacoes().length; } catch (e) { console.error('Notificações:', e); }
    n.hidden = qtd === 0;
    n.textContent = String(qtd);
    const b = document.getElementById('btnNotif');
    if (b) b.setAttribute('aria-label', qtd ? qtd + ' notificação(ões)' : 'Notificações — nada pendente');
  };

  function pintaNotificacoes() {
    const lista = U.clear(document.getElementById('notifList'));
    const itens = Shell.notificacoes();
    if (!itens.length) {
      lista.appendChild(el('p', {
        class: 'empty-note', style: { padding: '10px 12px 16px' },
        text: 'Nada pendente. Faturas em dia, orçamento dentro do limite.'
      }));
      return;
    }
    itens.forEach((n) => {
      lista.appendChild(el('button', {
        class: 'notif-item is-' + n.tipo, type: 'button',
        onclick: () => { fecha(); n.ir(); }
      }, [
        el('span', { class: 'ico' }, Icons.lucide(n.icone, 17)),
        el('span', {}, [
          el('span', { class: 't', text: n.titulo }),
          el('span', { class: 's', text: n.sub })
        ])
      ]));
    });
  }

  /* ============================================================
     3 · BUSCA GLOBAL
     ------------------------------------------------------------
     Escolher um resultado LEVA até ele. Busca que não navega é
     só uma lista.
     ============================================================ */

  const MAX = 6;

  Shell.buscar = function (termo) {
    const q = U.norm(termo);
    if (q.length < 2) return [];
    const prof = Store.profile();
    const grupos = [];

    const contas = prof.accounts.filter((a) => U.norm(a.name + ' ' + a.bank).includes(q));
    if (contas.length) grupos.push({ nome: 'Contas', itens: contas.slice(0, MAX).map((a) => ({
      titulo: a.name, sub: `${a.bank || 'Conta'} · ${a.type}`,
      valor: U.fmtBRL(Calc.accountBalance(a.id, App.balanceDate())), icone: 'landmark',
      ir: () => { App.accHistoryId = a.id; App.goTo('accounts', { tab: 'accounts' }); }
    })) });

    const cartoes = prof.cards.filter((c) => U.norm(c.name + ' ' + c.bank).includes(q));
    if (cartoes.length) grupos.push({ nome: 'Cartões', itens: cartoes.slice(0, MAX).map((c) => ({
      titulo: c.name, sub: c.bank || 'Cartão de crédito',
      valor: U.fmtBRL(Calc.cardUsed(c.id)), icone: 'credit-card',
      ir: () => App.goTo('accounts', { tab: 'cards', cardId: c.id })
    })) });

    const metas = prof.goals.filter((g) => U.norm(g.name).includes(q));
    if (metas.length) grupos.push({ nome: 'Metas', itens: metas.slice(0, MAX).map((g) => ({
      titulo: g.name, sub: `${U.fmtBRL(g.saved)} de ${U.fmtBRL(g.target)}`,
      valor: '', icone: g.icon || 'target', cor: g.color,
      ir: () => App.goTo('goals')
    })) });

    const cats = prof.categories.filter((c) => U.norm(c.name).includes(q));
    if (cats.length) grupos.push({ nome: 'Categorias', itens: cats.slice(0, MAX).map((c) => ({
      titulo: c.name, sub: c.kind === 'income' ? 'Categoria de receita' : 'Categoria de despesa',
      valor: '', icone: Icons.forCategory(c), cor: c.color,
      ir: () => App.goTo('categories')
    })) });

    /* Lançamentos: varre o ano exibido — é o recorte que a pessoa tem
       em mente, e ir além disso deixa a busca lenta sem ajudar. */
    const ano = U.ymParts(App.ym).y;
    const achados = [];
    U.monthRange(`${ano}-01`, `${ano}-12`).forEach((ym) => {
      Calc.entriesForMonth(ym).forEach((e) => {
        if (U.norm(e.description).includes(q) || U.norm(Calc.categoryName(e.categoryId)).includes(q)) achados.push(e);
      });
    });
    if (achados.length) {
      achados.sort((a, b) => (a.date < b.date ? 1 : -1));
      grupos.push({ nome: `Lançamentos de ${ano}`, itens: achados.slice(0, 10).map((e) => ({
        titulo: e.description,
        sub: `${U.fmtDateBR(e.date)} · ${Calc.categoryName(e.categoryId)}` + (e.confirmed ? '' : ' · previsto'),
        valor: (e.kind === 'income' ? '+ ' : e.kind === 'expense' ? '− ' : '') + U.fmtBRL(e.amount),
        classe: e.kind === 'income' ? 'val-pos' : e.kind === 'expense' ? 'val-neg' : '',
        icone: Icons.forCategory(Calc.categoryById(e.categoryId)),
        ir: () => { App.setYM(U.ymOf(e.date)); App.txSearch = e.description; App.goTo('transactions'); }
      })) });
    }
    return grupos;
  };

  function pintaBusca(termo) {
    const caixa = U.clear(document.getElementById('searchResults'));
    if (U.norm(termo).length < 2) {
      caixa.appendChild(el('p', { class: 'empty-note', style: { padding: '18px 12px' }, text: 'Digite ao menos duas letras.' }));
      return;
    }
    const grupos = Shell.buscar(termo);
    if (!grupos.length) {
      caixa.appendChild(el('p', { class: 'empty-note', style: { padding: '18px 12px' }, text: `Nada encontrado para "${termo}".` }));
      return;
    }
    grupos.forEach((g) => {
      caixa.appendChild(el('div', { class: 'search-group', text: g.nome }));
      g.itens.forEach((i) => {
        caixa.appendChild(el('button', {
          class: 'search-item', type: 'button',
          onclick: () => { fechaBusca(); i.ir(); }
        }, [
          el('span', {
            class: 'cat-badge',
            style: {
              width: '28px', height: '28px',
              background: i.cor ? 'color-mix(in srgb, ' + i.cor + ' 18%, transparent)' : 'var(--plane-2)',
              color: i.cor || 'var(--ink-2)'
            }
          }, Icons.lucide(i.icone, 15)),
          el('span', { style: { minWidth: 0 } }, [
            el('span', { class: 't', text: i.titulo }),
            el('span', { class: 's', text: i.sub })
          ]),
          el('span', { class: 'v ' + (i.classe || ''), text: i.valor })
        ]));
      });
    });
  }

  function abreBusca() {
    fecha();
    document.getElementById('searchOverlay').hidden = false;
    const campo = document.getElementById('searchInput');
    campo.value = '';
    pintaBusca('');
    setTimeout(() => campo.focus(), 30);
  }
  function fechaBusca() { document.getElementById('searchOverlay').hidden = true; }
  Shell.abrirBusca = abreBusca;

  /** true quando o foco está num campo — aí teclas soltas não valem. */
  function digitando(alvo) {
    return !!(alvo && alvo.matches && alvo.matches('input, textarea, select, [contenteditable]'));
  }

  /* ============================================================
     4 · LIGAÇÃO
     ============================================================ */

  Shell.init = function () {
    document.getElementById('btnNotif').addEventListener('click', () => alterna('notifPop', 'btnNotif', pintaNotificacoes));
    document.getElementById('btnSettings').addEventListener('click', () => alterna('settingsPop', 'btnSettings'));
    U.$$('#settingsPop .pop-item').forEach((b) => b.addEventListener('click', fecha));

    document.getElementById('btnSearch').addEventListener('click', abreBusca);
    U.$$('[data-close-search]').forEach((b) => b.addEventListener('click', fechaBusca));
    document.getElementById('searchInput').addEventListener('input', U.debounce((e) => pintaBusca(e.target.value), 160));
    document.getElementById('searchInput').addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return;
      const primeiro = document.querySelector('#searchResults .search-item');
      if (primeiro) { ev.preventDefault(); primeiro.click(); }
    });

    document.addEventListener('click', (ev) => {
      if (!aberto) return;
      if (aberto.pop.contains(ev.target) || aberto.botao.contains(ev.target)) return;
      fecha();
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        if (!document.getElementById('searchOverlay').hidden) { fechaBusca(); return; }
        fecha();
      }
      // "/" abre a busca. O alvo nem sempre é Element — daí a guarda.
      if (ev.key === '/' && !digitando(ev.target)) { ev.preventDefault(); abreBusca(); }
    });
    global.addEventListener('resize', fecha);
  };

  global.Shell = Shell;
})(window);
