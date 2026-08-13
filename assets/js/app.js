/* =============================================================
   app.js — estado da interface, roteamento e ligação dos eventos
   ============================================================= */
(function (global) {
  'use strict';

  const App = {
    page: 'home',
    refDate: U.todayISO(),  // dia de referência; App.ym é o mês dele
    ym: U.todayYM(),
    txSearch: '',
    txOnlyPending: false,
    txMethod: 'all',        // all | account (débito) | card (crédito)
    cardFocusId: null,      // cartão em foco no leque
    accFocusId: null,       // conta em foco na carteira
    invType: '',
    catRange: 'all',
    accTab: 'accounts',
    accHistoryId: null,
    invoiceRef: null,
    importTarget: null
  };

  const PAGES = {
    home: { title: 'Início', sub: () => 'Visão geral de ' + U.monthLabel(App.ym), render: () => Home.render() },
    transactions: { title: 'Receitas e Despesas', sub: () => 'Lançamentos de ' + U.monthLabel(App.ym), render: () => Tx.render() },
    investments: { title: 'Investimentos', sub: () => 'Carteira e projeções', render: () => Inv.render() },
    accounts: { title: 'Cartões e Contas', sub: () => 'Sua carteira, faturas e importação', render: () => Acc.render() },
    categories: { title: 'Categorias', sub: () => 'Organização e peso histórico', render: () => Cat.render() }
  };

  /* ---------------- navegação ---------------- */

  App.goTo = function (page, opts) {
    if (!PAGES[page]) return;
    App.page = page;
    if (opts) {
      if (opts.tab) App.accTab = opts.tab;
      if (opts.cardId) App.cardFocusId = opts.cardId;
      if (opts.invoiceRef) App.invoiceRef = opts.invoiceRef;
    }
    U.$$('.nav-item').forEach((b) => b.classList.toggle('is-active', b.dataset.page === page));
    U.$$('.page').forEach((s) => s.classList.toggle('is-active', s.dataset.page === page));
    document.getElementById('pageTitle').textContent = PAGES[page].title;
    App.render();
    global.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /**
   * Muda o período. O dia acompanha: se o dia de referência não existe no
   * mês de destino (31 → fevereiro), encosta no último dia do mês.
   */
  App.setYM = function (ym, dia) {
    const p = U.ymParts(ym);
    const d = U.clampDay(p.y, p.m, dia != null ? dia : (+String(App.refDate).slice(8, 10) || 1));
    App.ym = ym;
    App.refDate = U.isoOf(p.y, p.m, d);
    App.invoiceRef = null;
    syncPeriodPicker();
    App.render();
  };

  /** Volta o painel para hoje — dia, mês e ano. */
  App.goToday = function () {
    App.refDate = U.todayISO();
    App.ym = U.todayYM();
    App.invoiceRef = null;
    syncPeriodPicker();
    App.render();
  };

  /** Data padrão dos formulários: o dia de referência escolhido no topo. */
  App.selectedDateOrToday = function () {
    return U.isValidISO(App.refDate) ? App.refDate : U.monthStart(App.ym);
  };

  /**
   * Data de corte dos saldos: o dia escolhido, mas nunca além do fim do
   * mês exibido — o cartão de uma conta diz "saldo em" exatamente isto.
   */
  App.balanceDate = function () {
    const fim = U.monthEnd(App.ym);
    return App.refDate && App.refDate <= fim && App.refDate >= U.monthStart(App.ym) ? App.refDate : fim;
  };

  App.render = function () {
    const p = PAGES[App.page];
    document.getElementById('pageSub').textContent = p.sub();
    renderWelcome();
    if (global.AI && AI.renderInsight) AI.renderInsight(App.ym);
    try {
      p.render();
    } catch (err) {
      console.error('Erro ao desenhar a página "' + App.page + '":', err);
      UI.toast('Algo deu errado ao desenhar esta página. Veja o console.', 'error');
    }
    renderFooter();
  };

  function renderFooter() {
    const prof = Store.profile();
    document.getElementById('footInfo').textContent =
      `Perfil "${prof.name}" · ${prof.transactions.length} lançamentos · ${prof.accounts.length} contas · ${prof.cards.length} cartões`;
  }

  /* ---------------- painel de boas-vindas ---------------- */

  function renderWelcome() {
    const nome = Store.ownerName();
    const alvo = document.getElementById('ownerName');
    alvo.textContent = nome || 'visitante';
    alvo.title = 'Clique para trocar o nome';

    const hoje = new Date();
    document.getElementById('todayNote').textContent =
      'Hoje é ' + hoje.toLocaleDateString('pt-BR', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
      });
  }

  /** Troca o nome da saudação. Fica salvo com o resto do painel. */
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

  function syncPeriodPicker() {
    const daySel = document.getElementById('daySelect');
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

    // o dia acompanha o mês: fevereiro não oferece 30 nem 31
    const dias = [];
    for (let d = 1; d <= U.daysInMonth(p.y, p.m); d++) dias.push({ value: String(d), label: String(d) });
    UI.fillSelect(daySel, dias, String(+String(App.refDate).slice(8, 10) || 1));
  }

  function syncProfileSelect() {
    const st = Store.state();
    UI.fillSelect(document.getElementById('profileSelect'),
      st.profiles.map((p) => ({ value: p.id, label: p.name })), st.activeProfileId);
  }

  /* ---------------- ação principal flutuante ---------------- */

  /**
   * O "+" abre os quatro lançamentos. O menu nasce no canto do botão
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
  }

  /* ---------------- ligação de eventos ---------------- */

  function wire() {
    // navegação
    U.$$('.nav-item').forEach((b) => b.addEventListener('click', () => App.goTo(b.dataset.page)));

    // saudação e ação principal
    document.getElementById('ownerName').addEventListener('click', askOwnerName);
    wireFab();

    // período — dia, mês e ano são editáveis
    document.getElementById('daySelect').addEventListener('change', (e) =>
      App.setYM(App.ym, +e.target.value));
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
      App.accHistoryId = null; App.cardFocusId = null; App.invoiceRef = null; App.importTarget = null;
      UI.toast('Perfil alterado.');
    });
    document.getElementById('btnProfiles').addEventListener('click', () => Forms.openProfiles());

    // tema
    document.getElementById('btnTheme').addEventListener('click', () => {
      Store.setTheme(Store.state().theme === 'dark' ? 'light' : 'dark');
    });

    // backup
    document.getElementById('btnExport').addEventListener('click', () => {
      U.download(`financas-backup-${U.todayISO()}.json`, Store.exportJSON());
      UI.toast('Backup baixado.', 'success');
    });
    document.getElementById('btnImport').addEventListener('click', () => document.getElementById('fileRestore').click());
    document.getElementById('fileRestore').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const ok = await UI.confirm({
        title: 'Restaurar backup',
        message: 'Restaurar <strong>substitui todos os dados atuais</strong> (todos os perfis) pelo conteúdo do arquivo. Faça um backup antes se tiver dúvida. Continuar?',
        confirmLabel: 'Restaurar', danger: true
      });
      if (!ok) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          Store.importJSON(String(reader.result));
          App.refDate = U.todayISO();
          App.ym = U.todayYM();
          syncProfileSelect(); syncPeriodPicker();
          UI.toast('Backup restaurado.', 'success');
        } catch (err) {
          console.error(err);
          UI.toast('Arquivo inválido: ' + err.message, 'error');
        }
      };
      reader.readAsText(file, 'utf-8');
    });

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
      if (g) { App.goTo(g.dataset.goto); return; }
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

    // importação
    document.getElementById('importFile').addEventListener('change', (e) => Importer.readFile(e.target.files[0]));
    document.getElementById('btnParseImport').addEventListener('click', () => Importer.analyze());
    document.getElementById('importTarget').addEventListener('change', (e) => { App.importTarget = e.target.value; });

    // página 5
    document.getElementById('catRangeSelect').addEventListener('change', (e) => {
      App.catRange = e.target.value; if (App.page === 'categories') Cat.render();
    });

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
    document.documentElement.setAttribute('data-theme', st.theme);

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

    paintIcons();
    syncProfileSelect();
    syncPeriodPicker();
    wire();
    Sync.init();
    AI.init();
    App.goTo('home');

    // primeira visita: oferece dados de exemplo
    // (o Safari em aba privada lança exceção no localStorage — daí o try)
    const flag = (function () { try { return localStorage.getItem('financas.welcomed'); } catch (e) { return null; } })();
    const prof = Store.profile();
    if (!prof.transactions.length && !flag) {
      try { localStorage.setItem('financas.welcomed', '1'); } catch (e) { /* segue sem marcar */ }
      setTimeout(() => {
        UI.openModal({
          title: 'Bem-vindo ao OAZE',
          body: U.el('div', { style: { fontSize: '13.5px', lineHeight: '1.65' } }, [
            U.el('p', { text: 'Tudo fica salvo apenas neste navegador — nenhum dado sai do seu computador. Use "↓ Backup" no topo da tela para guardar uma cópia.' }),
            U.el('p', { style: { marginTop: '10px' }, text: 'Duas formas de começar:' }),
            U.el('ul', { style: { marginTop: '8px', paddingLeft: '18px', listStyle: 'disc' } }, [
              U.el('li', { text: 'Cadastre suas contas e cartões em "Cartões e Contas" e comece a lançar.' }),
              U.el('li', { text: 'Ou carregue dados de exemplo para explorar o painel antes.' })
            ]),
            U.el('p', { style: { marginTop: '10px', color: 'var(--muted)' }, text: 'Atalhos: D = nova despesa · R = nova receita · Alt+←/→ muda o mês.' })
          ]),
          buttons: [
            { label: 'Começar do zero', class: 'btn-outline', onClick: () => { UI.closeModal(); App.goTo('accounts'); } },
            {
              label: 'Carregar dados de exemplo', class: 'btn-primary',
              onClick: () => { Store.seedDemo(); UI.closeModal(); UI.toast('Dados de exemplo criados. Explore à vontade.', 'success'); }
            }
          ],
          noAutofocus: true
        });
      }, 500);
    }
  }

  global.App = App;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
