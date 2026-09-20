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
     · transactions_per_month entrou. O Semente passa a ter teto de
       lançamentos (100/mês). Sem esta
       chave o "até 100 movimentações" do brief não existiria em
       lugar nenhum a não ser no texto de marketing.
     · uglez_assistente_flutuante entrou como RECURSO, não como
       consequência do plano. Um `plano !== 'free'` espalhado pelos
       componentes é a forma clássica de o produto e a cobrança
       divergirem no dia em que aparecer um quarto plano.
     · comparacao_anual saiu de dentro de comparison_months. Eram
       duas perguntas diferentes ("quantos meses eu comparo" e "eu
       comparo anos") respondidas pelo mesmo número.
     · analises_avancadas continua, e agora é anunciada: o Oásis faz
       tendências, simulações e projeções, e isso está na tela.
     ============================================================ */

  Planos.LISTA = [
    {
      id: 'free',
      nome: 'Semente',
      descricao: 'Plante o hábito de olhar o mês.',
      moeda: 'BRL',
      mensalCentavos: 0,
      anualCentavos: 0,
      internacional: { USD: { mensal: 0, anual: 0 }, EUR: { mensal: 0, anual: 0 } },
      destaque: false,
      limites: {
        workspaces: 1,
        accounts: 2,
        credit_cards: 3,
        transactions_per_month: 100,
        custom_categories: 10,
        budgets: 1,
        goals: 1,
        recurring_items: 3,
        ai_queries_per_month: 10,
        history_months: 3,
        comparison_months: 1,
        collaborators: 0
      },
      recursos: {
        export_csv: false, export_pdf: false,
        /* Cartão em dólar, euro ou libra desde o plano grátis: quem tem
           uma conta no exterior tem UMA conta, e era justamente essa
           pessoa que o limite deixava de fora. Não custa nada a mais no
           servidor — a conversão é conta feita no navegador. */
        cartoes_internacionais: true,
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
      nome: 'Coqueiro',
      descricao: 'Raiz firme: contas, cartões e histórico.',
      moeda: 'BRL',
      mensalCentavos: 1490,
      anualCentavos: 14990,
      internacional: { USD: { mensal: 399, anual: 3499 }, EUR: { mensal: 399, anual: 3499 } },
      destaque: true,
      limites: {
        workspaces: 1,
        accounts: 10,
        credit_cards: 10,
        transactions_per_month: 1000,
        custom_categories: 50,
        budgets: 20,
        goals: 10,
        recurring_items: 30,
        ai_queries_per_month: 60,
        history_months: 24,
        comparison_months: 24,
        collaborators: 0
      },
      recursos: {
        export_csv: true, export_pdf: true,
        cartoes_internacionais: true,
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
      nome: 'Oásis',
      descricao: 'Tudo o que o OAZE faz, sem teto no dia a dia.',
      moeda: 'BRL',
      mensalCentavos: 2990,
      anualCentavos: 29990,
      internacional: { USD: { mensal: 799, anual: 6999 }, EUR: { mensal: 799, anual: 6999 } },
      destaque: false,
      limites: {
        workspaces: 5,
        accounts: 50,
        credit_cards: null,
        transactions_per_month: null,
        custom_categories: 200,
        budgets: 100,
        goals: 50,
        recurring_items: 150,
        ai_queries_per_month: 200,
        history_months: null,
        comparison_months: null,
        collaborators: 3
      },
      recursos: {
        export_csv: true, export_pdf: true,
        cartoes_internacionais: true,
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
    csvExport: 'export_csv',
    internationalCards: 'cartoes_internacionais',
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

  /* ============================================================
     DINHEIRO — E AGORA EM TRÊS MOEDAS
     ------------------------------------------------------------
     O site existe em quatro línguas desde 17/09/2026, e cobrar
     R$ 29,90 de quem chegou pelo /en é vender por US$ 5,50 um
     produto que os concorrentes de lá cobram a US$ 8 e US$ 15. O
     preço internacional NÃO é conversão do real: é tabela própria,
     escrita à mão, com o desconto anual maior que o daqui porque é
     assim que o mercado de fora compra.

     Três regras que não podem ser quebradas:

     1. Todo preço internacional é MAIOR que o brasileiro no câmbio
        do dia (US$ 3,99 ≈ R$ 21, contra R$ 14,90). Isso não é
        detalhe de marketing: é o que torna seguro deixar qualquer
        pessoa escolher a moeda sem prova de país nenhuma. Não há
        arbitragem a fazer — quem escolher dólar paga mais.
     2. O real continua sendo o preço de tabela do catálogo
        (mensalCentavos/anualCentavos). Os testes que comparam o JS
        com o banco olham para ele, e o internacional entra por
        fora, em `internacional`.
     3. Quem cobra é o servidor. Estas funções desenham tela; o
        valor vem sempre de plan_prices, por (plano, ciclo, moeda).
     ============================================================ */

  Planos.MOEDAS = [
    { id: 'BRL', rotulo: 'Real (R$)',   simbolo: 'R$', depois: false, decimal: ',', milhar: '.' },
    { id: 'USD', rotulo: 'Dólar (US$)', simbolo: 'US$', depois: false, decimal: '.', milhar: ',' },
    { id: 'EUR', rotulo: 'Euro (€)',    simbolo: '€',  depois: true,  decimal: ',', milhar: '.' }
  ];

  Planos.MOEDA_PADRAO = 'BRL';

  /** A moeda, se ela existir; o real, se vier qualquer outra coisa. */
  Planos.moedaValida = function (id) {
    const alvo = String(id || '').toUpperCase();
    return Planos.MOEDAS.some((m) => m.id === alvo) ? alvo : Planos.MOEDA_PADRAO;
  };

  /* Países do euro. Quem está fora desta lista e fora do Brasil vê
     dólar — inclusive Reino Unido e Canadá, que preferem a própria
     moeda mas entendem um preço em dólar. */
  const PAISES_EURO = ['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR',
    'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK'];

  /**
   * O palpite inicial, nunca a última palavra: a tela sempre deixa
   * trocar. Fuso do Brasil vence idioma, porque brasileiro com o
   * navegador em inglês continua brasileiro.
   */
  Planos.moedaSugerida = function () {
    try {
      const fuso = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      if (/^America\/(Sao_Paulo|Bahia|Fortaleza|Recife|Belem|Manaus|Cuiaba|Campo_Grande|Boa_Vista|Porto_Velho|Rio_Branco|Maceio|Araguaina|Santarem|Noronha|Eirunepe)$/.test(fuso)) return 'BRL';
      const idiomas = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'pt-BR']);
      const tag = String(idiomas[0] || '');
      const regiao = (tag.split('-')[1] || '').toUpperCase();
      if (regiao === 'BR') return 'BRL';
      if (PAISES_EURO.indexOf(regiao) >= 0) return 'EUR';
      if (!regiao && /^pt/i.test(tag)) return 'BRL';
      return 'USD';
    } catch (e) {
      return Planos.MOEDA_PADRAO;
    }
  };

  /**
   * A única função que transforma centavo em texto.
   * R$ 14,90 · US$ 3.99 · 3,99 € — cada moeda com a pontuação e a
   * posição de símbolo que o leitor daquele preço espera ver.
   */
  Planos.moeda = function (centavos, moeda) {
    const m = Planos.MOEDAS.find((x) => x.id === Planos.moedaValida(moeda));
    const inteiro = Math.floor(Math.abs(centavos) / 100);
    const resto = String(Math.abs(centavos) % 100).padStart(2, '0');
    const grupos = String(inteiro).replace(/\B(?=(\d{3})+(?!\d))/g, m.milhar);
    const numero = (centavos < 0 ? '-' : '') + grupos + m.decimal + resto;
    return m.depois ? numero + ' ' + m.simbolo : m.simbolo + ' ' + numero;
  };

  /**
   * O mensal equivalente do plano anual. Arredonda para baixo, ao
   * centavo: prometer R$ 12,50 quando a conta dá 12,4916 seria
   * cobrar meio centavo a mais do que o anunciado.
   */
  Planos.mensalEquivalente = function (plano, moeda) {
    const anual = Planos.preco(plano, 'annual', moeda);
    if (!anual) return 0;
    return Math.floor(anual / 12);
  };

  /** Quanto o anual economiza frente a doze mensais. */
  Planos.economiaAnual = function (plano, moeda) {
    const anual = Planos.preco(plano, 'annual', moeda);
    const mensal = Planos.preco(plano, 'monthly', moeda);
    if (!anual || !mensal) return 0;
    return (mensal * 12) - anual;
  };

  /* "R$ 0" e não "R$ 0,00": o plano grátis não tem centavo para
     mostrar, e o zero redondo é o que a tabela de comparação usa. */
  Planos.gratis = function (moeda) {
    const m = Planos.MOEDAS.find((x) => x.id === Planos.moedaValida(moeda));
    return m.depois ? '0 ' + m.simbolo : m.simbolo + ' 0';
  };

  Planos.preco = function (plano, ciclo, moeda) {
    const m = Planos.moedaValida(moeda);
    if (m === 'BRL') return ciclo === 'annual' ? plano.anualCentavos : plano.mensalCentavos;
    const tabela = (plano.internacional || {})[m] || { mensal: 0, anual: 0 };
    return ciclo === 'annual' ? tabela.anual : tabela.mensal;
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
    { chave: 'cartoes_internacionais', rotulo: 'Contas e cartões em dólar, euro e outras moedas', tipo: 'recurso' },
    { chave: 'export_csv',             rotulo: 'Exportar em CSV',                tipo: 'recurso' },
    { chave: 'export_pdf',             rotulo: 'Exportar em PDF',                tipo: 'recurso' },
    { chave: 'acesso_antecipado',      rotulo: 'Acesso antecipado a novidades',  tipo: 'recurso' },
    { chave: 'suporte_prioritario',    rotulo: 'Atendimento prioritário',        tipo: 'recurso' }
  ];

  /** Destaques do cartão de cada plano, na ordem em que convencem. */
  Planos.DESTAQUES = {
    free: [
      '1 espaço financeiro, 2 contas e 3 cartões',
      'Até 100 movimentações por mês',
      '1 orçamento, 1 meta e 3 recorrências',
      'Histórico dos últimos 3 meses',
      'Contas e cartões em dólar, euro e outras moedas',
      '10 consultas ao UGLEZ por mês, na página do UGLEZ'
    ],
    basic: [
      '10 contas e 10 cartões',
      'Até 1.000 movimentações por mês',
      '20 orçamentos, 10 metas e 30 recorrências',
      'Histórico de 24 meses e comparação entre meses',
      'Exportar em CSV e PDF, calendário financeiro',
      '60 consultas ao UGLEZ por mês, com assistente flutuante'
    ],
    pro: [
      'Até 5 espaços financeiros e 50 contas',
      'Cartões e movimentações sem limite',
      '100 orçamentos, 50 metas e 150 recorrências',
      'Histórico completo e comparação anual',
      'Tendências, simulações e projeções do UGLEZ',
      '200 consultas ao UGLEZ por mês, com assistente flutuante',
      'Acesso antecipado e atendimento prioritário'
    ]
  };

  Planos.FAQ = [
    {
      p: 'Como funciona a cobrança?',
      r: 'No cartão de crédito, pela Stripe. O cartão é digitado na página segura da Stripe — o OAZE não vê nem guarda o número ou o código de segurança. A assinatura renova a cada mês ou ano, e o plano é liberado quando o pagamento é confirmado.'
    },
    {
      p: 'Posso cancelar quando quiser?',
      r: 'Sim, em Configurações. A renovação para na hora e você continua com o plano até o fim do período que já pagou.'
    },
    {
      p: 'O que acontece com meus dados se eu voltar para o Semente?',
      r: 'Nada é apagado. Se você tiver mais contas ou cartões do que o Semente permite, eles continuam visíveis e utilizáveis — o que muda é que você não cria novos até ficar dentro do limite ou assinar de novo.'
    },
    {
      p: 'Meus dados financeiros são enviados para a inteligência artificial?',
      r: 'Só um resumo agregado do mês que você está olhando — totais, categorias consolidadas e metas. Nunca a lista de lançamentos, nomes de contas ou seu e-mail. A tela do UGLEZ mostra o que segue junto antes de você enviar.'
    },
    {
      p: 'Preciso de conta para usar o OAZE?',
      r: 'Não. O painel funciona neste aparelho sem conta nenhuma. A conta serve para ver os mesmos dados no computador e no celular, e para conversar com o UGLEZ.'
    }
  ];

  global.Planos = Planos;
})(window);
