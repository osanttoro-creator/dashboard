/* =============================================================
   store.js — modelo de dados, persistência e backup
   ------------------------------------------------------------
   Formato salvo em localStorage['financas.v1']:
   {
     version, theme, ownerName, activeProfileId,
     profiles: [{
       id, name, createdAt,
       accounts:    [{id,name,bank,type,color,gradient,last4,openingBalance,openedAt,archived}]
       cards:       [{id,name,bank,color,gradient,last4,limit,closingDay,dueDay,accountId}]
       categories:  [{id,name,kind:'income'|'expense',color,icon}]
       transactions:[{...}]  // ver normalizeTx()
       investments: [{id,name,type,amount,date,rate,currentValue,notes}]
       invoices:    {'cardId|YYYY-MM': {paid,paidAt,accountId,amount}}
       budgets:     {categoriaId: limiteMensal}
       goals:       [{id,name,target,saved,deadline,color,icon,accountId}]
     }]
   }
   ============================================================= */
(function (global) {
  'use strict';

  const KEY = 'financas.v1';
  const VERSION = 1;

  /* ------------------------------------------------------------
     Paleta das categorias — família OAZE
     ------------------------------------------------------------
     A interface é neutra e profunda; a cor vive nos DADOS, e é aqui
     que ela começa. Estes hexes são a matiz de referência de cada
     categoria: os tokens --s1..--s10 do CSS ajustam a luminância por
     tema, porque uma série só não sobrevive a um fundo areia E a um
     fundo Midnight sem alguma cor sumir.

     As vizinhas se distinguem por MATIZ, não por luminância. Onde
     isso não basta (daltonismo), a categoria nunca aparece só como
     cor: vem sempre com ícone e nome.
     ------------------------------------------------------------ */
  const PALETTE = ['#2E6E7E', '#A85A32', '#3B6558', '#7B5A8E', '#1F6B4F', '#B07C3E'];
  /* extras do seletor — mesma família, outros passos */
  const PALETTE_EXTRA = ['#34557A', '#8A5A38', '#4C6B33', '#6E4E3D', '#0F2C3D', '#2D4F56',
    '#547A6E', '#8A7A62', '#4E3A55', '#9A5F35'];
  const ALL_COLORS = PALETTE.concat(PALETTE_EXTRA);

  /* Migração: dados salvos com paletas anteriores ganham o equivalente
     nesta. Cores escolhidas à mão ficam como estão. */
  const OLD_TO_NEW = {
    /* ---- paleta do deserto (v1.2) ---- */
    '#c9794a': '#A85A32', '#7a846a': '#4C6B33', '#d9a441': '#B07C3E',
    '#6b4a76': '#7B5A8E', '#a0553f': '#8A5A38', '#3f5d57': '#3B6558',
    '#c2a46e': '#8A7A62', '#8a6a4f': '#6E4E3D', '#a68b6b': '#8A7A62',
    '#8c8f4e': '#4C6B33', '#5a3e2b': '#0F2C3D', '#e7d4b5': '#8A7A62',
    '#8e4e2a': '#9A5F35', '#4a5c39': '#1F6B4F', '#b8846b': '#A85A32',
    '#527a72': '#2E6E7E', '#7f588c': '#7B5A8E', '#d9a442': '#B07C3E',
    /* ---- paleta "Ethereal" (v1.1) ---- */
    '#3dd68c': '#1F6B4F', '#6c6ce0': '#34557A', '#f0554d': '#A85A32',
    '#f2b84b': '#B07C3E', '#4ec5d4': '#2E6E7E', '#9aa0ac': '#8A7A62',
    '#2ba86c': '#4C6B33', '#4f4fc9': '#34557A', '#c93e38': '#8A5A38',
    '#d69a33': '#9A5F35', '#3a9daa': '#2E6E7E', '#5a4fcf': '#7B5A8E',
    '#7c6cf0': '#7B5A8E',
    /* ---- paleta original (v1.0), caso alguém pule versões ---- */
    '#2a78d6': '#34557A', '#eb6834': '#9A5F35', '#1baf7a': '#3B6558', '#eda100': '#B07C3E',
    '#e87ba4': '#7B5A8E', '#008300': '#1F6B4F', '#4a3aa7': '#34557A', '#e34948': '#A85A32',
    '#256abf': '#34557A', '#c9541f': '#9A5F35', '#12805a': '#4C6B33', '#b87c00': '#B07C3E',
    '#c95f85': '#7B5A8E', '#006300': '#1F6B4F', '#6f60c9': '#34557A', '#b53434': '#8A5A38',
    '#898781': '#8A7A62', '#0b0b0b': '#0F2C3D', '#0b3a6b': '#34557A', '#d03b3b': '#A85A32',
    '#3987e5': '#34557A', '#d95926': '#9A5F35', '#199e70': '#3B6558', '#c98500': '#B07C3E',
    '#d55181': '#7B5A8E', '#9085e9': '#7B5A8E', '#e66767': '#A85A32'
  };
  const migrateColor = (c) => OLD_TO_NEW[String(c || '').toLowerCase()] || c || '#8A7A62';

  /* A cor aqui é só o acento da conta na interface; o logo e a cor de
     marca do banco vêm do pacote vendorizado (ver icons.js). */
  const BANK_PRESETS = [
    { name: 'Itaú', color: '#9A5F35' }, { name: 'Nubank', color: '#7B5A8E' },
    { name: 'Bradesco', color: '#8A5A38' }, { name: 'Santander', color: '#A85A32' },
    { name: 'Caixa', color: '#34557A' }, { name: 'Banco do Brasil', color: '#B07C3E' },
    { name: 'Inter', color: '#9A5F35' }, { name: 'C6 Bank', color: '#0F2C3D' },
    { name: 'BTG Pactual', color: '#34557A' }, { name: 'Sicredi', color: '#1F6B4F' },
    { name: 'Sicoob', color: '#4C6B33' }, { name: 'Original', color: '#1F6B4F' },
    { name: 'PicPay', color: '#4C6B33' }, { name: 'Mercado Pago', color: '#2E6E7E' },
    { name: 'XP', color: '#0F2C3D' }, { name: 'Safra', color: '#2D4F56' },
    { name: 'Neon', color: '#2E6E7E' }, { name: 'Nomad', color: '#3B6558' },
    { name: 'Wise', color: '#B07C3E' }, { name: 'PagBank', color: '#4C6B33' },
    { name: 'Outro', color: '#8A7A62' }
  ];

  const ACCOUNT_TYPES = ['Conta corrente', 'Conta poupança', 'Conta de pagamento', 'Carteira / dinheiro', 'Conta investimento'];
  const INVESTMENT_TYPES = ['Renda fixa', 'Tesouro Direto', 'CDB', 'Fundo de investimento', 'Ações', 'FIIs', 'ETF', 'Criptomoeda', 'Previdência', 'Poupança', 'Outro'];

  /* mesmos hexes que a migração produz — perfil novo e migrado ficam iguais */
  const DEFAULT_EXPENSE_CATS = [
    ['Moradia', '#34557A', 'house'], ['Alimentação', '#B07C3E', 'utensils'], ['Transporte', '#2E6E7E', 'car'],
    ['Saúde', '#3B6558', 'heart-pulse'], ['Educação', '#7B5A8E', 'graduation-cap'], ['Lazer', '#1F6B4F', 'gamepad-2'],
    ['Compras', '#9A5F35', 'shopping-bag'], ['Assinaturas', '#A85A32', 'repeat'], ['Impostos e taxas', '#4E3A55', 'receipt'],
    ['Outros', '#8A7A62', 'circle-ellipsis']
  ];
  const DEFAULT_INCOME_CATS = [
    ['Salário', '#34557A', 'banknote'], ['Freelance / PJ', '#2E6E7E', 'briefcase'], ['Rendimentos', '#1F6B4F', 'trending-up'],
    ['Reembolso', '#B07C3E', 'arrow-left-right'], ['Vendas', '#7B5A8E', 'tag'], ['Outros', '#8A7A62', 'circle-ellipsis']
  ];

  /* ============================================================ */

  const Store = {
    PALETTE, ALL_COLORS, BANK_PRESETS, ACCOUNT_TYPES, INVESTMENT_TYPES
  };

  let state = null;
  const listeners = [];

  /* ---------------- fábricas ---------------- */

  function makeCategories() {
    const out = [];
    DEFAULT_EXPENSE_CATS.forEach(([name, color, icon]) =>
      out.push({ id: U.uid('cat'), name, kind: 'expense', color, icon }));
    DEFAULT_INCOME_CATS.forEach(([name, color, icon]) =>
      out.push({ id: U.uid('cat'), name, kind: 'income', color, icon }));
    return out;
  }

  function makeProfile(name) {
    return {
      id: U.uid('prf'),
      name: name || 'Pessoal',
      createdAt: U.todayISO(),
      updatedAt: 0,
      accounts: [],
      cards: [],
      budgets: {},        // { categoriaId: limite mensal }
      goals: [],          // { id, name, target, saved, deadline, color, icon }
      categories: makeCategories(),
      transactions: [],
      investments: [],
      invoices: {}
    };
  }

  function makeInitialState() {
    const pessoal = makeProfile('Pessoal');
    const pj = makeProfile('PJ / Autônomo');
    pessoal.accounts.push({
      id: U.uid('acc'), name: 'Conta corrente', bank: 'Itaú', type: 'Conta corrente',
      color: '#B07C3E', openingBalance: 0, openedAt: U.todayISO(), archived: false
    });
    return {
      version: VERSION,
      theme: 'dark',            // noite no deserto é o tema principal
      ownerName: '',            // quem é o dono do painel (saudação)
      activeProfileId: pessoal.id,
      profiles: [pessoal, pj]
    };
  }

  /* ---------------- normalização ---------------- */

  Store.normalizeTx = function (tx) {
    const t = Object.assign({}, tx);
    t.id = t.id || U.uid('tx');
    t.kind = ['income', 'expense', 'transfer'].includes(t.kind) ? t.kind : 'expense';
    t.description = String(t.description || '').trim() || '(sem descrição)';
    t.amount = Math.abs(U.round2(+t.amount || 0));
    t.date = U.isValidISO(t.date) ? t.date : U.todayISO();
    t.categoryId = t.categoryId || null;
    t.method = t.kind === 'expense' && t.cardId ? 'card' : 'account';
    t.accountId = t.accountId || null;
    t.toAccountId = t.kind === 'transfer' ? (t.toAccountId || null) : null;
    t.cardId = t.method === 'card' ? t.cardId : null;
    t.recurring = !!t.recurring;
    t.recurEnd = t.recurring && /^\d{4}-\d{2}$/.test(t.recurEnd || '') ? t.recurEnd : null;
    t.confirmed = t.confirmed !== false;
    t.occ = (t.occ && typeof t.occ === 'object') ? t.occ : {};
    t.installment = t.installment && t.installment.total > 1
      ? { total: +t.installment.total, index: +t.installment.index || 1, groupId: t.installment.groupId || null }
      : null;
    t.notes = String(t.notes || '');
    t.source = t.source || 'manual';
    t.createdAt = t.createdAt || new Date().toISOString();
    return t;
  };

  function normalizeProfile(p) {
    const prof = Object.assign(makeProfile(p && p.name), p || {});
    prof.id = prof.id || U.uid('prf');
    prof.updatedAt = +(p && p.updatedAt) || 0;
    prof.accounts = (Array.isArray(prof.accounts) ? prof.accounts : []).map((a) => ({
      id: a.id || U.uid('acc'),
      name: String(a.name || 'Conta'),
      bank: String(a.bank || ''),
      type: String(a.type || 'Conta corrente'),
      color: migrateColor(a.color || '#A68B6B'),
      gradient: a.gradient ? String(a.gradient) : null,          // null = deduzido da cor
      last4: String(a.last4 || '').replace(/\D/g, '').slice(-4), // identificação na tela, nada além disso
      openingBalance: U.round2(+a.openingBalance || 0),
      openedAt: U.isValidISO(a.openedAt) ? a.openedAt : U.todayISO(),
      archived: !!a.archived
    }));
    prof.cards = (Array.isArray(prof.cards) ? prof.cards : []).map((c) => ({
      id: c.id || U.uid('card'),
      name: String(c.name || 'Cartão'),
      bank: String(c.bank || ''),
      color: migrateColor(c.color || '#7C6CF0'),
      gradient: c.gradient ? String(c.gradient) : null,          // null = deduzido
      last4: String(c.last4 || '').replace(/\D/g, '').slice(-4), // só os 4 últimos
      limit: U.round2(+c.limit || 0),
      closingDay: Math.min(31, Math.max(1, +c.closingDay || 1)),
      dueDay: Math.min(31, Math.max(1, +c.dueDay || 10)),
      accountId: c.accountId || null
    }));
    prof.categories = (Array.isArray(prof.categories) && prof.categories.length ? prof.categories : makeCategories())
      .map((c) => ({
        id: c.id || U.uid('cat'),
        name: String(c.name || 'Categoria'),
        kind: c.kind === 'income' ? 'income' : 'expense',
        color: migrateColor(c.color || '#9AA0AC'),
        icon: c.icon ? String(c.icon) : null   // null = deduzido pelo nome
      }));
    prof.transactions = (Array.isArray(prof.transactions) ? prof.transactions : []).map(Store.normalizeTx);
    prof.investments = (Array.isArray(prof.investments) ? prof.investments : []).map((i) => ({
      id: i.id || U.uid('inv'),
      name: String(i.name || 'Investimento'),
      type: String(i.type || 'Renda fixa'),
      amount: U.round2(+i.amount || 0),
      date: U.isValidISO(i.date) ? i.date : U.todayISO(),
      rate: +i.rate || 0,
      currentValue: i.currentValue === '' || i.currentValue == null ? null : U.round2(+i.currentValue),
      accountId: i.accountId || null,
      notes: String(i.notes || '')
    }));
    prof.invoices = (prof.invoices && typeof prof.invoices === 'object') ? prof.invoices : {};

    /* Orçamento: um limite mensal por categoria. Guardado como mapa
       porque a pergunta é sempre "qual o limite DESTA categoria". */
    const orc = (prof.budgets && typeof prof.budgets === 'object') ? prof.budgets : {};
    prof.budgets = {};
    Object.keys(orc).forEach((k) => {
      const v = U.round2(+orc[k] || 0);
      if (v > 0) prof.budgets[k] = v;      // limite zero é o mesmo que não ter limite
    });

    prof.goals = (Array.isArray(prof.goals) ? prof.goals : []).map((g) => ({
      id: g.id || U.uid('goal'),
      name: String(g.name || 'Meta').slice(0, 60),
      target: U.round2(+g.target || 0),
      saved: U.round2(+g.saved || 0),
      deadline: U.isValidISO(g.deadline) ? g.deadline : null,
      color: migrateColor(g.color || '#2E6E7E'),
      icon: g.icon ? String(g.icon) : 'target',
      accountId: g.accountId || null,
      createdAt: g.createdAt || U.todayISO()
    }));
    return prof;
  }

  function normalizeState(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.profiles) || !raw.profiles.length) {
      return makeInitialState();
    }
    const st = {
      version: VERSION,
      theme: raw.theme === 'dark' ? 'dark' : 'light',
      ownerName: String(raw.ownerName || '').trim().slice(0, 40),
      profiles: raw.profiles.map(normalizeProfile),
      activeProfileId: raw.activeProfileId
    };
    if (!st.profiles.some((p) => p.id === st.activeProfileId)) st.activeProfileId = st.profiles[0].id;
    return st;
  }

  /* ---------------- persistência ---------------- */

  /** Alguns navegadores bloqueiam localStorage (janela anônima, política). */
  Store.storageOK = (function () {
    try {
      localStorage.setItem('financas.probe', '1');
      localStorage.removeItem('financas.probe');
      return true;
    } catch (e) { return false; }
  })();

  Store.load = function () {
    let raw = null;
    try {
      const txt = localStorage.getItem(KEY);
      if (txt) raw = JSON.parse(txt);
    } catch (e) {
      console.warn('Não foi possível ler o localStorage:', e);
    }
    state = normalizeState(raw);
    return state;
  };

  let warnedOnce = false;
  Store.save = function () {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.error('Falha ao salvar:', e);
      Store.storageOK = false;
      if (!warnedOnce && global.UI && UI.toast) {
        warnedOnce = true;
        UI.toast('Não foi possível salvar neste navegador (armazenamento cheio ou bloqueado). Use "↓ Backup" para não perder o trabalho.', 'error', 9000);
      }
      return false;
    }
  };

  Store.state = () => state;
  Store.profile = () => state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];
  Store.normalizeProfile = normalizeProfile;   // usado pela sincronização

  /** notifica quem estiver ouvindo (o app redesenha a página ativa) */
  Store.onChange = (fn) => { listeners.push(fn); };
  Store.commit = function (reason) {
    // carimbo de última alteração — a sincronização decide conflitos por ele.
    // 'theme' é preferência do aparelho; 'sync-apply' vem do remoto (o carimbo
    // remoto já foi aplicado e re-carimbar criaria loop de push).
    if (reason !== 'theme' && reason !== 'owner' && reason !== 'sync-apply') {
      const now = Date.now();
      if (reason === 'import' || reason === 'reset' || reason === 'seed') {
        state.profiles.forEach((p) => { p.updatedAt = now; });
      } else {
        const p = Store.profile();
        if (p) p.updatedAt = now;
      }
    }
    Store.save();
    listeners.forEach((fn) => { try { fn(reason); } catch (e) { console.error(e); } });
  };

  /* ---------------- dono do painel ---------------- */

  /** Nome da saudação. Vazio = "visitante". Não é dado financeiro: sincroniza junto. */
  Store.ownerName = () => (state && state.ownerName) || '';
  Store.setOwnerName = function (nome) {
    state.ownerName = String(nome || '').trim().slice(0, 40);
    Store.commit('owner');
  };
  /** Só preenche se ainda estiver vazio — a escolha manual sempre vence. */
  Store.suggestOwnerName = function (nome) {
    const n = String(nome || '').trim().split(/\s+/)[0] || '';
    if (n && !state.ownerName) { state.ownerName = n.slice(0, 40); Store.commit('owner'); }
  };

  /* ---------------- perfis ---------------- */

  Store.setActiveProfile = function (id) {
    if (state.profiles.some((p) => p.id === id)) {
      state.activeProfileId = id;
      Store.commit('profile');
    }
  };
  Store.addProfile = function (name) {
    const p = makeProfile(name);
    state.profiles.push(p);
    state.activeProfileId = p.id;
    Store.commit('profile');
    return p;
  };
  Store.renameProfile = function (id, name) {
    const p = state.profiles.find((x) => x.id === id);
    if (p) { p.name = String(name || p.name).trim() || p.name; Store.commit('profile'); }
  };
  Store.deleteProfile = function (id) {
    if (state.profiles.length <= 1) return false;
    state.profiles = state.profiles.filter((p) => p.id !== id);
    if (state.activeProfileId === id) state.activeProfileId = state.profiles[0].id;
    Store.commit('profile');
    return true;
  };

  Store.setTheme = function (theme) {
    state.theme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', state.theme);
    Store.commit('theme');
  };

  /* ---------------- CRUD genérico ---------------- */

  function collection(name) {
    return {
      list: () => Store.profile()[name],
      get: (id) => Store.profile()[name].find((x) => x.id === id) || null,
      add(obj) {
        const item = Object.assign({ id: U.uid(name.slice(0, 3)) }, obj);
        Store.profile()[name].push(item);
        Store.commit(name);
        return item;
      },
      update(id, patch) {
        const item = this.get(id);
        if (!item) return null;
        Object.assign(item, patch);
        Store.commit(name);
        return item;
      },
      remove(id) {
        const p = Store.profile();
        p[name] = p[name].filter((x) => x.id !== id);
        Store.commit(name);
      }
    };
  }

  Store.accounts = collection('accounts');
  Store.cards = collection('cards');
  Store.categories = collection('categories');
  Store.investments = collection('investments');

  /* ---------------- transações ---------------- */

  Store.transactions = {
    list: () => Store.profile().transactions,
    get: (id) => Store.profile().transactions.find((t) => t.id === id) || null,
    add(tx, silent) {
      const t = Store.normalizeTx(tx);
      Store.profile().transactions.push(t);
      if (!silent) Store.commit('transactions');
      return t;
    },
    addMany(list) {
      const p = Store.profile();
      const added = list.map((tx) => { const t = Store.normalizeTx(tx); p.transactions.push(t); return t; });
      Store.commit('transactions');
      return added;
    },
    update(id, patch) {
      const p = Store.profile();
      const i = p.transactions.findIndex((t) => t.id === id);
      if (i < 0) return null;
      p.transactions[i] = Store.normalizeTx(Object.assign({}, p.transactions[i], patch));
      Store.commit('transactions');
      return p.transactions[i];
    },
    remove(id) {
      const p = Store.profile();
      const tx = p.transactions.find((t) => t.id === id);
      p.transactions = p.transactions.filter((t) => t.id !== id);
      // parcelas do mesmo grupo são removidas juntas
      if (tx && tx.installment && tx.installment.groupId) {
        p.transactions = p.transactions.filter(
          (t) => !(t.installment && t.installment.groupId === tx.installment.groupId));
      }
      Store.commit('transactions');
    },
    /** Marca/desmarca a confirmação de uma ocorrência (mês específico p/ fixas) */
    setConfirmed(txId, ym, value) {
      const tx = Store.transactions.get(txId);
      if (!tx) return;
      if (tx.recurring) {
        tx.occ[ym] = Object.assign({}, tx.occ[ym], { confirmed: !!value });
      } else {
        tx.confirmed = !!value;
      }
      Store.commit('transactions');
    },
    /** Remove uma ocorrência específica de um lançamento fixo */
    skipOccurrence(txId, ym) {
      const tx = Store.transactions.get(txId);
      if (!tx || !tx.recurring) return;
      tx.occ[ym] = Object.assign({}, tx.occ[ym], { skipped: true });
      Store.commit('transactions');
    }
  };

  /* ---------------- faturas ---------------- */

  Store.invoiceKey = (cardId, ref) => cardId + '|' + ref;

  Store.getInvoice = function (cardId, ref) {
    return Store.profile().invoices[Store.invoiceKey(cardId, ref)] || null;
  };
  /* ---------------- orçamento ---------------- */

  Store.budgets = {
    all: () => Store.profile().budgets,
    get: (categoryId) => Store.profile().budgets[categoryId] || 0,
    set: function (categoryId, limite) {
      const b = Store.profile().budgets;
      const v = U.round2(+limite || 0);
      if (v > 0) b[categoryId] = v; else delete b[categoryId];
      Store.commit('budget');
    },
    remove: function (categoryId) {
      delete Store.profile().budgets[categoryId];
      Store.commit('budget');
    }
  };

  /* ---------------- metas ---------------- */

  Store.goals = {
    all: () => Store.profile().goals,
    get: (id) => Store.profile().goals.find((g) => g.id === id) || null,
    add: function (data) {
      const g = Object.assign({ id: U.uid('goal'), createdAt: U.todayISO() }, data);
      Store.profile().goals.push(g);
      Store.commit('goal');
      return g;
    },
    update: function (id, data) {
      const g = Store.goals.get(id);
      if (!g) return null;
      Object.assign(g, data);
      Store.commit('goal');
      return g;
    },
    remove: function (id) {
      const gs = Store.profile().goals;
      const i = gs.findIndex((g) => g.id === id);
      if (i >= 0) { gs.splice(i, 1); Store.commit('goal'); }
    },
    /** Guardar dinheiro numa meta não é despesa: é dinheiro mudando de lugar. */
    deposit: function (id, valor) {
      const g = Store.goals.get(id);
      if (!g) return null;
      g.saved = U.round2(Math.max(0, g.saved + U.round2(+valor || 0)));
      Store.commit('goal');
      return g;
    }
  };

  Store.setInvoicePaid = function (cardId, ref, paid, opts) {
    const p = Store.profile();
    const key = Store.invoiceKey(cardId, ref);
    if (paid) {
      p.invoices[key] = {
        paid: true,
        paidAt: (opts && opts.paidAt) || U.todayISO(),
        accountId: (opts && opts.accountId) || null,
        amount: U.round2((opts && opts.amount) || 0)
      };
    } else {
      delete p.invoices[key];
    }
    Store.commit('invoices');
  };

  /* ---------------- backup ---------------- */

  Store.exportJSON = function () {
    return JSON.stringify({
      app: 'minhas-financas', version: VERSION,
      exportedAt: new Date().toISOString(),
      data: state
    }, null, 2);
  };

  Store.importJSON = function (text) {
    const parsed = JSON.parse(text);
    const raw = parsed && parsed.data ? parsed.data : parsed;
    // Sem esta checagem, um arquivo qualquer viraria "estado inicial" e
    // apagaria os dados do usuário em silêncio.
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.profiles) || !raw.profiles.length) {
      throw new Error('não parece um backup deste app (nenhum perfil encontrado).');
    }
    const next = normalizeState(raw);
    if (!next.profiles.length) throw new Error('Arquivo sem perfis válidos.');
    state = next;
    document.documentElement.setAttribute('data-theme', state.theme);
    Store.commit('import');
    return state;
  };

  Store.resetAll = function () {
    state = makeInitialState();
    Store.commit('reset');
  };

  /* ---------------- dados de exemplo ---------------- */

  Store.seedDemo = function () {
    const p = Store.profile();
    const catE = (n) => (p.categories.find((c) => c.kind === 'expense' && c.name === n) || {}).id || null;
    const catI = (n) => (p.categories.find((c) => c.kind === 'income' && c.name === n) || {}).id || null;

    // as contas "nascem" no início da janela histórica que vamos popular
    const openedAt = U.addMonths(U.todayYM(), -11) + '-01';

    let acc = p.accounts[0];
    if (!acc) {
      acc = Store.accounts.add({
        name: 'Conta corrente', bank: 'Itaú', type: 'Conta corrente', color: '#9A5F35',
        gradient: 'terracotta', last4: '2210',
        openingBalance: 3500, openedAt, archived: false
      });
    } else {
      if (!acc.openingBalance) acc.openingBalance = 3500;
      acc.openedAt = openedAt;
    }
    const acc2 = Store.accounts.add({
      name: 'Reserva', bank: 'Nubank', type: 'Conta de pagamento', color: '#7B5A8E',
      gradient: 'midnight', last4: '9034',
      openingBalance: 22000, openedAt, archived: false
    });
    const card = Store.cards.add({
      name: 'Cartão principal', bank: 'Nubank', color: '#7B5A8E', gradient: 'midnight', last4: '4352',
      limit: 8000, closingDay: 28, dueDay: 8, accountId: acc.id
    });
    Store.cards.add({
      name: 'Cartão da viagem', bank: 'Itaú', color: '#9A5F35', gradient: 'terracotta', last4: '8871',
      limit: 4000, closingDay: 15, dueDay: 25, accountId: acc.id
    });

    const today = U.todayISO();
    const ym = U.todayYM();
    const start = U.addMonths(ym, -11) + '-01';
    const d = (offsetMonths, day) => {
      const q = U.ymParts(U.addMonths(ym, offsetMonths));
      return U.isoOf(q.y, q.m, U.clampDay(q.y, q.m, day));
    };

    const txs = [
      { kind: 'income', description: 'Salário', amount: 7800, date: start, categoryId: catI('Salário'), accountId: acc.id, recurring: true, confirmed: true },
      { kind: 'expense', description: 'Aluguel', amount: 2200, date: start, categoryId: catE('Moradia'), accountId: acc.id, recurring: true, confirmed: true },
      { kind: 'expense', description: 'Internet + celular', amount: 189.9, date: U.addMonths(ym, -11) + '-10', categoryId: catE('Assinaturas'), accountId: acc.id, recurring: true, confirmed: true },
      { kind: 'expense', description: 'Plano de saúde', amount: 640, date: U.addMonths(ym, -11) + '-15', categoryId: catE('Saúde'), accountId: acc.id, recurring: true, confirmed: true },
      { kind: 'expense', description: 'Academia', amount: 129, date: U.addMonths(ym, -11) + '-05', categoryId: catE('Lazer'), accountId: acc.id, recurring: true, confirmed: true }
    ];
    // variáveis dos últimos 6 meses
    const varSpecs = [
      ['Supermercado', 'Alimentação', 620, 980, 'account'],
      ['Combustível', 'Transporte', 180, 420, 'card'],
      ['Restaurante', 'Alimentação', 90, 260, 'card'],
      ['Farmácia', 'Saúde', 40, 190, 'card'],
      ['Streaming', 'Assinaturas', 39.9, 59.9, 'card'],
      ['Compras online', 'Compras', 120, 700, 'card']
    ];
    for (let k = -5; k <= 0; k++) {
      varSpecs.forEach((s, idx) => {
        const amount = U.round2(s[2] + Math.random() * (s[3] - s[2]));
        txs.push({
          kind: 'expense', description: s[0], amount, date: d(k, 3 + idx * 4),
          categoryId: catE(s[1]), accountId: s[4] === 'card' ? null : acc.id,
          cardId: s[4] === 'card' ? card.id : null,
          confirmed: k < 0 ? true : Math.random() > 0.35
        });
      });
      if (k % 2 === 0) {
        txs.push({
          kind: 'income', description: 'Projeto freelance', amount: U.round2(900 + Math.random() * 2400),
          date: d(k, 18), categoryId: catI('Freelance / PJ'), accountId: acc.id, confirmed: k < 0
        });
      }
    }
    // dois lançamentos previstos no mês corrente
    txs.push({ kind: 'expense', description: 'IPTU (parcela)', amount: 312.4, date: d(0, 20), categoryId: catE('Impostos e taxas'), accountId: acc.id, confirmed: false });
    txs.push({ kind: 'income', description: 'Reembolso viagem', amount: 480, date: d(0, 25), categoryId: catI('Reembolso'), accountId: acc.id, confirmed: false });
    txs.push({ kind: 'transfer', description: 'Aporte na reserva', amount: 1000, date: d(0, 6), accountId: acc.id, toAccountId: acc2.id, confirmed: true });

    Store.profile().transactions = Store.profile().transactions.concat(txs.map(Store.normalizeTx));

    [['Tesouro Selic 2029', 'Tesouro Direto', 6000, -10, 11.5],
     ['CDB 110% CDI', 'CDB', 4500, -7, 12.2],
     ['ETF IVVB11', 'ETF', 3200, -5, 14],
     ['Bitcoin', 'Criptomoeda', 1500, -3, 20]].forEach((iv) => {
      const q = U.ymParts(U.addMonths(ym, iv[3]));
      Store.profile().investments.push({
        id: U.uid('inv'), name: iv[0], type: iv[1], amount: iv[2],
        date: U.isoOf(q.y, q.m, 10), rate: iv[4], currentValue: null, accountId: acc2.id, notes: ''
      });
    });

    // fatura do mês anterior já paga
    const prevRef = U.addMonths(ym, -1);
    Store.profile().invoices[Store.invoiceKey(card.id, prevRef)] = {
      paid: true, paidAt: U.monthStart(prevRef), accountId: acc.id, amount: 0
    };

    /* Orçamento e metas de exemplo. Sem eles as páginas nasceriam
       vazias na demonstração e o recurso pareceria não existir.
       Os limites saem do gasto médio real que acabamos de criar,
       um pouco apertados de propósito — orçamento folgado não
       ensina nada. */
    const mediaDe = (catId) => {
      let soma = 0, meses = 0;
      for (let i = 1; i <= 3; i++) {
        const ym = U.addMonths(U.todayYM(), -i);
        const de = U.monthStart(ym), ate = U.monthEnd(ym);
        soma += p.transactions
          .filter((t) => t.categoryId === catId && t.kind === 'expense' && t.date >= de && t.date <= ate)
          .reduce((a, b) => a + b.amount, 0);
        meses++;
      }
      return meses ? U.round2(soma / meses) : 0;
    };
    ['Moradia', 'Alimentação', 'Transporte', 'Lazer'].forEach((nome) => {
      const id = catE(nome);
      if (!id) return;
      const m = mediaDe(id);
      if (m > 0) p.budgets[id] = U.round2(Math.ceil((m * 0.95) / 10) * 10);
    });

    if (!p.goals.length) {
      const hoje = new Date();
      const emMeses = (n) => U.toISO(new Date(hoje.getFullYear(), hoje.getMonth() + n, 15));
      p.goals.push(
        { id: U.uid('goal'), name: 'Reserva de emergência', target: 30000, saved: 12400,
          deadline: emMeses(12), color: '#3B6558', icon: 'shield', accountId: null, createdAt: U.todayISO() },
        { id: U.uid('goal'), name: 'Viagem', target: 12000, saved: 4200,
          deadline: emMeses(8), color: '#B07C3E', icon: 'plane', accountId: null, createdAt: U.todayISO() },
        { id: U.uid('goal'), name: 'Troca do notebook', target: 8000, saved: 8000,
          deadline: null, color: '#34557A', icon: 'target', accountId: null, createdAt: U.todayISO() }
      );
    }

    Store.commit('seed');
    return today;
  };

  global.Store = Store;
})(window);
