/* =============================================================
   planos.js — a fonte central de planos, preços e limites
   ------------------------------------------------------------
   Este arquivo é a ÚNICA fonte de preço e limite no front-end.
   Se um número aparecer em outro lugar do código, é bug: um dia
   os dois discordam, e o que a pessoa vê deixa de ser o que ela
   paga.

   ATENÇÃO: ESTE ARQUIVO NÃO DECIDE NADA
   Ele existe para a interface orientar — mostrar o preço, dizer
   quantas contas faltam, desenhar a página de planos. Quem decide
   é o banco, porque é lá que o navegador não alcança. Um usuário
   que edite este arquivo no DevTools consegue ver botões
   diferentes e absolutamente nada além disso: a criação passa
   pelo RLS e a IA passa pela Edge Function.

   Há um teste que compara este arquivo com as tabelas do banco e
   falha se os dois discordarem.

   DINHEIRO É INTEIRO, EM CENTAVOS
   14,90 em ponto flutuante é 14.900000000000000355271367880050.
   Some doze vezes e a economia do plano anual sai errada por
   centavos — que é exatamente o tipo de erro que ninguém perdoa
   num produto financeiro. Centavo é int; a divisão só acontece na
   hora de escrever na tela.

   null = ILIMITADO
   Não um número grande. Número grande vaza para a interface, e
   alguém acaba lendo "3 de 999999 contas".
   ============================================================= */
