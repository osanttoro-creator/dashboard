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
     2 · NOTIFICAÇÕES
     ------------------------------------------------------------
     O motivo continua derivado dos dados. A leitura, por outro
     lado, vale durante a sessão: ao abrir o painel a pessoa já viu
     o aviso, então o contador não deve reaparecer a cada render.
     ============================================================ */

  const CHAVE_LIDAS = 'oaze:notificacoes-lidas';
  let lidasMemoria = new Set();

  function lidasDaSessao() {
    try {
      const salvo = JSON.parse(sessionStorage.getItem(CHAVE_LIDAS) || '{}');
      if (salvo.dia !== U.todayISO() || !Array.isArray(salvo.chaves)) return lidasMemoria;
      return new Set(salvo.chaves);
    } catch (e) { return lidasMemoria; }
  }

  function guardarLidas(chaves) {
    lidasMemoria = new Set(chaves);
    try {
      sessionStorage.setItem(CHAVE_LIDAS, JSON.stringify({
        dia: U.todayISO(), chaves: Array.from(lidasMemoria)
      }));
    } catch (e) { /* sessão privada: a memória desta aba já resolve */ }
  }

  function notificacoesNovas() {
    const lidas = lidasDaSessao();
    return Shell.notificacoes().filter((n) => !lidas.has(n.chave));
  }

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
    try { qtd = notificacoesNovas().length; } catch (e) { console.error('Notificações:', e); }
    n.hidden = qtd === 0;
    n.textContent = String(qtd);
    const b = document.getElementById('btnNotif');
    if (b) b.setAttribute('aria-label', qtd ? qtd + ' notificação(ões)' : 'Notificações — nada pendente');
  };

  function pintaNotificacoes() {
    const lista = U.clear(document.getElementById('notifList'));
    const meta = document.getElementById('notifMeta');
    const itens = notificacoesNovas();
    if (meta) meta.textContent = itens.length ? itens.length + (itens.length === 1 ? ' aviso' : ' avisos') : '';
    if (!itens.length) {
      /* Vazio é boa notícia, e merece parecer uma: marca, título e
         uma frase — não uma linha cinza solta embaixo do cabeçalho. */
      lista.appendChild(el('div', { class: 'aviso-vazio' }, [
        el('span', { class: 'aviso-vazio-ico', 'aria-hidden': 'true' }, Icons.lucide('check', 18)),
        el('strong', { text: 'Tudo em dia' }),
        el('span', { text: 'Faturas, saldos e orçamentos sem pendência.' })
      ]));
      return;
    }
    itens.forEach((n) => {
      lista.appendChild(el('button', {
        class: 'notif-item is-' + n.tipo, type: 'button',
        onclick: () => { fecha(); n.ir(); }
      }, [
        el('span', { class: 'ico', 'aria-hidden': 'true' }, Icons.lucide(n.icone, 16)),
        el('span', {}, [
          el('span', { class: 't', text: n.titulo }),
          el('span', { class: 's', text: n.sub })
        ]),
        el('span', { class: 'seta', 'aria-hidden': 'true' }, Icons.lucide('chevron-right', 14))
      ]));
    });

    /* Abrir é ler: conserva os itens nesta abertura para que possam
       ser consultados, mas remove imediatamente o contador e evita
       que eles voltem ao reabrir o painel na mesma sessão. */
    const lidas = lidasDaSessao();
    itens.forEach((n) => lidas.add(n.chave));
    guardarLidas(lidas);
    Shell.renderNotifCount();
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

  /* O que a busca alcança, mostrado antes de digitar. "Digite ao
     menos duas letras" dizia a regra e escondia a utilidade. */
  const ESCOPOS = [
    ['arrow-left-right', 'Lançamentos'], ['landmark', 'Contas'], ['credit-card', 'Cartões'],
    ['target', 'Metas'], ['tag', 'Categorias']
  ];

  function tecla(t) { return el('kbd', { text: t }); }

  function pintaBusca(termo) {
    const caixa = U.clear(document.getElementById('searchResults'));
    if (U.norm(termo).length < 2) {
      caixa.appendChild(el('div', { class: 'busca-inicio' }, [
        el('p', { class: 'search-group', text: 'Encontre pelo nome' }),
        el('div', { class: 'busca-escopos' }, ESCOPOS.map(([ico, rotulo]) =>
          el('span', { class: 'busca-escopo' }, [Icons.lucide(ico, 14), el('span', { text: rotulo })]))),
        el('p', { class: 'busca-dicas' }, [
          el('span', {}, [tecla('↑'), tecla('↓'), ' percorre']),
          el('span', {}, [tecla('↵'), ' abre']),
          el('span', {}, [tecla('/'), ' busca de qualquer tela'])
        ])
      ]));
      return;
    }
    const grupos = Shell.buscar(termo);
    if (!grupos.length) {
      caixa.appendChild(el('div', { class: 'busca-vazia' }, [
        el('span', { class: 'busca-vazia-ico', 'aria-hidden': 'true' }, Icons.lucide('search', 18)),
        el('strong', { text: 'Nada encontrado para “' + termo.trim() + '”' }),
        el('span', { text: 'Tente o nome da conta, da categoria ou parte da descrição.' })
      ]));
      return;
    }
    let primeiro = true;
    grupos.forEach((g) => {
      caixa.appendChild(el('div', { class: 'search-group', text: g.nome }));
      g.itens.forEach((i) => {
        /* O primeiro resultado vem marcado: é o que o Enter abre, e a
           marca diz isso antes de a pessoa descobrir apertando. */
        const classe = 'search-item' + (primeiro ? ' is-ativo' : '');
        primeiro = false;
        caixa.appendChild(el('button', {
          class: classe, type: 'button',
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

    document.getElementById('btnSearch').addEventListener('click', abreBusca);
    U.$$('[data-close-search]').forEach((b) => b.addEventListener('click', fechaBusca));
    document.getElementById('searchInput').addEventListener('input', U.debounce((e) => pintaBusca(e.target.value), 160));
    document.getElementById('searchInput').addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowDown') {
        const primeiro = document.querySelector('#searchResults .search-item');
        if (primeiro) { ev.preventDefault(); primeiro.focus(); }
        return;
      }
      if (ev.key !== 'Enter') return;
      const primeiro = document.querySelector('#searchResults .search-item');
      if (primeiro) { ev.preventDefault(); primeiro.click(); }
    });
    /* Setas entre os resultados. Sair do primeiro para cima volta ao
       campo, que é de onde a pessoa veio. */
    document.getElementById('searchResults').addEventListener('keydown', (ev) => {
      if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
      const itens = U.$('#searchResults .search-item');
      const i = itens.indexOf(document.activeElement);
      if (i < 0) return;
      ev.preventDefault();
      if (ev.key === 'ArrowUp' && i === 0) { document.getElementById('searchInput').focus(); return; }
      const alvo = itens[Math.max(0, Math.min(itens.length - 1, i + (ev.key === 'ArrowDown' ? 1 : -1)))];
      itens.forEach((b) => b.classList.toggle('is-ativo', b === alvo));
      alvo.focus();
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

  /* =============================================================
     NAVEGAÇÃO SUPERIOR — grupos com menu
     ------------------------------------------------------------
     Só existe a partir de 821px; abaixo disso o CSS esconde a barra
     e a de baixo assume. Como display:none tira da ordem de foco,
     nada aqui atrapalha o celular mesmo estando sempre ligado.

     Regras de teclado, todas exigidas por quem navega sem mouse:
       Enter/Espaço  abre e fecha
       ↓             abre e cai no primeiro item
       ↑             abre e cai no último
       Esc           fecha e DEVOLVE o foco ao gatilho — sem isso a
                     pessoa é largada no início da página
       Tab para fora fecha o grupo
     ============================================================= */

  let grupoAberto = null;

  function fechaGrupo(devolveFoco) {
    if (!grupoAberto) return;
    const g = grupoAberto;
    grupoAberto = null;
    g.querySelector('.topnav-trigger').setAttribute('aria-expanded', 'false');
    g.querySelector('.topnav-drop').hidden = true;
    if (devolveFoco) g.querySelector('.topnav-trigger').focus();
  }
  Shell.fecharGrupos = () => fechaGrupo(false);

  function abreGrupo(g, focar) {
    if (grupoAberto && grupoAberto !== g) fechaGrupo(false);
    grupoAberto = g;
    g.querySelector('.topnav-trigger').setAttribute('aria-expanded', 'true');
    const drop = g.querySelector('.topnav-drop');
    drop.hidden = false;
    if (focar) {
      const itens = drop.querySelectorAll('.nav-item');
      (focar === 'ultimo' ? itens[itens.length - 1] : itens[0]).focus();
    }
  }

  function itensDo(g) {
    return Array.from(g.querySelectorAll('.topnav-drop .nav-item'));
  }

  Shell.wireTopnav = function () {
    const menu = document.getElementById('topnavMenu');
    if (!menu) return;

    const marca = document.getElementById('topnavBrand');
    if (marca) marca.addEventListener('click', () => App.goTo('home'));

    /* ============================================================
       ÍCONE SEM RÓTULO PRECISA DE DICA VISÍVEL
       ------------------------------------------------------------
       Abaixo de 1400px os destinos da barra perdem o texto e ficam
       só com o ícone; abaixo de 1140px os grupos também. O `title`
       cobre o mouse — mal, com quase um segundo de espera — e NÃO
       cobre o teclado: quem chega de Tab a um ícone mudo não tem
       como saber onde está.

       O rótulo já existe no title de cada item. Copiá-lo para
       data-dica liga a tooltip do projeto (que aparece no foco)
       sem duplicar o texto em lugar nenhum — se o title mudar, a
       dica muda junto.
       ============================================================ */
    U.$$('.topnav-menu [title]').forEach((b) => {
      if (!b.dataset.dica) b.dataset.dica = b.getAttribute('title');
    });
    U.$$('.topnav-trigger').forEach((t) => {
      const txt = t.querySelector('.topnav-trigger-txt');
      if (txt && !t.dataset.dica) t.dataset.dica = txt.textContent.trim();
    });

    U.$$('.topnav-group').forEach((g) => {
      const trigger = g.querySelector('.topnav-trigger');

      trigger.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (grupoAberto === g) fechaGrupo(false); else abreGrupo(g);
      });

      trigger.addEventListener('keydown', (ev) => {
        if (ev.key === 'ArrowDown') { ev.preventDefault(); abreGrupo(g, 'primeiro'); }
        else if (ev.key === 'ArrowUp') { ev.preventDefault(); abreGrupo(g, 'ultimo'); }
        else if (ev.key === 'Escape') fechaGrupo(true);
      });

      g.querySelector('.topnav-drop').addEventListener('keydown', (ev) => {
        const itens = itensDo(g);
        const i = itens.indexOf(document.activeElement);
        if (ev.key === 'ArrowDown') { ev.preventDefault(); itens[(i + 1) % itens.length].focus(); }
        else if (ev.key === 'ArrowUp') { ev.preventDefault(); itens[(i - 1 + itens.length) % itens.length].focus(); }
        else if (ev.key === 'Home') { ev.preventDefault(); itens[0].focus(); }
        else if (ev.key === 'End') { ev.preventDefault(); itens[itens.length - 1].focus(); }
        else if (ev.key === 'Escape') { ev.preventDefault(); fechaGrupo(true); }
      });

      /* Sair do grupo com Tab fecha. O timeout deixa o foco pousar
         antes de perguntarmos onde ele está. */
      g.addEventListener('focusout', () => {
        setTimeout(() => {
          if (grupoAberto === g && !g.contains(document.activeElement)) fechaGrupo(false);
        }, 0);
      });
    });

    /* Escolher um destino fecha o menu — senão ele fica pairando
       sobre a página que acabou de trocar. */
    U.$$('.topnav-drop .nav-item').forEach((b) => {
      b.addEventListener('click', () => fechaGrupo(false));
    });

    document.addEventListener('click', (ev) => {
      if (grupoAberto && !grupoAberto.contains(ev.target)) fechaGrupo(false);
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && grupoAberto) fechaGrupo(true);
    });
  };

  /**
   * Marca o grupo que contém a página atual. Sem isso, quem está em
   * "Metas" não vê nenhum destino aceso: o item ativo está escondido
   * dentro de um menu fechado.
   */
  Shell.marcarGrupoAtivo = function () {
    U.$$('.topnav-group').forEach((g) => {
      const dentro = itensDo(g).some((b) => b.dataset.page === App.page);
      g.classList.toggle('has-active', dentro);
    });
  };

  global.Shell = Shell;
})(window);
