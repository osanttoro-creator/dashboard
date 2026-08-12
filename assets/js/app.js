/* =============================================================
   app.js — estado da interface, roteamento e ligação dos eventos
   ============================================================= */
(function (global) {
  'use strict';

  const App = {
    page: 'home',
    ym: U.todayYM(),
    txSearch: '',
    txOnlyPending: false,
    txMethod: 'all',        // all | account (débito) | card (crédito)
    cardFocusId: null,      // cartão em foco no leque
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
    accounts: { title: 'Cartões e Contas', sub: () => 'Contas, faturas e importação', render: () => Acc.render() },
    categories: { title: 'Categorias', sub: () => 'Organização e peso histórico', render: () => Cat.render() },
    annual: { title: 'Resumo Anual', sub: () => 'Consolidado de ' + U.ymParts(App.ym).y, render: () => Annual.render() }
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
    closeSidebar();
    App.render();
    document.querySelector('.content').scrollTop = 0;
    global.scrollTo({ top: 0, behavior: 'smooth' });
  };

  App.setYM = function (ym) {
    App.ym = ym;
    App.invoiceRef = null;
    syncMonthPicker();
    App.render();
  };

  /** Data padrão dos formulários: hoje, se hoje estiver no mês selecionado. */
  App.selectedDateOrToday = function () {
    const today = U.todayISO();
    return U.ymOf(today) === App.ym ? today : U.monthStart(App.ym);
  };

  App.render = function () {
    const p = PAGES[App.page];
    document.getElementById('pageSub').textContent = p.sub();
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
      `Perfil "${prof.name}" · ${prof.transactions.length} lançamentos · ${prof.accounts.length} contas · ${prof.cards.length} cartões · atualizado ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }

  /* ---------------- seletores de período e perfil ---------------- */

  function syncMonthPicker() {
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
  }

  function syncProfileSelect() {
    const st = Store.state();
    UI.fillSelect(document.getElementById('profileSelect'),
      st.profiles.map((p) => ({ value: p.id, label: p.name })), st.activeProfileId);
  }

  function openSidebar() {
    document.getElementById('sidebar').classList.add('is-open');
    document.getElementById('scrim').classList.add('is-open');
  }
  function closeSidebar() {
    document.getElementById('sidebar').classList.remove('is-open');
    document.getElementById('scrim').classList.remove('is-open');
  }

  /* ---------------- ligação de eventos ---------------- */

  function wire() {
    // navegação
    U.$$('.nav-item').forEach((b) => b.addEventListener('click', () => App.goTo(b.dataset.page)));
    document.getElementById('btnOpenSidebar').addEventListener('click', openSidebar);
    document.getElementById('btnCloseSidebar').addEventListener('click', closeSidebar);
    document.getElementById('scrim').addEventListener('click', closeSidebar);

    // período
    document.getElementById('monthSelect').addEventListener('change', (e) =>
      App.setYM(U.ymKey(U.ymParts(App.ym).y, +e.target.value)));
    document.getElementById('yearSelect').addEventListener('change', (e) =>
      App.setYM(U.ymKey(+e.target.value, U.ymParts(App.ym).m)));
    document.getElementById('btnPrevMonth').addEventListener('click', () => App.setYM(U.addMonths(App.ym, -1)));
    document.getElementById('btnNextMonth').addEventListener('click', () => App.setYM(U.addMonths(App.ym, 1)));
    document.getElementById('btnToday').addEventListener('click', () => App.setYM(U.todayYM()));

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
          App.ym = U.todayYM();
          syncProfileSelect(); syncMonthPicker();
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
      else if (ev.key === 'ArrowLeft' && ev.altKey) App.setYM(U.addMonths(App.ym, -1));
      else if (ev.key === 'ArrowRight' && ev.altKey) App.setYM(U.addMonths(App.ym, 1));
    });

    // redesenha quando os dados mudam
    Store.onChange((reason) => {
      if (reason === 'profile' || reason === 'import' || reason === 'reset' || reason === 'seed') {
        syncProfileSelect();
        syncMonthPicker();
      }
      if (reason === 'theme') { App.render(); return; }
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

    syncProfileSelect();
    syncMonthPicker();
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
          title: 'Bem-vindo(a) ao seu painel financeiro',
          body: U.el('div', { style: { fontSize: '13.5px', lineHeight: '1.65' } }, [
            U.el('p', { text: 'Tudo fica salvo apenas neste navegador — nenhum dado sai do seu computador. Use "↓ Backup" na barra lateral para guardar uma cópia.' }),
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