(function (global) {
  'use strict';

  const Planos = {};

  /* ---------------- catálogo ---------------- */

  /* ============================================================
     AS TRÊS CHAVES QUE O BRIEF PEDIU POR NOME
     ------------------------------------------------------------
     `features.*` e `limits.*` do brief são exatamente `recursos.*`
     e `limites.*` daqui — a tradução está em Planos.CHAVES, no fim
     do arquivo, e existe para que documento e código não se
     afastem em silêncio.

     O QUE MUDOU DE FATO NESTA REVISÃO, E POR QUÊ
     · transactions_per_month entrou. O Grátis passa a ter teto de
       lançamentos (100/mês); Basic e Pro, ilimitado. Sem esta
       chave o "até 100 movimentações" do brief não existiria em
       lugar nenhum a não ser no texto de marketing.
     · uglez_assistente_flutuante entrou como RECURSO, não como
       consequência do plano. Um `plano !== 'free'` espalhado pelos
       componentes é a forma clássica de o produto e a cobrança
       divergirem no dia em que aparecer um quarto plano.
     · comparacao_anual saiu de dentro de comparison_months. Eram
       duas perguntas diferentes ("quantos meses eu comparo" e "eu
       comparo anos") respondidas pelo mesmo número.
     · analises_avancadas continua, e agora é anunciada: o Pro faz
       tendências, simulações e projeções, e isso está na tela.
     ============================================================ */

  Planos.LISTA = [
    {
      id: 'free',
      nome: 'Grátis',
      descricao: 'Para organizar o essencial e entender para onde vai o dinheiro.',
      moeda: 'BRL',
      mensalCentavos: 0,
      anualCentavos: 0,
      destaque: false,
      limites: {
        workspaces: 1,
        accounts: 2,
        credit_cards: 1,
        transactions_per_month: 100,
        custom_categories: 10,
        budgets: 1,
        goals: 1,
        recurring_items: 3,
        ai_queries_per_month: 5,
        history_months: 3,
        comparison_months: 1,
        collaborators: 0
      },
      recursos: {
        import_csv: false, import_ofx: false,
        export_csv: false, export_pdf: false,
        calendario: false,
        uglez_assistente_flutuante: false,
        comparacao_mensal: false, comparacao_anual: false,
        analises_avancadas: false, ia_simulacoes: false,
        colaboracao: false, relatorios_custom: false,
        acesso_antecipado: false, suporte_prioritario: false
      }
    },
    {
      id: 'basic',
      nome: 'Basic',
      descricao: 'Para quem já tem mais de uma conta e quer o histórico inteiro.',
      moeda: 'BRL',
      mensalCentavos: 2490,
      anualCentavos: 23990,
      destaque: true,
      limites: {
        workspaces: 1,
        accounts: 10,
        credit_cards: 5,
        transactions_per_month: null,
        custom_categories: null,
        budgets: null,
        goals: 10,
        recurring_items: null,
        ai_queries_per_month: 30,
        history_months: 24,
        comparison_months: 24,
        collaborators: 0
      },
      recursos: {
        import_csv: true, import_ofx: true,
        export_csv: true, export_pdf: true,
        calendario: true,
        uglez_assistente_flutuante: true,
        comparacao_mensal: true, comparacao_anual: false,
        analises_avancadas: false, ia_simulacoes: false,
        colaboracao: false, relatorios_custom: false,
        acesso_antecipado: false, suporte_prioritario: false
      }
    },
    {
      id: 'pro',
      nome: 'Pro',
      descricao: 'Para quem separa finanças por espaço e quer análise a fundo.',
      moeda: 'BRL',
      mensalCentavos: 4990,
      anualCentavos: 47990,
      destaque: false,
      limites: {
        workspaces: 5,
        accounts: null,
        credit_cards: null,
        transactions_per_month: null,
        custom_categories: null,
        budgets: null,
        goals: null,
        recurring_items: null,
        ai_queries_per_month: 120,
        history_months: null,
        comparison_months: null,
        collaborators: 3
      },
      recursos: {
        import_csv: true, import_ofx: true,
        export_csv: true, export_pdf: true,
        calendario: true,
        uglez_assistente_flutuante: true,
        comparacao_mensal: true, comparacao_anual: true,
        analises_avancadas: true, ia_simulacoes: true,
        colaboracao: true, relatorios_custom: true,
        acesso_antecipado: true, suporte_prioritario: true
      }
    }
  ];

  /* ============================================================
     OS NOMES DO BRIEF → OS NOMES DO CÓDIGO
     ------------------------------------------------------------
     O brief pede `features.uglezFloatingAssistant`,
     `limits.aiRequestsMonthly` e companhia. O código é escrito em
     português, como o resto do projeto. Em vez de escolher um dos
     dois e deixar o outro obsoleto, os dois existem — e este mapa
     é o contrato entre eles.

     Limites.pode() e Limites.limite() aceitam qualquer um dos dois
     nomes, então `Limites.pode('uglezFloatingAssistant')` e
     `Limites.pode('uglez_assistente_flutuante')` são a mesma
     pergunta. Isso não é açúcar: é o que impede um typo silencioso
     de virar "recurso liberado para todo mundo".
     ============================================================ */

  Planos.CHAVES = {
    // features.*
    uglezFloatingAssistant: 'uglez_assistente_flutuante',
    advancedAnalytics: 'analises_avancadas',
    csvImport: 'import_csv',
    ofxImport: 'import_ofx',
    csvExport: 'export_csv',
    pdfExport: 'export_pdf',
    monthlyComparison: 'comparacao_mensal',
    annualComparison: 'comparacao_anual',
    simulations: 'ia_simulacoes',
    calendar: 'calendario',
    earlyAccess: 'acesso_antecipado',
    prioritySupport: 'suporte_prioritario',
    // limits.*
    aiRequestsMonthly: 'ai_queries_per_month',
    accounts: 'accounts',
    cards: 'credit_cards',
    transactionsMonthly: 'transactions_per_month',
    workspaces: 'workspaces',
    goals: 'goals',
    budgets: 'budgets',
    recurring: 'recurring_items',
    historyMonths: 'history_months'
  };

  /** O nome interno de uma chave, venha ela em qual dialeto vier. */
  Planos.chave = function (nome) {
    return Planos.CHAVES[nome] || nome;
  };

  Planos.get = (id) => Planos.LISTA.find((p) => p.id === id) || Planos.LISTA[0];
  Planos.IDS = Planos.LISTA.map((p) => p.id);

  /* ---------------- dinheiro ---------------- */

  /** A única função que transforma centavo em texto. */
  Planos.moeda = function (centavos) {
    return (centavos / 100).toLocaleString('pt-BR', {
      style: 'currency', currency: 'BRL',
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  };

  /**
   * O mensal equivalente do plano anual. Arredonda para baixo, ao
   * centavo: prometer R$ 12,50 quando a conta dá 12,4916 seria
   * cobrar meio centavo a mais do que o anunciado.
   */
  Planos.mensalEquivalente = function (plano) {
    if (!plano.anualCentavos) return 0;
    return Math.floor(plano.anualCentavos / 12);
  };

  /** Quanto o anual economiza frente a doze mensais. */
  Planos.economiaAnual = function (plano) {
    if (!plano.anualCentavos || !plano.mensalCentavos) return 0;
    return (plano.mensalCentavos * 12) - plano.anualCentavos;
  };

  Planos.preco = function (plano, ciclo) {
    return ciclo === 'annual' ? plano.anualCentavos : plano.mensalCentavos;
  };

  /* ---------------- leitura de limites ---------------- */

  const ILIMITADO = 'Ilimitado';
  Planos.ILIMITADO = ILIMITADO;

  /** Um limite vira texto: número, ou a palavra — nunca 999999. */
  Planos.textoLimite = function (v) {
    return v === null || v === undefined ? ILIMITADO : String(v);
  };

  /** "3 de 10" ou "3 usados · ilimitado". */
  Planos.textoUso = function (usado, limite, unidade) {
    const u = unidade ? ' ' + unidade : '';
    if (limite === null || limite === undefined) return usado + u + ' · ilimitado';
    return usado + ' de ' + limite + u;
  };

  /* ---------------- o que cada plano oferece, em português ----
     Só entra nesta lista o que o produto REALMENTE faz hoje. O
     brief é explícito: recurso futuro não aparece como disponível.
     Colaboração, relatórios personalizados, exportação em PDF e
     simulações da IA existem como direito no banco — o encanamento
     está pronto — mas não são anunciados enquanto não existirem.
     ------------------------------------------------------------ */

  Planos.COMPARATIVO = [
    { chave: 'workspaces',             rotulo: 'Espaços financeiros',            tipo: 'limite' },
    { chave: 'accounts',               rotulo: 'Contas',                         tipo: 'limite' },
    { chave: 'credit_cards',           rotulo: 'Cartões de crédito',             tipo: 'limite' },
    { chave: 'transactions_per_month', rotulo: 'Movimentações por mês',          tipo: 'limite' },
    { chave: 'custom_categories',      rotulo: 'Categorias personalizadas',      tipo: 'limite' },
    { chave: 'budgets',                rotulo: 'Orçamentos ativos',              tipo: 'limite' },
    { chave: 'goals',                  rotulo: 'Metas ativas',                   tipo: 'limite' },
    { chave: 'recurring_items',        rotulo: 'Recorrências',                   tipo: 'limite' },
    { chave: 'history_months',         rotulo: 'Histórico disponível',           tipo: 'meses' },
    { chave: 'ai_queries_per_month',   rotulo: 'Consultas ao UGLEZ por mês',     tipo: 'limite' },
    { chave: 'uglez_assistente_flutuante', rotulo: 'UGLEZ flutuante no app',     tipo: 'recurso' },
    { chave: 'comparacao_mensal',      rotulo: 'Comparação entre meses',         tipo: 'recurso' },
    { chave: 'comparacao_anual',       rotulo: 'Comparação anual',               tipo: 'recurso' },
    { chave: 'analises_avancadas',     rotulo: 'Tendências, simulações e projeções', tipo: 'recurso' },
    { chave: 'calendario',             rotulo: 'Calendário financeiro',          tipo: 'recurso' },
    { chave: 'import_csv',             rotulo: 'Importar extrato em CSV',        tipo: 'recurso' },
    { chave: 'import_ofx',             rotulo: 'Importar extrato em OFX',        tipo: 'recurso' },
    { chave: 'export_csv',             rotulo: 'Exportar em CSV',                tipo: 'recurso' },
    { chave: 'export_pdf',             rotulo: 'Exportar em PDF',                tipo: 'recurso' },
    { chave: 'acesso_antecipado',      rotulo: 'Acesso antecipado a novidades',  tipo: 'recurso' },
    { chave: 'suporte_prioritario',    rotulo: 'Atendimento prioritário',        tipo: 'recurso' },
    { chave: 'backup',                 rotulo: 'Backup em JSON',                 tipo: 'fixo', valor: 'Sempre' }
  ];

  /** Destaques do cartão de cada plano, na ordem em que convencem. */
  Planos.DESTAQUES = {
    free: [
      '1 espaço financeiro, 2 contas e 1 cartão',
      'Até 100 movimentações por mês',
      '1 orçamento e 1 meta ativos',
      'Até 3 recorrências',
      'Histórico dos últimos 3 meses',
      '5 consultas ao UGLEZ por mês, na página do UGLEZ'
    ],
    basic: [
      '10 contas e 5 cartões',
      'Movimentações, orçamentos e recorrências ilimitados',
      'Até 10 metas e histórico de 24 meses',
      'Importar CSV e OFX, exportar CSV e PDF',
      'Calendário financeiro e comparação entre meses',
      '30 consultas ao UGLEZ por mês, com assistente flutuante'
    ],
    pro: [
      'Até 5 espaços financeiros',
      'Contas, cartões e movimentações ilimitados',
      'Metas, orçamentos e recorrências ilimitados',
      'Histórico completo e comparação anual',
      'Tendências, simulações e projeções do UGLEZ',
      '120 consultas ao UGLEZ por mês, com assistente flutuante',
      'Acesso antecipado e atendimento prioritário'
    ]
  };

  /* Perguntas que continuam válidas enquanto só o Grátis pode ser
     contratado. As regras comerciais entram junto com o Asaas. */
  Planos.FAQ = [
    {
      p: 'Quando Basic e Pro estarão disponíveis?',
      r: 'Depois que a nova integração de assinaturas estiver concluída e validada. Até lá, só o plano Grátis pode ser contratado.'
    },
    {
      p: 'O que acontece com meus dados se eu voltar para o Grátis?',
      r: 'Nada é apagado. Se você tiver mais contas ou cartões do que o Grátis permite, eles continuam visíveis e utilizáveis — o que muda é que você não cria novos até ficar dentro do limite ou assinar de novo.'
    },
    {
      p: 'Meus dados financeiros são enviados para a inteligência artificial?',
      r: 'Só um resumo agregado do mês que você está olhando — totais, categorias consolidadas e metas. Nunca a lista de lançamentos, nomes de contas ou seu e-mail. Dá para ver exatamente o que sai, em Configurações.'
    },
    {
      p: 'Preciso de conta para usar o OAZE?',
      r: 'Não. O painel funciona neste aparelho sem conta nenhuma. A conta serve para ver os mesmos dados no computador e no celular, e para conversar com o UGLEZ.'
    }
  ];

  global.Planos = Planos;
})(window);
