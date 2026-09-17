/* =============================================================
   app.js — estado da interface, roteamento e ligação dos eventos
   ============================================================= */
(function (global) {
  'use strict';

  const App = {
    page: 'home',
    ym: U.todayYM(),        // YYYY-MM — o período é o MÊS, não um dia
    txSearch: '',
    txOnlyPending: false,
    txMethod: 'all',        // all | account (débito) | card (crédito)
    cardFocusId: null,      // cartão em foco no leque
    walletFocusId: null,    // conta ou cartão em foco na Visão geral
    accFocusId: null,       // conta em foco na carteira
    invType: '',
    catRange: 'all',
    accTab: 'accounts',
    recTab: 'all',          // all | subs (recorrências × assinaturas)
    calDay: null,           // dia selecionado no calendário
    accHistoryId: null,
    invoiceRef: null
  };

  const PAGES = {
    home:         { title: 'Visão geral',   sub: () => U.smartCase(U.monthLabel(App.ym)),                    render: () => Home.render() },
    transactions: { title: 'Financeiro',    sub: () => 'Receitas, despesas e transferências de ' + U.monthLabel(App.ym), render: () => Tx.render() },
    accounts:     { title: 'Contas e cartões', sub: () => 'Carteira, faturas e limites',                       render: () => Acc.render() },
    budget:       { title: 'Orçamento',     sub: () => 'Limites de ' + U.monthLabel(App.ym),                 render: () => Bud.render() },
    goals:        { title: 'Metas',         sub: () => 'Onde você quer chegar',                              render: () => Goals.render() },
    recurring:    { title: 'Recorrências',  sub: () => 'O que se repete todo mês',                           render: () => Rec.render() },
    calendar:     { title: 'Calendário',    sub: () => 'Semana, mês e ano do seu dinheiro',                  render: () => Cal.render() },
    investments:  { title: 'Investimentos', sub: () => 'Carteira, evolução e projeções',                     render: () => Inv.render() },
    reports:      { title: 'Análises',      sub: () => 'Consolidado de ' + U.ymParts(App.ym).y,              render: () => Rep.render() },
    uglez:        { title: 'UGLEZ',         sub: () => 'Leitura do seu dinheiro',                            render: () => Ug.render() },
    categories:   { title: 'Categorias',    sub: () => 'Organização e peso histórico',                       render: () => Cat.render() },
    settings:     { title: 'Configurações', sub: () => 'Perfil, aparência, dados e integrações',             render: () => Cfg.render() },
    precos:       { title: 'Planos',        sub: () => 'Escolha o tamanho do seu OAZE',                      render: () => Precos.render() }
  };

  /* ---------------- navegação ---------------- */

  /* ============================================================
     ENDEREÇOS
     ------------------------------------------------------------
     Cada página ganha uma URL de verdade. Sem isso, /precos não é
     um link que se manda para alguém, o botão "voltar" do
     navegador sai do app, e o fallback de SPA no servidor não tem
     o que reescrever.

     MAS SÓ ONDE HÁ SERVIDOR. Aberto do disco (file://) a History
     API não funciona — e o app precisa continuar funcionando ali.
     Por isso a troca de URL é condicional; a navegação nunca
     depende dela.
     ============================================================ */
  /* TODAS SOB /app, E ISSO NÃO É COSMÉTICO.
     Quando o site público tomou a raiz, estas rotas ficaram na
     mesma vizinhança que /precos, /entrar e /termos -- e o servidor
     não tem como adivinhar que /orcamento é do aplicativo e
     /privacidade não é. Na prática todas passaram a dar 404: o
     .htaccess mapeia rotas públicas por nome e manda o resto para o
     404, então /financeiro simplesmente não existia mais.

     Com o prefixo, uma regra só (`^app(/.*)?$`) cobre o aplicativo
     inteiro, hoje e nas páginas que ainda não existem. E os dois
     lados param de disputar o mesmo espaço de nomes: /precos é a
     página pública de preços; a de dentro do app é /app/planos. */
  App.URLS = {
    home: '/app', transactions: '/app/financeiro', accounts: '/app/carteira',
    budget: '/app/orcamento', goals: '/app/metas', recurring: '/app/recorrencias',
    calendar: '/app/calendario', investments: '/app/investimentos',
    reports: '/app/analises', uglez: '/app/uglez', categories: '/app/categorias',
    settings: '/app/configuracoes', precos: '/app/planos'
  };

  const PAGINA_DE = Object.keys(App.URLS)
    .reduce((m, k) => { m[App.URLS[k]] = k; return m; }, {});

  /** Só troca a URL onde ela existe: http(s) com History API. */
  function podeTrocarUrl() {
    return (location.protocol === 'http:' || location.protocol === 'https:') &&
      !!(global.history && history.pushState);
  }

  /** A página que a URL atual pede, ou 'home'. */
  App.paginaDaUrl = function () {
    if (!podeTrocarUrl()) return null;
    const caminho = location.pathname.replace(/\/+$/, '') || '/';
    return PAGINA_DE[caminho] || (caminho === '' ? 'home' : null);
  };

  App.goTo = function (page, opts) {
    if (!PAGES[page]) return;
    App.page = page;
    document.body.dataset.page = page;

    /* replace quando é o próprio endereço (evita entrada duplicada
       no histórico ao abrir a página direto), push quando é
       navegação de verdade. */
    if (podeTrocarUrl() && !(opts && opts.semUrl)) {
      const alvo = App.URLS[page] || '/';
      if (location.pathname !== alvo) {
        try { history.pushState({ page }, '', alvo); } catch (e) { /* segue sem URL */ }
      }
    }
    if (opts) {
      if (opts.tab) App.accTab = opts.tab;
      if (opts.cardId) App.cardFocusId = opts.cardId;
      if (opts.invoiceRef) App.invoiceRef = opts.invoiceRef;
    }
    U.$$('.nav-item').forEach((b) => b.classList.toggle('is-active', b.dataset.page === page));
    if (global.Shell && Shell.marcarGrupoAtivo) Shell.marcarGrupoAtivo();
    U.$$('.page').forEach((s) => s.classList.toggle('is-active', s.dataset.page === page));
    document.getElementById('pageTitle').textContent = PAGES[page].title;
    App.render();
    if (global.UglezFlutuante && UglezFlutuante.aoNavegar) UglezFlutuante.aoNavegar(page);
    global.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /** Muda o período exibido. A unidade é o mês. */
  App.setYM = function (ym) {
    App.ym = ym;
    App.invoiceRef = null;
    App.calDay = null;      // o dia selecionado não existe no mês novo
    syncPeriodPicker();
    App.render();
  };

  /** Volta o painel para o mês corrente. */
  App.goToday = function () {
    App.ym = U.todayYM();
    App.invoiceRef = null;
    syncPeriodPicker();
    App.render();
  };

  /** O mês exibido é o mês em que estamos? */
  App.noMesAtual = function () {
    return App.ym === U.todayYM();
  };

  /**
   * Data de corte dos saldos e indicadores.
   *
   * No mês corrente é HOJE: mostrar o saldo do dia 31 no dia 5 seria
   * contar dinheiro que ainda não entrou nem saiu. Em qualquer outro
   * mês — passado ou futuro — é o mês inteiro, porque ali não existe
   * "hoje": o passado já aconteceu e o futuro é o que está previsto.
   */
  App.balanceDate = function () {
    return App.noMesAtual() ? U.todayISO() : U.monthEnd(App.ym);
  };

  /**
   * Data que os formulários trazem preenchida. No mês corrente, hoje.
   * Em outro mês, o mesmo dia do mês — encostado no último dia quando
   * ele não existe lá (31 de janeiro → 28 ou 29 de fevereiro). Nunca
   * uma data fora do mês que a pessoa está olhando.
   */
  App.selectedDateOrToday = function () {
    if (App.noMesAtual()) return U.todayISO();
    const p = U.ymParts(App.ym);
    return U.isoOf(p.y, p.m, U.clampDay(p.y, p.m, +U.todayISO().slice(8, 10)));
  };

  App.render = function () {
    const p = PAGES[App.page];
    document.getElementById('pageSub').textContent = p.sub();
    renderWelcome();
    if (global.Ug && Ug.renderHome && App.page === 'home') { /* desenhado por Home.render */ }
    try {
      p.render();
    } catch (err) {
      console.error('Erro ao desenhar a página "' + App.page + '":', err);
      UI.toast('Algo deu errado ao desenhar esta página. Veja o console.', 'error');
    }
    if (global.Shell && Shell.renderNotifCount) Shell.renderNotifCount();
    renderFooter();
  };

  function renderFooter() {
    const prof = Store.profile();
    /* "Espaço", e não "Perfil": o que a barra escolhe é um conjunto
       de dados financeiros, não uma identidade. O rótulo do
       controle e o do rodapé precisam concordar, senão a mesma
       coisa tem dois nomes na mesma tela. */
    document.getElementById('footInfo').textContent =
      `Espaço "${prof.name}" · ${prof.transactions.length} lançamentos · ` +
      `${prof.accounts.length} contas · ${prof.cards.length} cartões`;

    const onde = document.getElementById('footOnde');
    if (!onde) return;
    const restaurando = global.Sync && Sync.restaurando && Sync.restaurando();
    const conta = global.Sync && Sync.currentUser && Sync.currentUser();
    onde.textContent = restaurando
      ? 'Verificando sua conta…'
      : !conta
        ? 'Dados salvos apenas neste navegador — sem conta, não há cópia em outro lugar'
        : 'Dados na sua conta, no servidor. Este navegador guarda uma cópia para abrir rápido';
  }

  /* ---------------- painel de boas-vindas ---------------- */

  function renderWelcome() {
    const alvo = document.getElementById('ownerName');
    if (alvo) {
      alvo.textContent = Store.ownerName() || 'visitante';
      alvo.title = 'Clique para trocar o nome';
    }

    /* Inicial do perfil no avatar da top bar. A foto do Google, quando
       existe, é escrita por cima pelo sync.js — daí só preencher se o
       avatar ainda não tiver imagem. */
    const av = document.getElementById('profileAvatar');
    if (av && !av.querySelector('img')) {
      av.textContent = (Store.profile().name || '?').trim().charAt(0).toUpperCase();
    }

    /* A data por extenso vira o título do seletor de período: a
       informação continua acessível sem gastar uma linha de tela. */
    const pp = document.getElementById('periodPicker');
    if (pp) {
      pp.title = 'Hoje é ' + new Date().toLocaleDateString('pt-BR', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
      });
    }
  }

  /** Troca o nome da saudação. Fica salvo com o resto do painel. */
  App.askOwnerName = function () { askOwnerName(); };
  function askOwnerName() {
    const campo = U.el('input', {
      class: 'input', type: 'text', maxlength: '40',
      placeholder: 'Como você quer ser chamado?', value: Store.ownerName()
    });
    UI.openModal({
      title: 'Nome na saudação',
      body: U.el('div', { class: 'field' }, [
        campo,
        U.el('p', { class: 'hint', text: 'Aparece no topo do painel. Deixe em branco para voltar a "visitante".' })
      ]),
      buttons: [
        { label: 'Cancelar', class: 'btn-outline', onClick: UI.closeModal },
        {
          label: 'Salvar', class: 'btn-primary',
          onClick: () => { Store.setOwnerName(campo.value); UI.closeModal(); }
        }
      ]
    });
  }

  /* ---------------- seletores de período e perfil ---------------- */

  const seletoresContexto = new Map();
  let seletorAberto = null;

  function sincronizarSeletorContexto(select) {
    const controle = seletoresContexto.get(select);
    if (controle) controle.sincronizar();
  }

  /**
   * O menu nativo de <select> é desenhado pelo sistema operacional e
   * destoava de todos os painéis do app. Mantemos o select como fonte do
   * valor, mas oferecemos um listbox próprio, navegável também por teclado.
   */
  function prepararSeletorContexto(select) {
    if (!select || seletoresContexto.has(select)) return;
    const wrap = select.closest('.pill-select-wrap');
    if (!wrap) return;

    const idMenu = 'menu-' + select.id;
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'oaze-select-button';
    botao.setAttribute('aria-haspopup', 'listbox');
    botao.setAttribute('aria-expanded', 'false');
    botao.setAttribute('aria-controls', idMenu);
    botao.setAttribute('aria-label', select.getAttribute('aria-label') || 'Selecionar');

    const menu = document.createElement('div');
    menu.id = idMenu;
    menu.className = 'oaze-select-menu';
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', select.getAttribute('aria-label') || 'Opções');
    menu.hidden = true;
    document.body.appendChild(menu);

    const fechar = (devolverFoco) => {
      menu.hidden = true;
      botao.setAttribute('aria-expanded', 'false');
      if (seletorAberto && seletorAberto.fechar === fechar) seletorAberto = null;
      if (devolverFoco) botao.focus();
    };

    const desenhar = () => {
      menu.replaceChildren();
      Array.from(select.options).forEach((opcao) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'oaze-select-option';
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', opcao.value === select.value ? 'true' : 'false');
        item.disabled = opcao.disabled;
        item.dataset.value = opcao.value;
        item.textContent = opcao.textContent;
        item.addEventListener('click', () => {
          select.value = opcao.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          fechar(true);
        });
        menu.appendChild(item);
      });
    };

    const abrir = (direcao) => {
      if (seletorAberto && seletorAberto.fechar !== fechar) seletorAberto.fechar(false);
      desenhar();
      menu.hidden = false;
      botao.setAttribute('aria-expanded', 'true');
      seletorAberto = { fechar };
      const r = botao.getBoundingClientRect();
      menu.style.minWidth = Math.max(r.width, 136) + 'px';
      const largura = menu.offsetWidth;
      menu.style.left = Math.max(8, Math.min(r.left, innerWidth - largura - 8)) + 'px';
      const altura = menu.offsetHeight;
      const abaixo = r.bottom + 6;
      menu.style.top = (abaixo + altura <= innerHeight - 8 ? abaixo : Math.max(8, r.top - altura - 6)) + 'px';
      const itens = Array.from(menu.querySelectorAll('.oaze-select-option:not(:disabled)'));
      const marcado = itens.findIndex((item) => item.getAttribute('aria-selected') === 'true');
      const indice = direcao < 0 ? Math.max(0, marcado) : (marcado >= 0 ? marcado : 0);
      if (itens[indice]) itens[indice].focus();
    };

    const sincronizar = () => {
      const opcao = select.options[select.selectedIndex];
      botao.textContent = opcao ? opcao.textContent : '';
      botao.disabled = select.disabled;
      if (!menu.hidden) desenhar();
    };

    botao.addEventListener('click', () => menu.hidden ? abrir(1) : fechar(false));
    botao.addEventListener('keydown', (ev) => {
      if (!['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(ev.key)) return;
      ev.preventDefault();
      abrir(ev.key === 'ArrowUp' ? -1 : 1);
    });
    menu.addEventListener('keydown', (ev) => {
      const itens = Array.from(menu.querySelectorAll('.oaze-select-option:not(:disabled)'));
      const atual = itens.indexOf(document.activeElement);
      let proximo = atual;
      if (ev.key === 'ArrowDown') proximo = Math.min(itens.length - 1, atual + 1);
      else if (ev.key === 'ArrowUp') proximo = Math.max(0, atual - 1);
      else if (ev.key === 'Home') proximo = 0;
      else if (ev.key === 'End') proximo = itens.length - 1;
      else if (ev.key === 'Escape') { ev.preventDefault(); fechar(true); return; }
      else if (ev.key === 'Tab') { fechar(false); return; }
      else return;
      ev.preventDefault();
      if (itens[proximo]) itens[proximo].focus();
    });
    document.addEventListener('pointerdown', (ev) => {
      if (!menu.hidden && !menu.contains(ev.target) && !botao.contains(ev.target)) fechar(false);
    });
    global.addEventListener('resize', () => fechar(false));
    select.addEventListener('change', sincronizar);

    select.classList.add('oaze-select-native');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    wrap.classList.add('is-custom');
    wrap.appendChild(botao);
    seletoresContexto.set(select, { sincronizar, fechar });
    sincronizar();
  }

  function prepararSeletoresContexto() {
    ['profileSelect', 'monthSelect', 'yearSelect']
      .forEach((id) => prepararSeletorContexto(document.getElementById(id)));
  }

  function syncPeriodPicker() {
    const monthSel = document.getElementById('monthSelect');
    const yearSel = document.getElementById('yearSelect');
    const p = U.ymParts(App.ym);

    if (!monthSel.options.length) {
      UI.fillSelect(monthSel, U.MONTHS.map((m, i) => ({ value: String(i), label: m })), String(p.m));
    }
    const years = Calc.yearsWithData();
    const min = Math.min(years[0], p.y, new Date().getFullYear()) - 1;
    const max = Math.max(years[years.length - 1], p.y, new Date().getFullYear()) + 2;
    const opts = [];
    for (let y = min; y <= max; y++) opts.push({ value: String(y), label: String(y) });
    UI.fillSelect(yearSel, opts, String(p.y));
    monthSel.value = String(p.m);

    /* "Mês atual" só faz sentido quando não estamos nele. */
    const hoje = document.getElementById('btnToday');
    if (hoje) hoje.disabled = App.noMesAtual();
    sincronizarSeletorContexto(monthSel);
    sincronizarSeletorContexto(yearSel);
  }

  function syncProfileSelect() {
    const st = Store.state();
    UI.fillSelect(document.getElementById('profileSelect'),
      st.profiles.map((p) => ({ value: p.id, label: p.name })), st.activeProfileId);
    sincronizarSeletorContexto(document.getElementById('profileSelect'));
  }

  function limitarEntradasNumericas() {
    document.addEventListener('input', (ev) => {
      const campo = ev.target;
      if (!(campo instanceof HTMLInputElement)) return;
      const decimal = campo.matches('[inputmode="decimal"]');
      const inteiro = campo.matches('[inputmode="numeric"]');
      if (!decimal && !inteiro) return;
      const inicio = campo.selectionStart;
      const anterior = campo.value;
      const limpo = decimal
        ? anterior.replace(/[^0-9,.]/g, '')
        : anterior.replace(/\D/g, '');
      if (limpo === anterior) return;
      campo.value = limpo;
      if (inicio != null) {
        const antesDoCursor = anterior.slice(0, inicio);
        const limpoAntes = decimal
          ? antesDoCursor.replace(/[^0-9,.]/g, '')
          : antesDoCursor.replace(/\D/g, '');
        campo.setSelectionRange(limpoAntes.length, limpoAntes.length);
      }
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.target instanceof HTMLInputElement && ev.target.type === 'number' &&
          ['e', 'E', '+', '-'].includes(ev.key)) ev.preventDefault();
    });
  }

  /* ---------------- ação principal flutuante ---------------- */

  /* ============================================================
     O "+" MUDA COM A PÁGINA
     ------------------------------------------------------------
     O menu era fixo: quatro lançamentos, iguais em toda parte. Na
     página de cartões, o que a pessoa quer criar é um cartão — e
     para isso precisava fechar o menu, achar o botão "+ Novo
     cartão" no topo e clicar nele. O botão flutuante é o lugar do
     polegar no celular; deixá-lo dizendo sempre a mesma coisa é
     desperdiçar o único controle que está sempre ao alcance.

     Agora cada página declara o que faz sentido criar ali. A Visão
     geral continua exatamente como era — ela é o lugar onde as
     quatro opções são todas plausíveis.

     Regras que valem para todas as listas:
       · o primeiro item é o mais provável naquela página;
       · lançar despesa aparece em quase todas, porque é a ação
         mais frequente do app inteiro;
       · nada aqui é exclusivo: tudo continua acessível pelos
         botões da própria página.
     ============================================================ */
  const ACAO = {
    despesa: { ico: 'arrow-down-right', classe: 'is-expense', rotulo: 'Nova despesa', faz: () => Forms.openTransaction('expense') },
    receita: { ico: 'arrow-up-right', classe: 'is-income', rotulo: 'Nova receita', faz: () => Forms.openTransaction('income') },
    transferencia: { ico: 'arrow-left-right', classe: '', rotulo: 'Transferência', faz: () => Forms.openTransaction('transfer') },
    investimento: { ico: 'trending-up', classe: 'is-invest', rotulo: 'Novo investimento', faz: () => Forms.openInvestment() },
    conta: { ico: 'landmark', classe: '', rotulo: 'Nova conta de débito', faz: () => Forms.openAccount() },
    cartao: { ico: 'credit-card', classe: '', rotulo: 'Novo cartão de crédito', faz: () => Forms.openCard() },
    noCredito: {
      ico: 'credit-card', classe: 'is-expense', rotulo: 'Nova compra no crédito',
      faz: () => Forms.openTransaction('expense', null, {
        method: 'card',
        cardId: App.cardFocusId || ((Store.profile().cards[0] || {}).id || null)
      })
    },
    categoriaDespesa: { ico: 'tag', classe: 'is-expense', rotulo: 'Categoria de despesa', faz: () => Forms.openCategory('expense') },
    categoriaReceita: { ico: 'tag', classe: 'is-income', rotulo: 'Categoria de receita', faz: () => Forms.openCategory('income') },
    orcamento: { ico: 'target', classe: '', rotulo: 'Novo limite de gasto', faz: () => Bud.open() },
    meta: { ico: 'flag', classe: '', rotulo: 'Nova meta', faz: () => Goals.open() },
    fixa: {
      ico: 'repeat', classe: 'is-expense', rotulo: 'Nova despesa fixa',
      faz: () => Forms.openTransaction('expense', null, { recurring: true })
    },
    noDia: {
      ico: 'calendar', classe: 'is-expense', rotulo: 'Lançar no dia escolhido',
      faz: () => Forms.openTransaction('expense', null, { date: App.selectedDateOrToday() })
    }
  };

  const ACOES_DA_PAGINA = {
    home: ['despesa', 'receita', 'transferencia', 'investimento'],
    transactions: ['despesa', 'receita', 'transferencia'],
    budget: ['orcamento', 'despesa'],
    goals: ['meta', 'despesa'],
    recurring: ['fixa', 'receita'],
    calendar: ['noDia', 'receita', 'despesa'],
    investments: ['investimento', 'receita'],
    categories: ['categoriaDespesa', 'categoriaReceita'],
    reports: ['despesa', 'receita']
  };

  /** A carteira muda com a aba: contas de um lado, cartões do outro. */
  function acoesDaPagina() {
    if (App.page === 'accounts') {
      return App.accTab === 'cards'
        ? ['cartao', 'noCredito', 'conta']
        : ['conta', 'cartao', 'despesa', 'receita'];
    }
    return ACOES_DA_PAGINA[App.page] || ACOES_DA_PAGINA.home;
  }

  /** Redesenha o menu do "+" para a página atual. */
  function pintarFab() {
    const menu = document.getElementById('fabMenu');
    if (!menu) return;
    U.clear(menu);
    acoesDaPagina().forEach((chave) => {
      const a = ACAO[chave];
      if (!a) return;
      menu.appendChild(U.el('button', {
        class: 'fab-item', type: 'button', role: 'menuitem',
        onclick: () => { fabOpen(false); a.faz(); }
      }, [
        U.el('span', { class: 'fab-item-ico ' + a.classe }, Icons.lucide(a.ico, 17)),
        U.el('span', { text: a.rotulo })
      ]));
    });
  }
  App.pintarFab = pintarFab;

  /**
   * O "+" abre as ações da página. O menu nasce no canto do botão
   * (transform-origin no CSS), então fica claro de onde ele veio — e
   * some pelo mesmo caminho.
   */
  function fabOpen(abrir) {
    const btn = document.getElementById('fabBtn');
    const menu = document.getElementById('fabMenu');
    const estaAberto = btn.getAttribute('aria-expanded') === 'true';
    const alvo = abrir === undefined ? !estaAberto : abrir;
    if (alvo === estaAberto) return;
    btn.setAttribute('aria-expanded', alvo ? 'true' : 'false');
    if (alvo) pintarFab();     // a página pode ter mudado desde a última vez
    menu.hidden = !alvo;
    if (alvo) {
      paintIcons();
      const primeiro = menu.querySelector('.fab-item');
      if (primeiro) primeiro.focus();
    }
  }

  function wireFab() {
    const btn = document.getElementById('fabBtn');
    const menu = document.getElementById('fabMenu');
    btn.addEventListener('click', () => fabOpen());

    // fecha ao escolher, ao clicar fora e no Escape
    menu.addEventListener('click', () => fabOpen(false));
    document.addEventListener('click', (ev) => {
      if (!document.getElementById('fabWrap').contains(ev.target)) fabOpen(false);
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') {
        fabOpen(false); btn.focus();
      }
    });
    // setas percorrem o menu — é um menu, então precisa andar pelo teclado
    menu.addEventListener('keydown', (ev) => {
      if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
      ev.preventDefault();
      const itens = U.$$('.fab-item', menu);
      const i = itens.indexOf(document.activeElement);
      const passo = ev.key === 'ArrowDown' ? 1 : -1;
      itens[(i + passo + itens.length) % itens.length].focus();
    });
  }

  /** Preenche os ícones declarados no HTML com data-ico. */
  function paintIcons() {
    U.$$('[data-ico]').forEach((n) => {
      if (n.firstElementChild) return;
      n.appendChild(Icons.lucide(n.dataset.ico, +n.dataset.icoSize || 17));
    });
    /* E a marca, onde ela for declarada. Fica junto porque é o
       mesmo problema -- HTML declara, JavaScript desenha -- e
       separar em dois passos criaria a chance de um rodar sem o
       outro depois de um render. */
    Icons.pintarMarcas();
  }

  /* ---------------- ligação de eventos ---------------- */

  function wire() {
    limitarEntradasNumericas();
    // navegação
    U.$$('.nav-item').forEach((b) => b.addEventListener('click', () => App.goTo(b.dataset.page)));

    // saudação e ação principal
    document.getElementById('ownerName').addEventListener('click', askOwnerName);
    wireFab();

    // período — mês e ano; o dia não é escolha global
    document.getElementById('monthSelect').addEventListener('change', (e) =>
      App.setYM(U.ymKey(U.ymParts(App.ym).y, +e.target.value)));
    document.getElementById('yearSelect').addEventListener('change', (e) =>
      App.setYM(U.ymKey(+e.target.value, U.ymParts(App.ym).m)));
    document.getElementById('btnPrevMonth').addEventListener('click', () => App.setYM(U.addMonths(App.ym, -1)));
    document.getElementById('btnNextMonth').addEventListener('click', () => App.setYM(U.addMonths(App.ym, 1)));
    document.getElementById('btnToday').addEventListener('click', () => App.goToday());

    // perfil
    document.getElementById('profileSelect').addEventListener('change', (e) => {
      Store.setActiveProfile(e.target.value);
      App.accHistoryId = null; App.cardFocusId = null; App.walletFocusId = null;
      App.invoiceRef = null;
      UI.toast('Perfil alterado.');
    });
    document.getElementById('btnProfiles').addEventListener('click', () => Forms.openProfiles());

    // ações rápidas (delegação — funciona em qualquer página)
    document.addEventListener('click', (ev) => {
      const q = ev.target.closest('[data-quick]');
      if (q) {
        const k = q.dataset.quick;
        if (k === 'investment') Forms.openInvestment();
        else Forms.openTransaction(k);
        return;
      }
      const g = ev.target.closest('[data-goto]');
      if (g) { App.goTo(g.dataset.goto, g.dataset.aba ? { tab: g.dataset.aba } : undefined); return; }
      const nc = ev.target.closest('[data-newcat]');
      if (nc) { Forms.openCategory(nc.dataset.newcat); }
    });

    // página 2
    document.getElementById('txSearch').addEventListener('input', U.debounce((e) => {
      App.txSearch = e.target.value; if (App.page === 'transactions') Tx.render();
    }, 200));
    document.getElementById('txOnlyPending').addEventListener('change', (e) => {
      App.txOnlyPending = e.target.checked; if (App.page === 'transactions') Tx.render();
    });
    U.$$('#txMethodFilter button').forEach((b) => b.addEventListener('click', () => {
      App.txMethod = b.dataset.method; if (App.page === 'transactions') Tx.render();
    }));

    // página 3
    document.getElementById('invTypeFilter').addEventListener('change', (e) => {
      App.invType = e.target.value; if (App.page === 'investments') Inv.render();
    });
    document.getElementById('projForm').addEventListener('submit', (e) => {
      e.preventDefault(); Inv.runProjection();
    });

    // página 4
    U.$$('#accTabs .tab').forEach((b) => b.addEventListener('click', () => {
      App.accTab = b.dataset.tab; Acc.render();
    }));
    document.getElementById('btnNewAccount').addEventListener('click', () => Forms.openAccount());
    document.getElementById('btnNewCard').addEventListener('click', () => Forms.openCard());
    document.getElementById('accHistorySelect').addEventListener('change', (e) => {
      App.accHistoryId = e.target.value; Acc.render();
    });
    // (a navegação de faturas agora fica no próprio painel do cartão em foco)

    // página 5
    document.getElementById('catRangeSelect').addEventListener('change', (e) => {
      App.catRange = e.target.value; if (App.page === 'categories') Cat.render();
    });

    // orçamento e metas
    document.getElementById('btnNewBudget').addEventListener('click', () => Bud.open());
    document.getElementById('btnNewGoal').addEventListener('click', () => Goals.open());

    // recorrências: abas
    U.$$('#recTabs .tab').forEach((b) => b.addEventListener('click', () => {
      App.recTab = b.dataset.rectab; if (App.page === 'recurring') Rec.render();
    }));

    // análises
    document.getElementById('btnExportCsv').addEventListener('click', () => Rep.exportCsv());
    document.getElementById('btnExportPdf').addEventListener('click', () => Rep.exportarPdf());

    // como o score é calculado
    document.getElementById('btnScoreHelp').addEventListener('click', () => Home.explainScore());

    // a marca leva para a visão geral
    document.getElementById('brandHome').addEventListener('click', () => App.goTo('home'));

    // atalhos
    document.addEventListener('keydown', (ev) => {
      if (ev.target.matches('input, textarea, select')) return;
      if (!document.getElementById('modalRoot').hidden) return;
      if (ev.key === 'd' || ev.key === 'D') { ev.preventDefault(); Forms.openTransaction('expense'); }
      else if (ev.key === 'r' || ev.key === 'R') { ev.preventDefault(); Forms.openTransaction('income'); }
      else if (ev.key === 'n' || ev.key === 'N') { ev.preventDefault(); fabOpen(true); }
      else if (ev.key === 'ArrowLeft' && ev.altKey) App.setYM(U.addMonths(App.ym, -1));
      else if (ev.key === 'ArrowRight' && ev.altKey) App.setYM(U.addMonths(App.ym, 1));
    });

    // redesenha quando os dados mudam
    Store.onChange((reason) => {
      if (reason === 'profile' || reason === 'import' || reason === 'reset' || reason === 'seed') {
        syncProfileSelect();
        syncPeriodPicker();
      }
      App.render();
    });
  }

  /* ---------------- boot ---------------- */

  function boot() {
    const st = Store.load();
    /* O tema é do Tema, e de mais ninguém. Ele resolve escolha
       explícita × sistema operacional e pinta antes de qualquer
       outra coisa, para não haver um piscar de tema errado. */
    Tema.init();
    void st;

    if (!Charts.available()) {
      document.getElementById('offlineNote').hidden = false;
      U.$$('.chart-box').forEach((b) => { b.style.display = 'none'; });
      setTimeout(() => { document.getElementById('offlineNote').hidden = true; }, 9000);
    }

    if (!Store.storageOK) {
      setTimeout(() => UI.toast(
        'Este navegador está bloqueando o armazenamento local: os dados vão sumir ao fechar a aba. Baixe um backup antes de sair.',
        'error', 12000), 800);
    }

    /* Cada peça do boot é isolada: se a sincronização (que depende de
       rede) ou o UGLEZ falharem, o painel ainda abre. Antes, uma
       exceção em qualquer uma delas abortava o boot inteiro e a tela
       ficava vazia sem nenhuma mensagem — falha silenciosa, a pior. */
    const passo = (nome, fn) => {
      try { fn(); } catch (e) {
        console.error('Falha ao iniciar "' + nome + '":', e);
        UI.toast('Parte do app não iniciou (' + nome + '). Veja o console.', 'error', 8000);
      }
    };

    passo('ícones', paintIcons);
    passo('perfis', syncProfileSelect);
    passo('período', syncPeriodPicker);
    passo('seletores de contexto', prepararSeletoresContexto);
    passo('eventos', wire);
    passo('calendário', () => Cal.init());
    passo('navegação superior', () => Shell.wireTopnav());
    passo('navegação do celular', () => Shell.wireCelular());
    /* O botão "voltar" do navegador precisa voltar DENTRO do app.
       Sem isto, ele sai do OAZE — que é a forma mais rápida de
       alguém achar que perdeu o que estava fazendo. */
    /* O "voltar" do navegador precisa voltar DENTRO do app. Sem
       isto, ele sai do OAZE — a forma mais rápida de alguém achar
       que perdeu o que estava fazendo. */
    passo('endereços', () => {
      global.addEventListener('popstate', () => {
        const pg = App.paginaDaUrl();
        if (pg) App.goTo(pg, { semUrl: true });
      });
    });
    passo('conta', () => Conta.init());
    passo('limites', () => Limites.carregar());
    passo('fila offline', () => Fila.init());
    /* Dados antes de Sync: é o Sync que avisa da entrada, e quando
       avisar o Dados já precisa estar escutando. Na ordem inversa a
       primeira sessão da sessão passaria despercebida. */
    passo('fonte dos dados', () => Dados.init());
    passo('estado da sincronia', () => EstadoSync.init());
    passo('sincronização', () => Sync.init());
    passo('UGLEZ', () => AI.init());
    passo('UGLEZ flutuante', () => UglezFlutuante.init());
    passo('controles', () => Shell.init());
    /* A rota é lida ANTES de qualquer navegação. App.goTo('home')
       faz pushState('/') e, ao fazer isso, apaga a URL que estamos
       tentando ler — abrir /precos direto caía na visão geral, sem
       erro nenhum. Ler primeiro, navegar depois. */
    const rotaInicial = App.paginaDaUrl && App.paginaDaUrl();
    App.goTo(rotaInicial && PAGES[rotaInicial] ? rotaInicial : 'home', { semUrl: true });

    /* Primeira visita sem dados: configuração progressiva.
       Antes daqui havia um modal que oferecia "carregar dados de
       exemplo" — a saída mais rápida para um painel bonito e a mais
       lenta para um painel útil. Agora as etapas constroem o
       produto de verdade, e o que aparece no fim é do usuário.

       O atraso deixa a interface desenhar antes: um modal sobre a
       tela em branco assusta mais do que informa. */
    setTimeout(() => {
      if (global.Ob && Ob.talvezOferecer) Ob.talvezOferecer();
    }, 700);
  }

  global.App = App;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
