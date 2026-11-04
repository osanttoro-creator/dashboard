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
  let remoteOnly = false;

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
  /* ------------------------------------------------------------
     CORES DAS CATEGORIAS
     ------------------------------------------------------------
     Os tons pedidos ficam agrupados por família no seletor. A cor
     antiga de uma categoria continua disponível como cor herdada.
     O contraste do ícone é escolhido para cada fundo, claro ou escuro.
     ------------------------------------------------------------ */
  /* PALETA 01/11/2026: 17 cores (primárias, secundárias, terciárias e
     adicionais) em 6 tons cada — muito claro, claro, pastel, médio, escuro
     e muito escuro — e Transparente (sem fundo). Vale para categorias,
     caixinhas e a cor personalizada de contas e cartões. A cor automática
     de uma categoria sai do tom médio. */
  const TONS_NOMES = ["muito claro","claro","pastel","médio","escuro","muito escuro"];
  const COLOR_FAMILIES = [
    { nome: 'Vermelho', tons: ['#FADBDB','#F0A8A8','#D69A9A','#D83131','#981F1F','#5A1616'] },
    { nome: 'Azul', tons: ['#DBE8FA','#A8C6F0','#9AB3D6','#3177D8','#1F5298','#16325A'] },
    { nome: 'Amarelo', tons: ['#FAF5DB','#F0E4A8','#D6CC9A','#D8BC31','#98841F','#5A4F16'] },
    { nome: 'Laranja', tons: ['#FAEADB','#F0CAA8','#D6B69A','#D87F31','#98581F','#5A3616'] },
    { nome: 'Verde', tons: ['#DBFADF','#A8F0B2','#9AD6A2','#31D848','#1F982F','#165A1F'] },
    { nome: 'Violeta', tons: ['#EDDBFA','#D2A8F0','#BD9AD6','#9231D8','#661F98','#3E165A'] },
    { nome: 'Vermelho-alaranjado', tons: ['#FAE1DB','#F0B7A8','#D6A69A','#D85331','#98371F','#5A2416'] },
    { nome: 'Amarelo-alaranjado', tons: ['#FAF0DB','#F0D8A8','#D6C29A','#D8A031','#98701F','#5A4316'] },
    { nome: 'Amarelo-esverdeado', tons: ['#F4FADB','#E1F0A8','#CAD69A','#B7D831','#80981F','#4C5A16'] },
    { nome: 'Azul-esverdeado', tons: ['#DBFAF9','#A8F0ED','#9AD6D4','#31D8D2','#1F9894','#165A58'] },
    { nome: 'Azul-arroxeado', tons: ['#DEDBFA','#AEA8F0','#9F9AD6','#3F31D8','#291F98','#1C165A'] },
    { nome: 'Vermelho-arroxeado', tons: ['#FADBEF','#F0A8D6','#D69AC0','#D8319B','#981F6C','#5A1641'] },
    { nome: 'Rosa', tons: ['#FADBE6','#F0A8C0','#D69AAE','#D83169','#981F48','#5A162D'] },
    { nome: 'Marrom', tons: ['#EDE0D4','#D4BBA5','#BAA08C','#966340','#683F27','#3D261A'] },
    { nome: 'Cinza', tons: ['#EEF0F1','#CDD1D5','#ACB3B9','#7B858E','#545C63','#34383D'] },
    { nome: 'Preto', tons: ['#424D57','#353D46','#272E34','#1D2126','#14171A','#0B0D0F'] },
    { nome: 'Branco', tons: ['#FFFFFF','#FBFAF8','#F8F6F2','#F4F1EB','#EFEAE1','#EAE3D7'] },
    { nome: 'Transparente', tons: ['#00000000'] }
  ];
  const PALETTE = COLOR_FAMILIES.filter((f) => f.tons.length === 6).map((f) => f.tons[3]);
  const PALETTE_EXTRA = COLOR_FAMILIES.flatMap((f) => f.tons).filter((c) => !PALETTE.includes(c));
  const ALL_COLORS = PALETTE.concat(PALETTE_EXTRA.filter((c) => c !== '#00000000'));

  /* ------------------------------------------------------------
     MEIOS DE PAGAMENTO
     ------------------------------------------------------------
     O que a conta OFERECE (account.meios) e o que foi usado no
     lançamento (tx.meio) são a mesma lista, por um motivo: se a
     conta não tem cartão virtual, oferecer "cartão virtual" no
     lançamento dela é oferecer uma mentira, e a pessoa vai marcar
     assim mesmo porque o campo estava lá.

     `oferecivel` separa o que uma conta escolhe ter do que todo
     mundo tem: dinheiro e boleto não dependem de a conta oferecer.
     ------------------------------------------------------------ */
  const MEIOS = [
    { id: 'pix', nome: 'Pix', icone: 'zap', oferecivel: true },
    { id: 'cartao_fisico', nome: 'Cartão físico', icone: 'credit-card', oferecivel: true },
    { id: 'cartao_virtual', nome: 'Cartão virtual', icone: 'smartphone', oferecivel: true },
    { id: 'transferencia', nome: 'Transferência', icone: 'arrow-left-right', oferecivel: true },
    { id: 'debito_automatico', nome: 'Débito automático', icone: 'repeat', oferecivel: true },
    { id: 'boleto', nome: 'Boleto', icone: 'receipt', oferecivel: false },
    { id: 'dinheiro', nome: 'Dinheiro', icone: 'banknote', oferecivel: false }
  ];
  const MEIOS_OFERECIVEIS = MEIOS.filter((m) => m.oferecivel);
  /* Mantido para compatibilidade com perfis antigos; a V3 libera todos os meios. */
  const MEIOS_PADRAO = ['pix', 'cartao_fisico', 'transferencia'];

  /** A escolha do meio acontece no lançamento, não no cadastro da conta. */
  function meiosDaConta(acc) {
    return MEIOS;
  }

  /* O nome existe para o leitor de tela e para a dica do seletor:
     "Cor #7A3B45" não é um rótulo, é um número de série. */
  const COLOR_NAMES = {
    '#E8BE35':'Amarelo','#F6D84B':'Amarelo Canário','#C7D93A':'Amarelo Limão',
    '#3777C7':'Azul','#79C8E8':'Azul Céu','#294BA5':'Azul Cobalto','#35B4BE':'Azul Turquesa',
    '#DB514C':'Vermelho','#952C38':'Vermelho Escuro','#A84583':'Vermelho Violeta','#BD344D':'Carmim','#823447':'Bordô','#60304B':'Vinho','#EDABBE':'Rosa Claro','#E85C9B':'Rosa Chiclete',
    '#4E9C60':'Verde','#95CC82':'Verde Claro','#285F45':'Verde Escuro','#75C7AD':'Verde Água','#5EAD56':'Verde Folha','#265946':'Verde Pinho','#36A798':'Verde Turquesa',
    '#E78B45':'Laranja','#F6AE78':'Laranja Claro','#AF572E':'Laranja Escuro','#B68FD1':'Lilás','#744BA5':'Violeta',
    '#80533D':'Marrom','#AF8061':'Marrom Claro','#4F342C':'Marrom Escuro','#A86B48':'Canela','#B88939':'Ocre',
    '#F5F2EA':'Branco','#111820':'Preto','#DCE4E7':'Cinza Gelo','#424D55':'Cinza Escuro',
    /* Cores antigas continuam nomeadas para dados já existentes. */
    '#3E7A6D': 'Teal', '#305A51': 'Teal profundo',
    '#3E647A': 'Mineral', '#304A5A': 'Mineral profundo',
    '#3E467A': 'Índigo', '#30365A': 'Índigo profundo',
    '#5A3E7A': 'Ameixa', '#43305A': 'Ameixa profundo',
    '#7A503E': 'Tangerina', '#5A3D30': 'Tangerina profundo',
    '#577A3E': 'Oliva', '#415A30': 'Oliva profundo',
    /* ---- nomes das cores antigas, para o que já está salvo ----
       Elas somem do seletor, mas não dos dados de ninguém: uma
       categoria pintada de Terracota continua Terracota, com nome e
       tudo, até a pessoa escolher outra. */
    '#2E6E7E': 'Petróleo', '#A85A32': 'Terracota', '#3B6558': 'Oásis', '#7B5A8E': 'Ameixa antiga',
    '#1F6B4F': 'Pinho', '#B07C3E': 'Âmbar', '#34557A': 'Índigo antigo', '#8A5A38': 'Couro',
    '#4C6B33': 'Musgo', '#6E4E3D': 'Terra', '#0F2C3D': 'Midnight', '#2D4F56': 'Maré',
    '#547A6E': 'Eucalipto', '#8A7A62': 'Areia', '#4E3A55': 'Uva', '#9A5F35': 'Cobre',
    '#7A3B45': 'Vinho', '#1E5E52': 'Jade', '#23324F': 'Azul-noite', '#8C4A2F': 'Ferrugem',
    '#6B6B3A': 'Oliva antiga', '#32363A': 'Carvão', '#17656B': 'Lagoa', '#5A4432': 'Café',
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

  /** Banco conhecido tem cor estável. "Outro" é a entrada para a
      escolha da pessoa e, por isso, nunca vira preset. */
  /* Cor da MARCA de cada instituição (01/11/2026): vem do pacote de bancos
     (e dos selos de sigla) e fica gravada na conta ou no cartão. A tabela
     antiga deste arquivo tinha tons da paleta, não a cor do banco. */
  function corDaMarca(nome) {
    try {
      const b = global.Icons && global.Icons.bankBrand ? global.Icons.bankBrand(nome) : null;
      if (b && /^#[0-9a-f]{6}$/i.test(b.bg)) return b.bg.toUpperCase() === '#FFFFFF' && /^#[0-9a-f]{6}$/i.test(b.fg) ? b.fg.toUpperCase() : b.bg.toUpperCase();
    } catch { /* sem pacote de bancos */ }
    return null;
  }
  function bankPreset(name) {
    const chave = U.norm(name || '');
    if (!chave || chave === 'outro') return null;
    return BANK_PRESETS.find((b) => U.norm(b.name) === chave) || null;
  }

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
  const INVESTMENT_TYPES = ['Porquinho', 'Renda fixa', 'Tesouro Direto', 'CDB', 'Fundo de investimento', 'Ações', 'FIIs', 'ETF', 'Criptomoeda', 'Previdência', 'Poupança', 'Outro'];

  /* mesmos hexes que a migração produz — perfil novo e migrado ficam iguais */
  /* 01/11/2026: as categorias padrão nascem com tons médios vivos da paleta
     nova. Os tons antigos (apagados) ficam em CORES_PADRAO_ANTIGAS só para
     reconhecer e trocar a cor de quem nunca escolheu outra. */
  const DEFAULT_EXPENSE_CATS = [
    ['Moradia', '#3177D8', 'house'], ['Alimentação', '#D87F31', 'utensils'], ['Transporte', '#2AB5B0', 'car'],
    ['Saúde', '#D83131', 'heart-pulse'], ['Educação', '#9231D8', 'graduation-cap'], ['Lazer', '#2FB344', 'gamepad-2'],
    ['Compras', '#D83169', 'shopping-bag'], ['Assinaturas', '#D8319B', 'repeat'], ['Impostos e taxas', '#966340', 'receipt'],
    ['Outros', '#7B858E', 'circle-ellipsis']
  ];
  const DEFAULT_INCOME_CATS = [
    ['Salário', '#2FB344', 'banknote'], ['Freelance / PJ', '#2AB5B0', 'briefcase'], ['Rendimentos', '#B7D831', 'trending-up'],
    ['Reembolso', '#D8A031', 'arrow-left-right'], ['Vendas', '#3F31D8', 'tag'], ['Outros', '#7B858E', 'circle-ellipsis']
  ];
  const CORES_PADRAO_ANTIGAS = {
    moradia: '#34557A', alimentacao: '#B07C3E', transporte: '#2E6E7E', saude: '#3B6558', educacao: '#7B5A8E', lazer: '#1F6B4F',
    compras: '#9A5F35', assinaturas: '#A85A32', 'impostos e taxas': '#4E3A55', outros: '#8A7A62',
    salario: '#34557A', 'freelance / pj': '#2E6E7E', rendimentos: '#1F6B4F', reembolso: '#B07C3E', vendas: '#7B5A8E'
  };
  function corPadraoNova(nome, kind, corAtual) {
    const chave = U.norm(nome || '');
    const antiga = CORES_PADRAO_ANTIGAS[chave];
    if (!antiga || String(corAtual || '').toUpperCase() !== antiga) return null;
    const lista = kind === 'income' ? DEFAULT_INCOME_CATS : DEFAULT_EXPENSE_CATS;
    const achada = lista.find((c) => U.norm(c[0]) === chave) || DEFAULT_EXPENSE_CATS.concat(DEFAULT_INCOME_CATS).find((c) => U.norm(c[0]) === chave);
    return achada ? achada[1] : null;
  }

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
    PALETTE, ALL_COLORS, COLOR_FAMILIES, COLOR_NAMES, BANK_PRESETS, ACCOUNT_TYPES, INVESTMENT_TYPES, MOEDAS,
    MEIOS, MEIOS_OFERECIVEIS, MEIOS_PADRAO, meiosDaConta,
    CATEGORIAS_PADRAO: NOMES_PADRAO,
    CATEGORIAS_PADRAO_PT: NOMES_PADRAO_PT
  };

  Store.bankPreset = bankPreset;
  Store.accountColor = (account) => {
    const preset = bankPreset(account && account.bank);
    return account && account.customColor ? migrateColor(account.color) : preset ? preset.color : migrateColor(account && account.color ? account.color : '#8A7A62');
  };

  /** Nome da cor para rótulo e dica; o hex é o fallback honesto. */
  COLOR_FAMILIES.forEach((f) => f.tons.forEach((c, i) => { COLOR_NAMES[c.toUpperCase()] = f.tons.length === 6 ? f.nome + ' ' + TONS_NOMES[i] : f.nome; }));
  Store.colorName = (hex) => COLOR_NAMES[String(hex || '').toUpperCase()] || String(hex || '');

  let state = null;
  let profileOverride = null;
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
      planningSalary: 0,  // referência manual; não cria receita no extrato
      planningReservePercent: 0, // percentual planejado; não movimenta dinheiro
      goals: [],          // { id, name, target, saved, deadline, color, icon }
      categories: makeCategories(),
      transactions: [],
      investments: [],
      invoices: {},
      automation: { categoryRules: [], merchantAliases: [], recurrenceDecisions: {} }
    };
  }

  function makeInitialState() {
    const pessoal = makeProfile(tr('Pessoal'));
    const pj = makeProfile('PJ / Autônomo');
    /* Até 21/09/2026 o espaço Pessoal nascia com uma "Conta corrente —
       Itaú" de saldo zero. Quem pulava o assistente e cadastrava o banco
       de verdade ficava com as duas, e o primeiro lançamento caía na
       fantasma (ela era a primeira da lista, logo a pré-selecionada) e a
       deixava no negativo — numa conta de um banco que a pessoa nem tem.
       O espaço PJ já nascia sem conta, então o app inteiro já sabia
       funcionar assim: o assistente cria a primeira, e o formulário de
       lançamento pede uma antes de lançar. */
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
    t.recurPausedFrom = t.recurring && /^\d{4}-\d{2}$/.test(t.recurPausedFrom || '') ? t.recurPausedFrom : null;
    t.confirmed = t.confirmed !== false;
    /* O terceiro estado. Não existe em dado antigo, e a ausência tem
       de significar "não cancelado" — nunca o contrário, senão uma
       migração mal lida sumiria com o mês inteiro de alguém. */
    t.cancelado = t.cancelado === true;
    t.ignored = t.kind === 'expense' && t.ignored === true;
    /* Lembrete visível no app; não implica notificação do sistema. */
    t.remindDaysBefore = [0, 1, 3, 7].includes(Number(t.remindDaysBefore))
      && t.remindDaysBefore !== null && t.remindDaysBefore !== ''
      ? Number(t.remindDaysBefore) : null;
    /* MEIO DE PAGAMENTO
       `method` continua dizendo de ONDE saiu (conta ou cartão de
       crédito), que é o que muda a contabilidade. `meio` diz COMO —
       pix, cartão físico, cartão virtual, dinheiro, boleto. São
       perguntas diferentes: um pix e um cartão de débito saem os dois
       da conta e pesam igual no saldo, mas quem procura "onde gastei
       no virtual" precisa dos dois separados. Vazio é legítimo: dado
       antigo não tem, e inventar um meio seria inventar um fato. */
    t.meio = MEIOS.some((m) => m.id === t.meio) ? t.meio : null;
    t.occ = (t.occ && typeof t.occ === 'object') ? t.occ : {};
    t.installment = t.installment && t.installment.total > 1
      ? { total: +t.installment.total, index: +t.installment.index || 1, groupId: t.installment.groupId || null }
      : null;
    /* A FATURA ESCOLHIDA À MÃO
       Por padrão a fatura de uma compra no crédito sai da DATA: o
       ciclo do cartão decide sozinho. Mas lançar hoje uma compra que
       pertence à fatura passada é coisa que se faz — o comprovante
       aparece depois, a cobrança veio adiantada, a pessoa esqueceu.
       Sem um campo próprio isso era impossível: a data mandava, e o
       seletor de fatura existia sem poder ser obedecido.

       Quando `faturaRef` existe, ela vence a data. Ausente, vale a
       regra de sempre — e é por isso que nenhum lançamento antigo
       muda de fatura ao atualizar.

       Só faz sentido em despesa no cartão e NÃO recorrente: numa
       recorrência cada ocorrência tem data própria, e uma referência
       única empurraria todas para a mesma fatura. */
    t.faturaRef = (t.method === 'card' && !t.recurring && /^\d{4}-\d{2}$/.test(t.faturaRef || ''))
      ? t.faturaRef : null;
    /* Tags (31/10/2026): ids das tags do perfil, no máximo 10. */
    t.tags = Array.isArray(t.tags) ? [...new Set(t.tags.filter((x) => typeof x === 'string' && /^[A-Za-z0-9_-]{1,60}$/.test(x)))].slice(0, 10) : [];
    t.notes = String(t.notes || '');
    /* Só o caminho privado fica no perfil; bytes do comprovante não entram no JSON. */
    t.receiptPath = typeof t.receiptPath === 'string' && t.receiptPath.length <= 260
      && /^[\w/-]+\.(?:jpg|png|webp|pdf)$/.test(t.receiptPath) && !t.receiptPath.includes('..')
      ? t.receiptPath : null;
    /* Local da compra (31/10/2026): opcional, escolhido pela pessoa no
       formulário. Só latitude e longitude arredondadas a 3 casas
       (~100 m) — nada de endereço, e nada é enviado à Coco. */
    t.local = (t.local && typeof t.local === 'object'
      && Number.isFinite(+t.local.lat) && Number.isFinite(+t.local.lng)
      && Math.abs(+t.local.lat) <= 90 && Math.abs(+t.local.lng) <= 180)
      ? { lat: Math.round(+t.local.lat * 1000) / 1000, lng: Math.round(+t.local.lng * 1000) / 1000 }
      : null;
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
    const merchant = global.Estabelecimento && Estabelecimento.normalizar
      ? Estabelecimento.normalizar(t.description) : null;
    t.merchantKey = String(t.merchantKey || (merchant && merchant.merchantKey) || '') || null;
    t.classification = t.classification && typeof t.classification === 'object'
      ? {
        source: String(t.classification.source || 'manual'),
        confidence: ['high', 'medium', 'low'].includes(t.classification.confidence) ? t.classification.confidence : 'low',
        evidence: String(t.classification.evidence || '').slice(0, 300)
      } : null;
    t.recurrenceEvidence = t.recurrenceEvidence && typeof t.recurrenceEvidence === 'object'
      ? {
        candidateId: String(t.recurrenceEvidence.candidateId || ''),
        transactionIds: Array.isArray(t.recurrenceEvidence.transactionIds) ? t.recurrenceEvidence.transactionIds.map(String).slice(0, 24) : [],
        periodicity: String(t.recurrenceEvidence.periodicity || '')
      } : null;
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
      accountId: (m && m.accountId) || null,
      /* Por onde a fatura foi paga. Pix e débito automático saem da
         mesma conta e aparecem diferente no extrato; sem isto, quem
         confere não reconhece o pagamento que acabou de fazer. */
      meio: (m && MEIOS.some((x) => x.id === m.meio)) ? m.meio : null
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
    prof.accounts = (Array.isArray(prof.accounts) ? prof.accounts : []).map((a) => {
      const banco = String(a.bank || '');
      const preset = bankPreset(banco);
      return {
        id: a.id || U.uid('acc'),
        name: String(a.name || 'Conta'),
        bank: banco,
        type: String(a.type || 'Conta corrente'),
        /* Dados antigos também obedecem à regra: banco conhecido usa
           o preset; só uma conta personalizada conserva sua escolha. */
        color: a.customColor ? migrateColor(a.color || '#8A7A62') : corDaMarca(banco || a.name) || (preset ? preset.color : migrateColor(a.color || '#8A7A62')),
        customColor: !!a.customColor,
        customIcon: ['wallet', 'piggy-bank', 'landmark', 'banknote'].includes(a.customIcon) ? a.customIcon : null,
        gradient: preset ? null : (a.gradient ? String(a.gradient) : null),
        last4: String(a.last4 || '').replace(/\D/g, '').slice(-4), // identificação na tela, nada além disso
        openingBalance: U.round2(+a.openingBalance || 0),
        openedAt: U.isValidISO(a.openedAt) ? a.openedAt : U.todayISO(),
        archived: !!a.archived,
        hidden: !!a.hidden,
        /* Fora dos totais: a conta continua existindo, com extrato e
           saldo, mas o que passa por ela não entra nas receitas e
           despesas do mês. É para a conta da empresa, a conta de
           terceiros, a poupança do filho — dinheiro que aparece no
           banco e não é seu para gastar. Ausente = considerada, que
           é o que todo dado antigo significa. */
        considerado: a.considerado !== false,
        /* Perfis antigos podem ter um subconjunto; normalizamos para todos. */
        meios: MEIOS_OFERECIVEIS.map((m) => m.id),
        /* Conta em outra moeda — quem mora fora, quem recebe de fora,
           quem tem Wise ou Nomad. O saldo inicial e o extrato são na
           moeda dela (como o limite do cartão internacional é na moeda
           do cartão), e a cotação converte para os totais do app, que
           são em real. Ausente = real, que é o que toda conta antiga é. */
        moeda: /^[A-Z]{3}$/.test(a.moeda || '') ? a.moeda : 'BRL',
        cotacao: +a.cotacao > 0 ? Math.round(+a.cotacao * 10000) / 10000 : null
      };
    });
    prof.cards = (Array.isArray(prof.cards) ? prof.cards : []).map((c) => ({
      id: c.id || U.uid('card'),
      name: String(c.name || 'Cartão'),
      bank: String(c.bank || ''),
      color: c.customColor ? migrateColor(c.color || '#7C6CF0') : corDaMarca(c.bank || c.name) || migrateColor(c.color || '#7C6CF0'),
      customColor: !!c.customColor,
      customIcon: ['wallet', 'piggy-bank', 'landmark', 'banknote'].includes(c.customIcon) ? c.customIcon : null,
      gradient: c.gradient ? String(c.gradient) : null,          // null = deduzido
      last4: String(c.last4 || '').replace(/\D/g, '').slice(-4), // só os 4 últimos
      limit: U.round2(+c.limit || 0),
      closingDay: Math.min(31, Math.max(1, +c.closingDay || 1)),
      dueDay: Math.min(31, Math.max(1, +c.dueDay || 10)),
      accountId: c.accountId || null,
      visibleInProfiles: [...new Set((Array.isArray(c.visibleInProfiles) ? c.visibleInProfiles : [])
        .filter((id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id)))],
      /* Cartão internacional: limite e fatura na moeda dele, e a
         cotação (reais por 1 unidade) que converte as compras novas
         para os totais. Ausente = real, que é o que todo cartão antigo
         é. */
      moeda: /^[A-Z]{3}$/.test(c.moeda || '') ? c.moeda : 'BRL',
      cotacao: +c.cotacao > 0 ? Math.round(+c.cotacao * 10000) / 10000 : null,
      /* Mesmo interruptor do débito: a fatura continua inteira, com
         limite e vencimento, mas as compras dele ficam fora das
         despesas do mês. */
      considerado: c.considerado !== false,
      hidden: !!c.hidden
    }));
    prof.categories = (Array.isArray(prof.categories) && prof.categories.length ? prof.categories : makeCategories())
      .map((c) => ({
        id: c.id || U.uid('cat'),
        name: String(c.name || 'Categoria'),
        kind: c.kind === 'income' ? 'income' : 'expense',
        color: corPadraoNova(c.name, c.kind, migrateColor(c.color || '#9AA0AC')) || migrateColor(c.color || '#9AA0AC'),
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
      currentValueAt: i.currentValue != null && U.isValidISO(i.currentValueAt) && i.currentValueAt >= i.date ? i.currentValueAt : null,
      indexer: i.type === 'CDB' && i.indexer === 'cdi' ? 'cdi' : 'fixed',
      ticker: /^(Ações|FIIs|ETF)$/.test(i.type) && /^[A-Z0-9]{4,8}$/.test(String(i.ticker || '').toUpperCase()) ? String(i.ticker).toUpperCase() : null,
      quantity: Number.isFinite(+i.quantity) && +i.quantity > 0 ? +i.quantity : null,
      accountId: i.accountId || null,
      maturityDate: U.isValidISO(i.maturityDate) ? i.maturityDate : null,
      liquidity: ['diaria','vencimento'].includes(i.liquidity) ? i.liquidity : null,
      notes: String(i.notes || '')
    }));
    prof.invoices = normalizeInvoices(prof.invoices);

    const auto = prof.automation && typeof prof.automation === 'object' ? prof.automation : {};
    prof.automation = {
      categoryRules: (Array.isArray(auto.categoryRules) ? auto.categoryRules : []).filter((r) => r && r.merchantKey && r.categoryId).map((r) => ({
        id: r.id || U.uid('rule'), merchantKey: String(r.merchantKey), kind: r.kind === 'income' ? 'income' : 'expense',
        categoryId: String(r.categoryId), active: r.active !== false, confirmedAt: r.confirmedAt || null
      })),
      merchantAliases: (Array.isArray(auto.merchantAliases) ? auto.merchantAliases : []).filter((a) => a && a.aliasKey).map((a) => ({
        aliasKey: String(a.aliasKey), canonicalKey: String(a.canonicalKey || a.aliasKey),
        kind: a.kind === 'income' ? 'income' : 'expense', categoryId: a.categoryId || null
      })),
      recurrenceDecisions: (auto.recurrenceDecisions && typeof auto.recurrenceDecisions === 'object') ? auto.recurrenceDecisions : {}
    };

    /* Orçamento: um limite mensal por categoria. Guardado como mapa
       porque a pergunta é sempre "qual o limite DESTA categoria". */
    const orc = (prof.budgets && typeof prof.budgets === 'object') ? prof.budgets : {};
    prof.budgets = {};
    Object.keys(orc).forEach((k) => {
      const v = U.round2(+orc[k] || 0);
      if (v > 0) prof.budgets[k] = v;      // limite zero é o mesmo que não ter limite
    });
    prof.planningSalary = Number.isFinite(+prof.planningSalary) && +prof.planningSalary >= 0
      ? U.round2(+prof.planningSalary) : 0;
    prof.planningReservePercent = Number.isFinite(+prof.planningReservePercent)
      ? Math.min(100, Math.max(0, U.round2(+prof.planningReservePercent))) : 0;

    prof.goals = (Array.isArray(prof.goals) ? prof.goals : []).map((g) => ({
      id: g.id || U.uid('goal'),
      name: String(g.name || 'Meta').slice(0, 60),
      target: U.round2(+g.target || 0),
      saved: U.round2(+g.saved || 0),
      annualRate: g.annualRate != null && Number.isFinite(+g.annualRate) && +g.annualRate >= 0 && +g.annualRate <= 100 ? +g.annualRate : null,
      yieldIndexer: g.yieldIndexer === 'cdi' ? 'cdi' : g.yieldIndexer === 'fixed' || g.annualRate != null ? 'fixed' : 'none',
      cdiPercent: Number.isFinite(+g.cdiPercent) && +g.cdiPercent > 0 && +g.cdiPercent <= 300 ? +g.cdiPercent : 100,
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
      automation: (g.automation && typeof g.automation === 'object') ? {
        active: !!g.automation.active,
        status: g.automation.status === 'ended' ? 'ended' : (g.automation.status === 'paused' ? 'paused' : 'active'),
        amount: U.round2(Math.max(0, +g.automation.amount || 0)),
        day: Math.min(31, Math.max(1, parseInt(g.automation.day, 10) || 1)),
        accountId: g.automation.accountId || null,
        floor: U.round2(Math.max(0, +g.automation.floor || 0))
      } : null,
      proposals: (Array.isArray(g.proposals) ? g.proposals : []).filter((p) => p && p.id && /^\d{4}-\d{2}$/.test(p.ym || '')).map((p) => ({
        id: String(p.id), ym: p.ym,
        status: ['pending', 'confirmed', 'rejected', 'dismissed', 'paused'].includes(p.status) ? p.status : 'pending',
        amount: U.round2(Math.max(0, +p.amount || 0)), accountId: p.accountId || null,
        floor: U.round2(Math.max(0, +p.floor || 0)), reason: String(p.reason || '').slice(0, 300),
        createdAt: p.createdAt || null, resolvedAt: p.resolvedAt || null
      })),
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
        accountId: (d && d.accountId) || null,
        proposalId: (d && d.proposalId) || null
      })).filter((d) => d.amount !== 0),
      createdAt: g.createdAt || U.todayISO()
    }));
    /* Telas do "Mais" (31/10/2026): tags, financiamentos/empréstimos e
       quem me deve. Moram no mesmo JSON do perfil, então sincronizam
       como o resto. Ausente = lista vazia. */
    const txt = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
    const idOk = (v, pre) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,60}$/.test(v)) ? v : U.uid(pre);
    prof.tags = (Array.isArray(prof.tags) ? prof.tags : []).filter((t) => t && txt(t.nome, 30)).slice(0, 100).map((t) => ({
      id: idOk(t.id, 'tag'), nome: txt(t.nome, 30), cor: /^#[0-9a-fA-F]{6}$/.test(t.cor || '') ? t.cor : '#5FA99B'
    }));
    prof.dividas = (Array.isArray(prof.dividas) ? prof.dividas : []).filter((d) => d && txt(d.nome, 60)).slice(0, 100).map((d) => {
      const parcelas = Math.min(600, Math.max(1, parseInt(d.parcelas, 10) || 1));
      return {
        id: idOk(d.id, 'div'), tipo: d.tipo === 'emprestimo' ? 'emprestimo' : 'financiamento',
        nome: txt(d.nome, 60), instituicao: txt(d.instituicao, 60),
        valorTotal: U.round2(Math.max(0, +d.valorTotal || 0)), parcela: U.round2(Math.max(0, +d.parcela || 0)),
        parcelas, pagas: Math.min(parcelas, Math.max(0, parseInt(d.pagas, 10) || 0)),
        dia: Math.min(31, Math.max(1, parseInt(d.dia, 10) || 10)),
        juros: Number.isFinite(+d.juros) && +d.juros >= 0 && +d.juros < 100 ? Math.round(+d.juros * 100) / 100 : null,
        criadoEm: U.isValidISO(d.criadoEm) ? d.criadoEm : U.todayISO()
      };
    });
    prof.aReceber = (Array.isArray(prof.aReceber) ? prof.aReceber : []).filter((x) => x && txt(x.pessoa, 60)).slice(0, 300).map((x) => ({
      id: idOk(x.id, 'rec'), pessoa: txt(x.pessoa, 60), descricao: txt(x.descricao, 120),
      valor: U.round2(Math.max(0, +x.valor || 0)), recebido: U.round2(Math.max(0, +x.recebido || 0)),
      data: U.isValidISO(x.data) ? x.data : U.todayISO(), vence: U.isValidISO(x.vence) ? x.vence : null,
      quitado: !!x.quitado,
      /* conta dividida: aponta para o lançamento que originou (01/11/2026) */
      txId: typeof x.txId === 'string' && x.txId.length <= 80 ? x.txId : null
    }));
    /* Preferências de aviso da pessoa (01/11/2026): só campos conhecidos. */
    if (prof.avisos && typeof prof.avisos === 'object' && !Array.isArray(prof.avisos)) {
      const a = prof.avisos, b = {};
      ['vencimentos', 'faturas', 'receber', 'metas', 'orcamento', 'padrao', 'duplicada', 'score', 'dolar', 'dicas', 'diasUteis', 'detalhes'].forEach((k) => { if (typeof a[k] === 'boolean') b[k] = a[k]; });
      if (Array.isArray(a.antecedencia)) b.antecedencia = a.antecedencia.map(Number).filter((n) => [0, 1, 3, 7].includes(n));
      if (Array.isArray(a.faixas)) b.faixas = a.faixas.map(Number).filter((n) => [50, 80, 100, 120].includes(n));
      if (Array.isArray(a.contasExcluidas)) b.contasExcluidas = a.contasExcluidas.filter((x) => typeof x === 'string' && x.length <= 80).slice(0, 100);
      if ([3, 7, 15, 30].includes(+a.metaDias)) b.metaDias = +a.metaDias;
      if (['baixa', 'media', 'alta'].includes(a.sensibilidade)) b.sensibilidade = a.sensibilidade;
      if (+a.hora >= 6 && +a.hora <= 22) b.hora = +a.hora;
      if ([1, 3, 5, 10].includes(+a.maxDia)) b.maxDia = +a.maxDia;
      prof.avisos = b;
    } else delete prof.avisos;
    /* Caixinhas: dinheiro separado dentro de uma conta (01/11/2026). */
    prof.caixinhas = (Array.isArray(prof.caixinhas) ? prof.caixinhas : []).filter((c) => c && txt(c.nome, 40)).slice(0, 60).map((c) => ({
      id: idOk(c.id, 'cx'), nome: txt(c.nome, 40), contaId: typeof c.contaId === 'string' ? c.contaId.slice(0, 80) : '',
      valor: U.round2(Math.max(0, +c.valor || 0)), meta: U.round2(Math.max(0, +c.meta || 0)),
      cor: /^#[0-9a-fA-F]{6}$/.test(c.cor || '') ? c.cor : '#5FA99B'
    }));
    /* Lista de desejos com "posso comprar?" (01/11/2026). */
    prof.desejos = (Array.isArray(prof.desejos) ? prof.desejos : []).filter((d) => d && txt(d.nome, 80)).slice(0, 100).map((d) => ({
      id: idOk(d.id, 'des'), nome: txt(d.nome, 80), valor: U.round2(Math.max(0, +d.valor || 0)),
      prioridade: ['alta', 'media', 'baixa'].includes(d.prioridade) ? d.prioridade : 'media',
      criadoEm: U.isValidISO(d.criadoEm) ? d.criadoEm : U.todayISO(), comprado: !!d.comprado
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

  /* A V3 lê a conta autenticada antes de desenhar qualquer dado. Não usa o
     cache compartilhado entre contas do app antigo nem grava nele. */
  Store.loadRemoteMap = function (map, ownerName, preferredId) {
    remoteOnly = true;
    const profiles = Object.entries(map && typeof map === 'object' ? map : {})
      .filter(([id, value]) => id && value && typeof value === 'object' && !Array.isArray(value))
      .map(([id, value]) => normalizeProfile(Object.assign({}, value, { id })));
    if (!profiles.length) profiles.push(makeProfile(tr('Pessoal')));
    state = {
      version: VERSION,
      theme: 'dark',
      ownerName: String(ownerName || '').trim().slice(0, 40),
      profiles,
      activeProfileId: profiles.some((p) => p.id === preferredId) ? preferredId : profiles[0].id,
      removidos: {}
    };
    revisao++;
    listeners.forEach((fn) => { try { fn('sync-apply'); } catch (e) { console.error(e); } });
    return state;
  };

  let warnedOnce = false;
  Store.save = function () {
    if (remoteOnly) return true;
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
  Store.profile = () => profileOverride || state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];
  /* O perfil recebido vive apenas na memória da aba. Nunca entra na lista de
     perfis próprios, no backup nem no documento public.dados do convidado. */
  Store.setProfileOverride = (profile) => { profileOverride = profile || null; };

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
  Store.removeAccountWithHistory = function (id) {
    const p = Store.profile();
    if (!p.accounts.some((account) => account.id === id)) return false;
    p.accounts = p.accounts.filter((account) => account.id !== id);
    p.transactions = p.transactions.filter((tx) => tx.accountId !== id && tx.toAccountId !== id);
    p.cards.forEach((card) => { if (card.accountId === id) card.accountId = null; });
    p.investments.forEach((investment) => { if (investment.accountId === id) investment.accountId = null; });
    p.goals.forEach((goal) => (goal.deposits || []).forEach((deposit) => {
      if (deposit.accountId === id) deposit.accountId = null;
    }));
    Object.values(p.invoices || {}).forEach((record) => {
      const originalPayments = record.pagamentos || [];
      record.pagamentos = originalPayments.filter((payment) => payment.accountId !== id);
      if (record.pagamentos.length !== originalPayments.length) record.quitada = false;
      Object.keys(record.adiantamentos || {}).forEach((key) => {
        if (record.adiantamentos[key]?.accountId === id) delete record.adiantamentos[key];
      });
    });
    Store.commit('account-delete-with-history');
    return true;
  };
  Store.removeCardWithHistory = function (id) {
    const p = Store.profile();
    if (!p.cards.some((card) => card.id === id)) return false;
    p.cards = p.cards.filter((card) => card.id !== id);
    p.transactions = p.transactions.filter((tx) => tx.cardId !== id);
    Object.keys(p.invoices || {}).forEach((key) => {
      if (key.startsWith(id + '|')) delete p.invoices[key];
    });
    Store.commit('card-delete-with-history');
    return true;
  };
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
    /* Cancelar é por ocorrência, como confirmar: cancelar a
       mensalidade de março não cancela a de abril. */
    setCancelado(txId, ym, value) {
      const tx = Store.transactions.get(txId);
      if (!tx) return;
      if (tx.recurring) {
        tx.occ[ym] = Object.assign({}, tx.occ[ym], { cancelado: !!value });
      } else {
        tx.cancelado = !!value;
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
      if (opts && opts.proposalId && (g.deposits || []).some((d) => d.proposalId === opts.proposalId)) return g;
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
          accountId: (opts && opts.accountId) || null,
          proposalId: (opts && opts.proposalId) || null
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
      accountId: (opts && opts.accountId) || null,
      meio: (opts && opts.meio) || null
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
      accountId: (opts && opts.accountId) || null,
      meio: (opts && opts.meio) || null
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

  /** Desfaz os pagamentos da fatura sem apagar adiantamentos de compras. */
  Store.clearInvoicePayments = function (cardId, ref) {
    const record = Store.profile().invoices[Store.invoiceKey(cardId, ref)];
    if (!record) return;
    record.pagamentos = [];
    record.quitada = false;
    limpaSeVazio(cardId, ref);
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
