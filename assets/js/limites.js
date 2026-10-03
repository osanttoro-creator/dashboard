/* =============================================================
   limites.js — o serviço de permissões
   ------------------------------------------------------------
   Quatro perguntas, um lugar só:

     Limites.direitos()          o que este usuário tem direito
     Limites.pode(recurso)       este recurso está liberado?
     Limites.cabe(tipo)          ainda cabe mais um deste tipo?
     Limites.uso(tipo)           quanto foi usado de quanto

   ONDE ISTO É A PROTEÇÃO, E ONDE NÃO É
   Aqui é orientação. Botão escondido não é segurança: quem abre o
   DevTools chama a função direto. A proteção real está em dois
   lugares que o navegador não alcança —

     criar registro   → RLS por participação no workspace, e o
                        limite de workspaces está no plano
     consultar a IA   → Edge Function, que lê o plano do banco e
                        reserva a cota de forma atômica

   O papel deste arquivo é fazer a pessoa entender o limite ANTES
   de bater nele, e explicar quando bate. Um erro genérico de
   permissão vindo do banco é tecnicamente seguro e péssimo de
   receber.

   AO BATER NO LIMITE, NADA É APAGADO
   Nem escondido, nem bloqueado. O que para é a criação de itens
   NOVOS daquele tipo. Quem está acima do limite depois de um
   downgrade continua vendo e usando tudo — e pode apagar o que
   quiser para voltar a caber.
   ============================================================= */
