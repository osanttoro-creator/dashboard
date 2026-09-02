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
        custom_categories: 10,
        budgets: 2,
        goals: 1,
        recurring_items: 3,
        ai_queries_per_month: 5,
        history_months: 6,
        comparison_months: 3,
        collaborators: 0
      },
      recursos: {
        import_csv: false, import_ofx: false,
        export_csv: false, export_pdf: false,
        colaboracao: false, analises_avancadas: false,
        ia_simulacoes: false, relatorios_custom: false,
        suporte_prioritario: false
      }
    },
    {
      id: 'basic',
      nome: 'Basic',
      descricao: 'Para quem já tem mais de uma conta e quer o histórico inteiro.',
      moeda: 'BRL',
      mensalCentavos: 1490,
      anualCentavos: 14990,
      destaque: true,
      limites: {
        workspaces: 2,
        accounts: 10,
        credit_cards: 5,
        custom_categories: null,
        budgets: null,
        goals: null,
        recurring_items: null,
        ai_queries_per_month: 50,
        history_months: null,
        comparison_months: 12,
        collaborators: 0
      },
      recursos: {
        import_csv: true, import_ofx: false,
        export_csv: true, export_pdf: false,
        colaboracao: false, analises_avancadas: false,
        ia_simulacoes: false, relatorios_custom: false,
        suporte_prioritario: false
      }
    },
    {
      id: 'pro',
      nome: 'Pro',
      descricao: 'Para quem separa finanças por espaço e quer análise a fundo.',
      moeda: 'BRL',
      mensalCentavos: 2990,
      anualCentavos: 29990,
      destaque: false,
      limites: {
        workspaces: 5,
        accounts: null,
        credit_cards: null,
        custom_categories: null,
        budgets: null,
        goals: null,
        recurring_items: null,
        ai_queries_per_month: 200,
        history_months: null,
        comparison_months: null,
        collaborators: 3
      },
      recursos: {
        import_csv: true, import_ofx: true,
        export_csv: true, export_pdf: true,
        colaboracao: true, analises_avancadas: true,
        ia_simulacoes: true, relatorios_custom: true,
        suporte_prioritario: true
      }
    }
  ];

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
    { chave: 'workspaces',           rotulo: 'Espaços financeiros',        tipo: 'limite' },
    { chave: 'accounts',             rotulo: 'Contas',                     tipo: 'limite' },
    { chave: 'credit_cards',         rotulo: 'Cartões de crédito',         tipo: 'limite' },
    { chave: 'lancamentos',          rotulo: 'Lançamentos manuais',        tipo: 'fixo', valor: ILIMITADO },
    { chave: 'custom_categories',    rotulo: 'Categorias personalizadas',  tipo: 'limite' },
    { chave: 'budgets',              rotulo: 'Orçamentos',                 tipo: 'limite' },
    { chave: 'goals',                rotulo: 'Metas',                      tipo: 'limite' },
    { chave: 'recurring_items',      rotulo: 'Recorrências',               tipo: 'limite' },
    { chave: 'history_months',       rotulo: 'Histórico e análises',       tipo: 'meses' },
    { chave: 'comparison_months',    rotulo: 'Comparação entre períodos',  tipo: 'meses' },
    { chave: 'ai_queries_per_month', rotulo: 'Consultas ao UGLEZ por mês', tipo: 'limite' },
    { chave: 'import_csv',           rotulo: 'Importar extrato em CSV',    tipo: 'recurso' },
    { chave: 'import_ofx',           rotulo: 'Importar extrato em OFX',    tipo: 'recurso' },
    { chave: 'export_csv',           rotulo: 'Exportar relatório em CSV',  tipo: 'recurso' },
    { chave: 'backup',               rotulo: 'Backup em JSON',             tipo: 'fixo', valor: 'Sempre' }
  ];

  /** Destaques do cartão de cada plano, na ordem em que convencem. */
  Planos.DESTAQUES = {
    free: [
      '1 espaço financeiro',
      '2 contas e 1 cartão',
      'Lançamentos ilimitados',
      '10 categorias personalizadas',
      'Histórico dos últimos 6 meses',
      '5 consultas ao UGLEZ por mês'
    ],
    basic: [
      '2 espaços financeiros',
      '10 contas e 5 cartões',
      'Categorias, orçamentos, metas e recorrências ilimitados',
      'Histórico financeiro completo',
      '50 consultas ao UGLEZ por mês',
      'Importar e exportar em CSV'
    ],
    pro: [
      '5 espaços financeiros',
      'Contas e cartões ilimitados',
      'Histórico e comparações sem limite',
      '200 consultas ao UGLEZ por mês',
      'Importar CSV e OFX',
      'Análises avançadas do UGLEZ'
    ]
  };

  /* Perguntas que a pessoa faz antes de assinar — e que, sem
     resposta, viram e-mail de suporte ou desistência. */
  Planos.FAQ = [
    {
      p: 'Posso cancelar quando quiser?',
      r: 'Sim. O plano continua valendo até o fim do período que você já pagou, e depois volta para o Grátis. Não há multa nem fidelidade.'
    },
    {
      p: 'O que acontece com meus dados se eu voltar para o Grátis?',
      r: 'Nada é apagado. Se você tiver mais contas ou cartões do que o Grátis permite, eles continuam visíveis e utilizáveis — o que muda é que você não cria novos até ficar dentro do limite ou assinar de novo.'
    },
    {
      p: 'Como funciona a troca de plano?',
      r: 'O upgrade vale assim que o pagamento é confirmado. O downgrade vale no fim do período já pago, para você não perder dias que já comprou.'
    },
    {
      p: 'A cobrança anual é um pagamento só?',
      r: 'Sim, um pagamento que cobre doze meses. É por isso que sai mais barato por mês.'
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
