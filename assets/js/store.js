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

  /* O que o app cria sozinho — categorias prontas, o espaço "Pessoal" —
     nasce na língua de quem está começando. Depois de criado é dado da
     pessoa: fica como está, mesmo se ela trocar a língua da tela. */
  const tr = (texto) => (global.I18n ? global.I18n.t(texto) : texto);

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
  /* extras do seletor — mesma família, outros passos.
     A segunda linha entrou em 16/09/2026: com dez contas, dez
     cartões e vinte categorias, dezesseis cores obrigavam a
     repetir, e duas coisas da mesma cor na mesma tela é o mesmo
     que nenhuma cor. Os doze novos abrem matizes que faltavam —
     vinho, jade, oliva, ferrugem, orquídea — sem clarear a
     família: todos passam 4,5:1 com texto branco por cima. */
  const PALETTE_EXTRA = ['#34557A', '#8A5A38', '#4C6B33', '#6E4E3D', '#0F2C3D', '#2D4F56',
    '#547A6E', '#8A7A62', '#4E3A55', '#9A5F35',
    '#7A3B45', '#1E5E52', '#23324F', '#8C4A2F', '#6B6B3A', '#32363A',
    '#17656B', '#5A4432', '#8E4A6B', '#3E6E8E', '#7A5A2E', '#1F4A5C'];
  const ALL_COLORS = PALETTE.concat(PALETTE_EXTRA);

  /* O nome existe para o leitor de tela e para a dica do seletor:
     "Cor #7A3B45" não é um rótulo, é um número de série. */
  const COLOR_NAMES = {
    '#2E6E7E': 'Petróleo', '#A85A32': 'Terracota', '#3B6558': 'Oásis', '#7B5A8E': 'Ameixa',
    '#1F6B4F': 'Pinho', '#B07C3E': 'Âmbar', '#34557A': 'Índigo', '#8A5A38': 'Couro',
    '#4C6B33': 'Musgo', '#6E4E3D': 'Terra', '#0F2C3D': 'Midnight', '#2D4F56': 'Maré',
    '#547A6E': 'Eucalipto', '#8A7A62': 'Areia', '#4E3A55': 'Uva', '#9A5F35': 'Cobre',
    '#7A3B45': 'Vinho', '#1E5E52': 'Jade', '#23324F': 'Azul-noite', '#8C4A2F': 'Ferrugem',
    '#6B6B3A': 'Oliva', '#32363A': 'Carvão', '#17656B': 'Lagoa', '#5A4432': 'Café',
    '#8E4A6B': 'Orquídea', '#3E6E8E': 'Céu profundo', '#7A5A2E': 'Bronze', '#1F4A5C': 'Abissal'
  };

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

  /* Moedas dos cartões internacionais, na ordem em que aparecem
     para quem mora no Brasil e viaja ou tem conta fora. */
  const MOEDAS = [
    { code: 'USD', nome: 'Dólar americano' }, { code: 'EUR', nome: 'Euro' },
    { code: 'GBP', nome: 'Libra esterlina' }, { code: 'CAD', nome: 'Dólar canadense' },
    { code: 'AUD', nome: 'Dólar australiano' }, { code: 'CHF', nome: 'Franco suíço' },
    { code: 'JPY', nome: 'Iene' }, { code: 'ARS', nome: 'Peso argentino' },
    { code: 'CLP', nome: 'Peso chileno' }, { code: 'UYU', nome: 'Peso uruguaio' },
    { code: 'MXN', nome: 'Peso mexicano' }, { code: 'CNY', nome: 'Yuan' }
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

  /* Nomes das categorias que já vêm no app. O limite de
     "categorias personalizadas" do plano não conta estas — cobrar
     pelo padrão do produto seria cobrar por nada. */
  const NOMES_PADRAO_PT = DEFAULT_EXPENSE_CATS.map((c) => c[0])
    .concat(DEFAULT_INCOME_CATS.map((c) => c[0]));
  /* na língua em que um espaço novo nasceria agora; em português é a
     mesma lista de sempre. As duas existem porque um espaço criado em
     português continua com esses nomes se a tela mudar de língua. */
  const NOMES_PADRAO = NOMES_PADRAO_PT.map(tr);

  const Store = {
    PALETTE, ALL_COLORS, COLOR_NAMES, BANK_PRESETS, ACCOUNT_TYPES, INVESTMENT_TYPES, MOEDAS,
    CATEGORIAS_PADRAO: NOMES_PADRAO,
    CATEGORIAS_PADRAO_PT: NOMES_PADRAO_PT
  };

  /** Nome da cor para rótulo e dica; o hex é o fallback honesto. */
  Store.colorName = (hex) => COLOR_NAMES[String(hex || '').toUpperCase()] || String(hex || '');

  let state = null;
  let revisao = 0;
  const listeners = [];

  /* ---------------- fábricas ---------------- */

  function makeCategories() {
    const out = [];
    DEFAULT_EXPENSE_CATS.forEach(([name, color, icon]) =>
      out.push({ id: U.uid('cat'), name: tr(name), kind: 'expense', color, icon }));
    DEFAULT_INCOME_CATS.forEach(([name, color, icon]) =>
      out.push({ id: U.uid('cat'), name: tr(name), kind: 'income', color, icon }));
    return out;
  }

  function makeProfile(name) {
    return {
      id: U.uid('prf'),
      name: name || tr('Pessoal'),
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
    const pessoal = makeProfile(tr('Pessoal'));
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
      profiles: [pessoal, pj],
      removidos: {}
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
    /* Lançamento em outra moeda: `amount` continua em REAIS (é ele
       que todos os totais somam), e o valor original fica ao lado para
       a fatura e o extrato mostrarem o que foi cobrado de verdade.
       Nasceu para a compra em cartão internacional e em 20/09/2026
       passou a valer também para o movimento de uma conta em outra
       moeda — quem tem conta fora costuma ter só ela, e o extrato
       precisa falar na moeda em que o dinheiro se move. */
    t.moeda = /^[A-Z]{3}$/.test(t.moeda || '') && t.moeda !== 'BRL' ? t.moeda : null;
    t.valorMoeda = t.moeda && Number.isFinite(+t.valorMoeda) ? U.round2(Math.abs(+t.valorMoeda)) : null;
    if (!t.valorMoeda) t.moeda = null;
    t.source = t.source || 'manual';
    t.createdAt = t.createdAt || new Date().toISOString();
    return t;
  };

  /* =============================================================
     FATURAS — de "paga/não paga" para quanto já saiu
     -------------------------------------------------------------
     O registro antigo tinha um booleano e um valor: ou a fatura
     estava paga, ou não estava. Quem paga metade agora e o resto
     na semana seguinte — ou adianta uma compra específica antes de
     a fatura fechar — não tinha onde registrar isso, e acabava
     marcando como paga uma fatura que ainda devia.

     Agora o registro guarda MOVIMENTOS:
       pagamentos    [{ at, amount, accountId }]   a fatura inteira
       adiantamentos { chave: { at, amount, accountId } }  uma compra
       quitada       a pessoa declarou encerrada, mesmo faltando

     A chave do adiantamento é a da ocorrência (id, ou id#AAAA-MM
     quando é um lançamento fixo), porque uma assinatura no cartão
     pode ser adiantada num mês e não no outro.

     O formato antigo continua sendo lido: um registro com `paid`
     vira um pagamento único com o mesmo valor, data e conta. Nada
     que já estava salvo se perde.
     ============================================================= */
  function normalizeMovimento(m) {
    const valor = U.round2(+((m && m.amount)) || 0);
    if (!(valor > 0)) return null;
    return {
      at: (m && U.isValidISO(m.at)) ? m.at : U.todayISO(),
      amount: valor,
      accountId: (m && m.accountId) || null
    };
  }

  function normalizeInvoices(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    Object.keys(raw).forEach((k) => {
      const r = raw[k];
      if (!r || typeof r !== 'object') return;

      let pagamentos = (Array.isArray(r.pagamentos) ? r.pagamentos : [])
        .map(normalizeMovimento).filter(Boolean);

      /* legado: { paid, paidAt, amount, accountId } */
      if (!pagamentos.length && r.paid) {
        const antigo = normalizeMovimento({ at: r.paidAt, amount: r.amount, accountId: r.accountId });
        if (antigo) pagamentos = [antigo];
      }

      const adiantamentos = {};
      const adi = (r.adiantamentos && typeof r.adiantamentos === 'object') ? r.adiantamentos : {};
      Object.keys(adi).forEach((chave) => {
        const m = normalizeMovimento(adi[chave]);
        if (m) adiantamentos[chave] = m;
      });

      const quitada = r.quitada !== undefined ? !!r.quitada : !!r.paid;
      if (!pagamentos.length && !Object.keys(adiantamentos).length && !quitada) return;

      pagamentos.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
      out[k] = { pagamentos, adiantamentos, quitada };
    });
    return out;
  }

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
      archived: !!a.archived,
      /* Fora dos totais: a conta continua existindo, com extrato e
         saldo, mas o que passa por ela não entra nas receitas e
         despesas do mês. É para a conta da empresa, a conta de
         terceiros, a poupança do filho — dinheiro que aparece no
         banco e não é seu para gastar. Ausente = considerada, que
         é o que todo dado antigo significa. */
      considerado: a.considerado !== false,
      /* Conta em outra moeda — quem mora fora, quem recebe de fora,
         quem tem Wise ou Nomad. O saldo inicial e o extrato são na
         moeda dela (como o limite do cartão internacional é na moeda
         do cartão), e a cotação converte para os totais do app, que
         são em real. Ausente = real, que é o que toda conta antiga é. */
      moeda: /^[A-Z]{3}$/.test(a.moeda || '') ? a.moeda : 'BRL',
      cotacao: +a.cotacao > 0 ? Math.round(+a.cotacao * 10000) / 10000 : null
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
      accountId: c.accountId || null,
      /* Cartão internacional: limite e fatura na moeda dele, e a
         cotação (reais por 1 unidade) que converte as compras novas
         para os totais. Ausente = real, que é o que todo cartão antigo
         é. */
      moeda: /^[A-Z]{3}$/.test(c.moeda || '') ? c.moeda : 'BRL',
      cotacao: +c.cotacao > 0 ? Math.round(+c.cotacao * 10000) / 10000 : null,
      /* Mesmo interruptor do débito: a fatura continua inteira, com
         limite e vencimento, mas as compras dele ficam fora das
         despesas do mês. */
      considerado: c.considerado !== false
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
    prof.invoices = normalizeInvoices(prof.invoices);

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
      /* A categoria da meta é DESCRITIVA ("Viagem", "Educação"):
         serve para agrupar e para o UGLEZ falar delas por nome. Ela
         não move dinheiro — guardar numa meta não é despesa. */
      categoryId: g.categoryId || null,
      /* Contribuição planejada: quanto e em que dia do mês. É um
         PLANO, não um lançamento. Virar lançamento automático faria
         o saldo do mês afundar por dinheiro que apenas mudou de
         nome, que é o erro que o cabeçalho de pages/goals.js
         descreve. O app usa isto para dizer se o ritmo alcança o
         prazo — e é a pessoa que confirma cada aporte. */
      contribution: (g.contribution && +g.contribution.amount > 0)
        ? {
          amount: U.round2(+g.contribution.amount),
          day: Math.min(31, Math.max(1, parseInt(g.contribution.day, 10) || 1))
        }
        : null,
      /* De onde o dinheiro saiu, a cada aporte. Sem isto, "guardar
         numa meta" era um número que crescia sozinho: a reserva
         subia e nenhuma conta baixava, e ninguém sabia dizer de
         qual conta aquele dinheiro tinha vindo. Um aporte COM
         conta sai do saldo dela (Calc.accountBalance) e volta no
         patrimônio como reserva — o dinheiro mudou de lugar, não
         desapareceu. Sem conta, continua sendo só uma marcação. */
      deposits: (Array.isArray(g.deposits) ? g.deposits : []).map((d) => ({
        at: U.isValidISO(d && d.at) ? d.at : U.todayISO(),
        amount: U.round2(+(d && d.amount) || 0),
        accountId: (d && d.accountId) || null
      })).filter((d) => d.amount !== 0),
      createdAt: g.createdAt || U.todayISO()
    }));
    return prof;
  }

  function normalizarRemovidos(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    Object.keys(raw).forEach((id) => {
      const quando = +raw[id];
      if (id && Number.isFinite(quando) && quando > 0) out[id] = Math.floor(quando);
    });
    return out;
  }
  Store.normalizarRemovidos = normalizarRemovidos;

  function normalizeState(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.profiles) || !raw.profiles.length) {
      return makeInitialState();
    }
    const st = {
      version: VERSION,
      theme: raw.theme === 'dark' ? 'dark' : 'light',
      ownerName: String(raw.ownerName || '').trim().slice(0, 40),
      profiles: raw.profiles.map(normalizeProfile),
      activeProfileId: raw.activeProfileId,
      /* Espaços apagados, {id: quando}. É o que impede um espaço
         excluído neste aparelho de voltar pela cópia de outro — a
         sincronização mescla, e sem a lembrança da exclusão a mescla
         o traria de volta. */
      removidos: normalizarRemovidos(raw.removidos)
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
    revisao++;
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
        UI.toast('Não foi possível salvar neste navegador (armazenamento cheio ou bloqueado). Entre na sua conta para não perder o trabalho.', 'error', 9000);
      }
      return false;
    }
  };

  Store.state = () => state;
  Store.profile = () => state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];

  /* Contador de mudanças. Quem guarda cálculo derivado (o Calc)
     pergunta por ele em vez de recalcular: enquanto a revisão não
     muda, nenhum dado mudou, e a resposta guardada continua certa.
     É um número, não um evento — não dá para esquecer de ouvir. */
  Store.revisao = () => revisao;
  Store.normalizeProfile = normalizeProfile;   // usado pela sincronização

  /** notifica quem estiver ouvindo (o app redesenha a página ativa) */
  Store.onChange = (fn) => { listeners.push(fn); };
  Store.commit = function (reason) {
    // carimbo de última alteração — a sincronização decide conflitos por ele.
    // 'theme' é preferência do aparelho; 'sync-apply' vem do remoto (o carimbo
    // remoto já foi aplicado e re-carimbar criaria loop de push).
    if (!['theme', 'owner', 'sync-apply', 'active-profile', 'profile-list'].includes(reason)) {
      const now = Date.now();
      if (reason === 'import' || reason === 'reset' || reason === 'seed') {
        state.profiles.forEach((p) => { p.updatedAt = now; });
      } else {
        const p = Store.profile();
        if (p) p.updatedAt = now;
      }
    }
    revisao++;
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
      /* O espaço ativo é preferência deste aparelho. Carimbar o perfil ao
         apenas abri-lo faria uma cópia antiga parecer a edição mais nova. */
      Store.commit('active-profile');
    }
  };
  Store.addProfile = function (name) {
    const p = makeProfile(name);
    p.updatedAt = Date.now();
    state.profiles.push(p);
    state.activeProfileId = p.id;
    Store.commit('profile-list');
    return p;
  };
  Store.renameProfile = function (id, name) {
    const p = state.profiles.find((x) => x.id === id);
    if (p) {
      p.name = String(name || p.name).trim() || p.name;
      p.updatedAt = Date.now();
      Store.commit('profile-list');
    }
  };
  Store.deleteProfile = function (id) {
    if (state.profiles.length <= 1) return false;
    state.profiles = state.profiles.filter((p) => p.id !== id);
    state.removidos = state.removidos || {};
    state.removidos[id] = Date.now();
    if (state.activeProfileId === id) state.activeProfileId = state.profiles[0].id;
    Store.commit('profile-list');
    return true;
  };

  /**
   * Mantido por compatibilidade com chamadas antigas. A DECISÃO
   * mora em tema.js — inclusive a terceira opção ("seguir o
   * sistema"), que este atalho de dois valores não sabe expressar.
   * Quem constrói interface de tema fala com o Tema direto.
   */
  Store.setTheme = function (theme) {
    if (global.Tema && Tema.definir) { Tema.definir(theme === 'dark' ? 'dark' : 'light'); return; }
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
    /**
     * Guardar dinheiro numa meta não é despesa: é dinheiro mudando
     * de lugar. Com `opts.accountId`, o lugar de onde ele saiu fica
     * registrado — e o saldo daquela conta baixa de verdade.
     */
    deposit: function (id, valor, opts) {
      const g = Store.goals.get(id);
      if (!g) return null;
      const v = U.round2(+valor || 0);
      if (!v) return g;
      const anterior = g.saved;
      g.saved = U.round2(Math.max(0, g.saved + v));
      const efetivo = U.round2(g.saved - anterior);   // respeita o piso em zero
      if (efetivo) {
        if (!Array.isArray(g.deposits)) g.deposits = [];
        g.deposits.push({
          at: (opts && U.isValidISO(opts.at)) ? opts.at : U.todayISO(),
          amount: efetivo,
          accountId: (opts && opts.accountId) || null
        });
      }
      Store.commit('goal');
      return g;
    }
  };

  function registroDaFatura(cardId, ref) {
    const p = Store.profile();
    const key = Store.invoiceKey(cardId, ref);
    if (!p.invoices[key]) p.invoices[key] = { pagamentos: [], adiantamentos: {}, quitada: false };
    const r = p.invoices[key];
    if (!Array.isArray(r.pagamentos)) r.pagamentos = [];
    if (!r.adiantamentos || typeof r.adiantamentos !== 'object') r.adiantamentos = {};
    return r;
  }

  function limpaSeVazio(cardId, ref) {
    const p = Store.profile();
    const key = Store.invoiceKey(cardId, ref);
    const r = p.invoices[key];
    if (r && !r.pagamentos.length && !Object.keys(r.adiantamentos).length && !r.quitada) {
      delete p.invoices[key];
    }
  }

  /** Um pagamento da fatura. Vários somam; nenhum deles apaga o outro. */
  Store.payInvoice = function (cardId, ref, opts) {
    const r = registroDaFatura(cardId, ref);
    const m = normalizeMovimento({
      at: (opts && opts.paidAt) || U.todayISO(),
      amount: (opts && opts.amount) || 0,
      accountId: (opts && opts.accountId) || null
    });
    if (m) r.pagamentos.push(m);
    r.pagamentos.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    if (opts && opts.quitar !== undefined) r.quitada = !!opts.quitar;
    limpaSeVazio(cardId, ref);
    Store.commit('invoices');
  };

  /** Declara (ou desfaz) o encerramento da fatura, sem mexer nos valores. */
  Store.setInvoiceQuitada = function (cardId, ref, quitada) {
    const r = registroDaFatura(cardId, ref);
    r.quitada = !!quitada;
    limpaSeVazio(cardId, ref);
    Store.commit('invoices');
  };

  /** Adiantar UMA compra: a chave é a da ocorrência (id ou id#AAAA-MM). */
  Store.advanceInvoiceItem = function (cardId, ref, chave, opts) {
    const r = registroDaFatura(cardId, ref);
    const m = normalizeMovimento({
      at: (opts && opts.paidAt) || U.todayISO(),
      amount: (opts && opts.amount) || 0,
      accountId: (opts && opts.accountId) || null
    });
    if (m) r.adiantamentos[chave] = m; else delete r.adiantamentos[chave];
    limpaSeVazio(cardId, ref);
    Store.commit('invoices');
  };

  Store.removeInvoiceAdvance = function (cardId, ref, chave) {
    const p = Store.profile();
    const r = p.invoices[Store.invoiceKey(cardId, ref)];
    if (!r || !r.adiantamentos || !r.adiantamentos[chave]) return;
    delete r.adiantamentos[chave];
    limpaSeVazio(cardId, ref);
    Store.commit('invoices');
  };

  /** Apaga TODOS os movimentos da fatura — o "desfazer" da tela. */
  Store.clearInvoicePayments = function (cardId, ref) {
    delete Store.profile().invoices[Store.invoiceKey(cardId, ref)];
    Store.commit('invoices');
  };

  /* Compatibilidade: chamadas antigas continuam funcionando. */
  Store.setInvoicePaid = function (cardId, ref, paid, opts) {
    if (paid) Store.payInvoice(cardId, ref, Object.assign({ quitar: true }, opts || {}));
    else Store.clearInvoicePayments(cardId, ref);
  };

  /* ---------------- backup ---------------- */

  Store.exportJSON = function () {
    return JSON.stringify({
      app: 'minhas-financas', version: VERSION,
      exportedAt: new Date().toISOString(),
      data: state
    }, null, 2);
  };

  Store.resetAll = function () {
    state = makeInitialState();
    Store.commit('reset');
  };


  global.Store = Store;
})(window);