(function (global) {
  'use strict';

  const Limites = {};
  const el = U.el;

  /* Direitos do plano Semente (free), embutidos. Servem quando não há
     sessão ou rede — e é a escolha conservadora certa: na dúvida,
     o menor plano, nunca o maior. */
  const PADRAO = {
    plano: 'free',
    status: 'free',
    limites: Planos.get('free').limites,
    recursos: Planos.get('free').recursos
  };

  let direitos = PADRAO;
  let consumoIA = { usado: 0, limite: PADRAO.limites.ai_queries_per_month };

  function sb() {
    try {
      return (global.SupabaseBackend && SupabaseBackend.cliente && SupabaseBackend.cliente()) || null;
    } catch (e) { return null; }
  }

  Limites.direitos = () => direitos;
  Limites.plano = () => direitos.plano;
  Limites.consumoIA = () => consumoIA;

  /* ---------------- carga ---------------- */

  /**
   * Uma chamada só, resolvida no banco: a função meus_direitos()
   * junta assinatura, plano e direitos. Fazer três consultas aqui
   * seria três oportunidades de ficar num estado meio carregado.
   */
  Limites.carregar = async function () {
    const c = sb();
    const u = global.Sync && Sync.currentUser();
    if (!c || !u) { direitos = PADRAO; return direitos; }
    try {
      const { data, error } = await c.rpc('meus_direitos');
      if (error) throw error;
      if (data) {
        direitos = {
          plano: data.plano || 'free',
          planoContratado: data.plano_contratado,
          status: data.status || 'free',
          ciclo: data.ciclo,
          fimPeriodo: data.fim_periodo,
          cancelaNoFim: !!data.cancela_no_fim,
          limites: data.limites || PADRAO.limites,
          recursos: data.recursos || PADRAO.recursos
        };
      }
      await Limites.carregarConsumo();
    } catch (e) {
      console.warn('Limites: usando o plano Semente por precaução —', e.message);
      direitos = PADRAO;
    }
    return direitos;
  };

  Limites.carregarConsumo = async function () {
    const c = sb();
    const u = global.Sync && Sync.currentUser();
    if (!c || !u) return;
    /* O mês no fuso do OAZE, igual ao que o banco usa. Calcular em
       UTC faria o contador "virar" às 21h do dia 30. */
    const mes = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
    try {
      const { data } = await c.from('usage_counters')
        .select('usado, limite').eq('user_id', u.uid)
        .eq('tipo', 'ai_query').eq('periodo', mes).maybeSingle();
      consumoIA = {
        usado: (data && data.usado) || 0,
        limite: direitos.limites.ai_queries_per_month
      };
    } catch (e) { /* offline */ }
  };

  /* ---------------- perguntas ---------------- */

  /* As perguntas aceitam o nome do brief (features.csvImport) e o
     nome interno (import_csv) indiferentemente — Planos.chave()
     traduz. Sem isso, um typo em qualquer um dos dois dialetos
     devolveria "undefined", e "!!undefined" é false: o recurso
     ficaria bloqueado para todo mundo, sem erro em lugar nenhum e
     sem ninguém reclamando, porque quem não vê um botão não sabe
     que deveria vê-lo. Por isso a chave desconhecida grita. */
  function chaveConhecida(nome, mapa) {
    const k = Planos.chave(nome);
    if (mapa && !(k in mapa)) {
      console.warn('Limites: chave desconhecida "' + nome + '". ' +
        'Ela não existe em planos.js e será tratada como não liberada.');
    }
    return k;
  }

  Limites.pode = function (recurso) {
    const k = chaveConhecida(recurso, direitos.recursos);
    return !!(direitos.recursos && direitos.recursos[k]);
  };

  Limites.limite = function (tipo) {
    const k = chaveConhecida(tipo, direitos.limites);
    const v = direitos.limites ? direitos.limites[k] : undefined;
    return v === undefined ? null : v;
  };

  /**
   * Quantos itens deste tipo já existem no perfil ativo.
   * `ym` só vale para o que é contado por mês: lançar no dia 3 de
   * outubro estando com setembro na barra do topo precisa consultar
   * OUTUBRO, senão o app barra um mês que está vazio e libera um que
   * está cheio.
   */
  Limites.contar = function (tipo, ym) {
    const p = Store.profile();
    if (!p) return 0;
    switch (Planos.chave(tipo)) {
      case 'workspaces': return Store.state().profiles.length;
      /* Lançamentos são contados POR MÊS, e pelo mês que está na
         tela — não pelo total do perfil. O limite do brief é "até
         100 movimentações por mês": um teto sobre o acervo inteiro
         seria outro produto, e travaria alguém no segundo ano de
         uso por causa do primeiro. */
      case 'transactions_per_month': {
        const mes = ym || (global.App && App.ym) || U.todayYM();
        return (p.transactions || []).filter((t) => U.ymOf(t.date) === mes).length;
      }
      case 'accounts': return (p.accounts || []).length;
      case 'credit_cards': return (p.cards || []).length;
      case 'budgets': return Object.keys(p.budgets || {}).length;
      case 'goals': return (p.goals || []).length;
      case 'recurring_items': return (p.transactions || []).filter((t) => t.recurring).length;
      case 'custom_categories': {
        /* Só as que a pessoa criou contam. As que vêm prontas não
           deveriam consumir a cota de "personalizadas" — cobrar por
           elas seria cobrar pelo padrão do produto. */
        const padrao = new Set((Store.CATEGORIAS_PADRAO || []).concat(Store.CATEGORIAS_PADRAO_PT || []));
        return (p.categories || []).filter((c) => !padrao.has(c.name)).length;
      }
      default: return 0;
    }
  };

  /** Ainda cabe mais um? `ym` como em contar(). */
  Limites.cabe = function (tipo, ym) {
    const teto = Limites.limite(tipo);
    if (teto === null) return true;
    return Limites.contar(tipo, ym) < teto;
  };


  Limites.uso = function (tipo, ym) {
    return { usado: Limites.contar(tipo, ym), limite: Limites.limite(tipo) };
  };

  /* ---------------- explicação ---------------- */

  const NOMES = {
    workspaces: ['espaço financeiro', 'espaços financeiros'],
    transactions_per_month: ['movimentação neste mês', 'movimentações neste mês'],
    accounts: ['conta', 'contas'],
    credit_cards: ['cartão de crédito', 'cartões de crédito'],
    custom_categories: ['categoria personalizada', 'categorias personalizadas'],
    budgets: ['orçamento', 'orçamentos'],
    goals: ['meta', 'metas'],
    recurring_items: ['recorrência', 'recorrências']
  };

  /** O próximo plano que resolve este limite — se houver. */
  function proximoQueResolve(nome) {
    const tipo = Planos.chave(nome);
    const atual = Planos.IDS.indexOf(direitos.plano);
    for (let i = atual + 1; i < Planos.LISTA.length; i++) {
      const p = Planos.LISTA[i];
      const v = p.limites[tipo];
      if (v === null || v > (Limites.limite(tipo) || 0)) return p;
    }
    return null;
  }

  /* =============================================================
     QUEM DECIDE É ESTE ARQUIVO; QUEM MOSTRA É A INTERFACE
     -------------------------------------------------------------
     Antes, as duas funções abaixo montavam um modal com o UI do
     painel anterior. Com aquele painel apagado, a chamada quebraria
     no meio de uma ação — e justo numa ação que já ia parar, o que
     a pessoa leria como "não acontece nada" em vez de "o plano não
     cobre isto". Silêncio é a pior resposta possível a um limite.

     Agora o módulo decide e DESCREVE; quem desenha é a interface,
     pelo gancho Limites.avisar. O padrão é o alerta do navegador:
     feio, mas nunca silencioso — se alguém esquecer de ligar a
     própria tela, o aviso aparece mesmo assim.
     ============================================================= */
  Limites.avisar = function (aviso) {
    try { global.alert([aviso.titulo, ''].concat(aviso.linhas).join('\n')); }
    catch (e) { console.warn('Limites:', aviso.titulo, aviso.linhas.join(' ')); }
  };

  Limites.exigirEspaco = function (chave, ym) {
    const tipo = Planos.chave(chave);
    if (Limites.cabe(tipo, ym)) return true;

    const teto = Limites.limite(tipo);
    const nome = NOMES[tipo] || ['item', 'itens'];
    const planoAtual = Planos.get(direitos.plano);
    /* "neste mês" mentiria quando o mês cheio é outro: quem está
       olhando setembro e lança em outubro precisa ler "de outubro
       de 2026". E o fecho da frase muda junto — um teto mensal não
       é uma cota "disponível no plano", é o máximo de um mês. */
    const porMes = ym && nome[1].indexOf('neste mês') >= 0;
    const plural = (teto === 1 ? nome[0] : nome[1])
      .replace('neste mês', porMes ? 'de ' + U.monthLabel(ym) : 'neste mês');
    const fecho = porMes
      ? ' — o máximo que o plano ' + planoAtual.nome + ' permite em um mês.'
      : ' disponíveis no plano ' + planoAtual.nome + '.';
    const prox = proximoQueResolve(tipo);

    const linhas = [
      /* O uso real, não o teto repetido: quem tem 2 espaços num plano
         que permite 1 lia "usando 1 de 1" e achava que o app errou. */
      'Você está usando ' + Math.max(teto, Limites.contar(tipo, ym)) + ' de ' + teto + ' ' + plural + fecho
    ];
    if (prox) {
      linhas.push('No ' + prox.nome + ', você pode cadastrar '
        + (prox.limites[tipo] === null ? 'quantos quiser' : 'até ' + prox.limites[tipo]) + '.');
    }
    linhas.push('Nada foi apagado, e o resto do app continua funcionando. Você também pode excluir um dos que já existem para abrir espaço.');

    Limites.avisar({
      titulo: 'Limite do plano ' + planoAtual.nome,
      linhas: linhas,
      /* Para onde ir depois de entender. Sem esta porta, fechar o
         aviso era um beco sem saída: a pessoa sabia do teto e não
         tinha o que fazer com a informação. */
      verPlanos: !!prox
    });
    return false;
  };

  /** Mesma ideia, para recurso que é sim-ou-não. */
  Limites.exigirRecurso = function (nome, oQueEra) {
    const recurso = Planos.chave(nome);
    if (Limites.pode(recurso)) return true;

    const prox = Planos.LISTA.find((p) =>
      Planos.IDS.indexOf(p.id) > Planos.IDS.indexOf(direitos.plano) && p.recursos[recurso]);
    const planoAtual = Planos.get(direitos.plano);

    const linhas = [oQueEra + ' não está incluído no plano ' + planoAtual.nome + '.'];
    if (prox) linhas.push('Está disponível a partir do ' + prox.nome + '.');
    linhas.push('Seus dados continuam intactos e o resto do app segue funcionando normalmente.');

    Limites.avisar({ titulo: 'Disponível em outro plano', linhas: linhas, verPlanos: !!prox });
    return false;
  };

  /* A BARRA DE CONSUMO SAIU DAQUI
     Ela montava DOM com o ajudante do painel anterior, e só a tela
     de limites daquele painel a usava. A V3 desenha o próprio
     consumo, com os mesmos números pedidos a Limites.contar e
     Limites.limite — o dado continua vindo de um lugar só. */

  /* ---------------- ciclo ---------------- */

  Limites.aoEntrar = async function () {
    await Limites.carregar();
    /* O assistente flutuante depende de um DIREITO, e o direito só
       é conhecido depois desta carga. Sincronizar aqui é o que faz
       um upgrade aparecer na hora, sem recarregar a página — quem
       acabou de pagar não deveria ter que dar F5 para ver o que
       comprou. */
    /* A interface se redesenha sozinha quando os direitos chegam:
       antes era este módulo que mandava três telas do painel
       anterior se repintarem, uma a uma e por nome. */
    if (typeof Limites.aoMudar === 'function') Limites.aoMudar();
  };

  Limites.aoSair = function () {
    direitos = PADRAO;
    consumoIA = { usado: 0, limite: PADRAO.limites.ai_queries_per_month };
    if (typeof Limites.aoMudar === 'function') Limites.aoMudar();
  };

  global.Limites = Limites;
})(window);
