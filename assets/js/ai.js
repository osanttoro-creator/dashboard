/* =============================================================
   ai.js — o UGLEZ, do lado do navegador
   ------------------------------------------------------------
   UM ÚNICO CAMINHO:

     navegador → Edge Function oaze-assistant → OpenAI

   Não existe mais chamada direta a provedor de IA a partir daqui,
   e não existe mais campo para o usuário guardar uma chave. As
   duas coisas saíram de propósito.

   Chave de IA no navegador é chave publicada: qualquer pessoa
   abre o DevTools, copia do localStorage e passa a gastar na
   conta de quem colou. Guardar num campo "só meu" não muda isso —
   o navegador é território do usuário, e o que está lá está
   exposto.

   O QUE ESTE ARQUIVO MANDA
   A pergunta, o mês e um resumo AGREGADO — totais, categorias
   consolidadas, metas e compromissos agrupados por dia. Nunca a
   lista de lançamentos, suas descrições, identificador interno ou
   outro perfil.

   O QUE ELE NÃO DECIDE
   Modelo, prompt de sistema e teto de tokens. Isso é do servidor.
   Se o cliente pudesse escolher, o prompt de sistema deixaria de
   ser garantia e viraria sugestão.

   SEM CONTA, SEM UGLEZ. É consequência da arquitetura, não regra
   comercial: a função exige sessão para saber de quem é o limite.
   ============================================================= */
(function (global) {
  'use strict';

  const AI = {};

  const FUNCAO = 'oaze-assistant';

  /* Chave antiga do formato anterior. Só existe aqui para ser
     APAGADA — ver AI.init(). */
  const CHAVE_ANTIGA = 'financas.anthropicKey';

  let busy = false;

  /**
   * Como o UGLEZ vai responder agora. Usado nas Configurações e na
   * página do UGLEZ para explicar o estado sem prometer nada.
   */
  AI.modo = function () {
    if (!global.Sync || !Sync.isConfigured()) {
      return { chave: 'sem-nuvem', rotulo: 'Indisponível — sem conta configurada' };
    }
    /* A sessão ainda está sendo restaurada: não é "sem sessão", é
       "ainda não sei". Tratar as duas como a mesma coisa fazia o
       UGLEZ pedir login por um instante a cada abertura, para quem
       já estava logado. */
    if (Sync.restaurando && Sync.restaurando()) {
      return { chave: 'restaurando', rotulo: 'Verificando sua conta…' };
    }
    if (!Sync.currentUser()) {
      return { chave: 'sem-sessao', rotulo: 'Entre na sua conta para usar' };
    }
    return { chave: 'servidor', rotulo: 'Servidor seguro (chave protegida)' };
  };

  /** As categorias de dado que saem daqui — mostradas ao usuário. */
  AI.CATEGORIAS_ENVIADAS = [
    'Mês e ano selecionados, e o alcance escolhido (mês, ano ou tudo)',
    'Total de receitas, despesas e saldo do mês',
    'Gastos consolidados por categoria',
    'Metas e quanto já foi guardado',
    'Compromissos previstos, agrupados por dia',
    'Carteira de investimentos agregada: aportado, valor atual, rendimento e distribuição por tipo',
    'Totais do ano: confirmado, previsto, média mensal e categorias que mais pesaram',
    'Mês a mês: receitas, despesas, fixas e as cinco maiores categorias',
    'As três últimas perguntas e respostas desta conversa'
  ];

  /* ============================================================
     1 · O QUE SAI DAQUI
     ------------------------------------------------------------
     Existia aqui um AI.buildSummary() de ~110 linhas que montava
     um relatório em markdown com NOME DE CONTA, NOME DE CARTÃO,
     saldo por conta, limite de cada cartão e a lista de
     lançamentos pendentes um a um.

     Ele foi REMOVIDO, e não apenas desligado. Ninguém o chamava —
     o caminho real é AI.resumoAgregado(), logo abaixo — mas
     código morto que já sabe montar um dossiê completo é um
     convite: basta alguém precisar de "mais contexto" um dia,
     achar a função pronta e ligá-la de volta. A tela promete ao
     usuário que só sai agregado, e a forma de manter essa
     promessa é não haver, no navegador, uma função capaz de
     quebrá-la.
     ============================================================ */


  /* ============================================================
     1b · O RESUMO QUE REALMENTE VAI PARA O SERVIDOR
     ------------------------------------------------------------
     ISTO ESTAVA FALTANDO, E ERA A FALHA QUE QUEBRAVA O UGLEZ
     INTEIRO. AI.ask() chamava AI.resumoAgregado() e a função não
     existia em lugar nenhum do projeto: toda pergunta estourava um
     TypeError antes de sair do navegador, e o catch genérico
     traduzia isso para "Não foi possível falar com o assistente.
     Verifique a conexão" — uma mensagem que manda a pessoa olhar
     para o roteador por causa de uma função ausente. O botão "O que
     é enviado" morria pelo mesmo motivo.

     O relatório em markdown que existia acima (ver a seção 1) não
     serviria como substituto, e a diferença não é de formato:

       · a Edge Function valida um OBJETO com campos declarados, e
         descarta tudo que não está no schema — um texto corrido
         chegaria como `resumo: undefined`;
       · o brief e a tela prometem que só sai agregado. Mandar
         nomes de conta quebraria essa promessa em silêncio.

     Então este é o contrato, e ele é curto de propósito: totais,
     categorias consolidadas, metas e compromissos agrupados por
     dia. Mais nada.
     ============================================================ */

  /**
   * O histórico mensal que acompanha a pergunta.
   *
   * O cliente MANDA e o servidor PODA: a Edge Function corta pelo
   * que o plano autoriza (o Grátis recebe zero meses de comparação,
   * o Pro recebe até 60). Mandar daqui o horizonte cheio e deixar o
   * corte no servidor é o que impede um plano de ser destravado
   * pelo DevTools — se a poda fosse aqui, bastaria editar o número.
   */
  /* ============================================================
     A UGLEZ LÊ O ANO, NÃO SÓ O MÊS
     ------------------------------------------------------------
     Até 15/09/2026 o histórico eram onze meses ANTERIORES, só com
     três totais, e o mês seguinte não existia para ela: perguntar
     "como vai ser o resto do ano?" recebia de volta o mês corrente.

     Agora cada mês leva também o que está PREVISTO (fixas e
     lançamentos ainda não confirmados), o peso das fixas e as cinco
     maiores categorias — tudo agregado, nenhuma descrição. A ordem
     importa: o servidor corta pelo plano a partir do começo da lista,
     então primeiro vêm os doze meses do ano exibido e depois os
     anteriores, do mais recente para o mais antigo.
     ============================================================ */
  AI.historico = function (ym, mesesAntes) {
    const base = ym || App.ym;
    const ano = U.ymParts(base).y;
    const doAno = U.monthRange(`${ano}-01`, `${ano}-12`);
    const antes = U.monthRange(U.addMonths(`${ano}-01`, -(mesesAntes || 12)), U.addMonths(`${ano}-01`, -1)).reverse();

    const mes = (periodo) => {
      const t = Calc.monthTotals(periodo);
      if (!t.entries.length) return null;
      let categorias = [];
      try {
        categorias = Calc.categoryTotals('expense', U.monthStart(periodo), U.monthEnd(periodo))
          .slice(0, 5).map((c) => ({ nome: c.name, total: U.round2(c.total) }));
      } catch (e) { /* segue sem categorias */ }
      const fixas = t.entries.filter((e) => e.recurring && e.kind === 'expense');
      return {
        periodo,
        receitas: U.round2(t.income),
        despesas: U.round2(t.expense),
        saldo: U.round2(t.balance),
        previstoReceitas: U.round2(t.plannedIncome),
        previstoDespesas: U.round2(t.plannedExpense),
        fixas: U.round2(U.sum(fixas, (e) => e.amount)),
        categorias
      };
    };

    try {
      return doAno.concat(antes).map(mes).filter(Boolean);
    } catch (e) { return []; }
  };

  /**
   * O ano exibido inteiro, em poucos números. Vai para todos os
   * planos: é um resumo, não uma série de comparação.
   */
  AI.resumoDoAno = function (ym) {
    const ano = U.ymParts(ym || App.ym).y;
    const meses = U.monthRange(`${ano}-01`, `${ano}-12`).map((periodo) => ({ periodo, t: Calc.monthTotals(periodo) }));
    const comDado = meses.filter((m) => m.t.entries.length);
    const r = {
      ano,
      receitas: U.round2(U.sum(meses, (m) => m.t.income)),
      despesas: U.round2(U.sum(meses, (m) => m.t.expense)),
      previstoReceitas: U.round2(U.sum(meses, (m) => m.t.plannedIncome)),
      previstoDespesas: U.round2(U.sum(meses, (m) => m.t.plannedExpense)),
      mesesComDados: comDado.length,
      categorias: []
    };
    r.saldo = U.round2(r.receitas - r.despesas);
    r.mediaDespesas = comDado.length ? U.round2(U.sum(comDado, (m) => m.t.plannedExpense) / comDado.length) : 0;
    const porGasto = comDado.slice().sort((a, b) => b.t.plannedExpense - a.t.plannedExpense);
    if (porGasto.length) {
      r.maiorGasto = { periodo: porGasto[0].periodo, total: U.round2(porGasto[0].t.plannedExpense) };
      const ultimo = porGasto[porGasto.length - 1];
      r.menorGasto = { periodo: ultimo.periodo, total: U.round2(ultimo.t.plannedExpense) };
    }
    try {
      r.categorias = Calc.categoryTotals('expense', `${ano}-01-01`, `${ano}-12-31`)
        .slice(0, 8).map((c) => ({ nome: c.name, total: U.round2(c.total) }));
    } catch (e) { /* segue sem categorias */ }
    return r;
  };

  /* A conversa volta junto, curta: as três últimas trocas, cada
     resposta cortada em 600 caracteres. Sem isso, "e no mês
     seguinte?" não teria a que se referir. */
  AI.conversaRecente = function () {
    const lista = global.Ug && Ug.trocas ? Ug.trocas() : [];
    return lista.filter((c) => c.resposta).slice(-3).map((c) => ({
      pergunta: String(c.pergunta).slice(0, 500),
      resposta: String(c.resposta).slice(0, 600)
    }));
  };

  /** Tudo o que sai numa pergunta — a mesma função serve ao envio e à tela "Dados usados". */
  AI.corpoDaPergunta = function (pergunta, mesExibido) {
    const periodo = mesExibido || App.ym;
    return {
      pergunta,
      periodo,
      escopo: global.Ug && Ug.escopo ? Ug.escopo() : 'mes',
      resumo: AI.resumoAgregado(periodo),
      dividas: AI.resumoDividas(),
      ano: AI.resumoDoAno(periodo),
      /* O histórico vai sempre; quem decide se ele CHEGA ao modelo
         é a Edge Function, pelo plano. Ver AI.historico. */
      historico: AI.historico(periodo),
      conversa: AI.conversaRecente(),
      /* A resposta vem na língua da tela. É só a chave ('en'); o nome
         da língua que entra nas instruções é escrito no servidor. */
      idioma: (global.I18n && global.I18n.lang) || 'pt'
    };
  };

  /* Totais simples não precisam de um modelo para fazer aritmética.
     Esta consulta usa a mesma fonte do painel e nunca consome cota de IA. */
  AI.consultaMesPassado = function (pergunta) {
    const q = U.norm(String(pergunta || ''));
    if (!/\b(mes passado|mes anterior)\b/.test(q) || !/\b(total|receitas?|despesas?|saldo|entrou|saiu)\b/.test(q)) return null;
    if (/\b(compar\w*|por que|porque|previs\w*|projec\w*|categoria\w*|conta\w*|cartao\w*|comprei|compra\w*|gastei|paguei|lance\w*|registr\w*|adicione\w*|salv\w*)\b/.test(q)) return null;
    const periodo = U.addMonths(U.todayYM(), -1);
    const totais = Calc.monthTotals(periodo);
    const comDados = (totais.entries || []).some((e) => e.confirmed && e.contaNosTotais !== false && ['income','expense'].includes(e.kind));
    return { periodo, comDados, receitas: totais.income, despesas: totais.expense, saldo: totais.balance };
  };

  /**
   * O resumo agregado do mês exibido. Um objeto, e só com o que a
   * função do servidor declara aceitar.
   *
   * NENHUM IDENTIFICADOR SAI DAQUI. Categoria e meta viajam pelo
   * NOME, nunca pelo id: o nome é o que o modelo precisa para
   * escrever uma frase legível, e o id só serviria para religar
   * essa resposta a um registro nosso do lado de lá.
   */
  AI.resumoAgregado = function (ym) {
    const periodo = ym || App.ym;
    const prof = Store.profile();
    const t = Calc.monthTotals(periodo);

    /* Só CONFIRMADOS entram nos totais, igual ao resto do app. Se a
       IA somasse os previstos e o painel não, os dois dariam
       números diferentes para a mesma pergunta — e a pessoa
       acreditaria no errado. */
    const resumo = {
      receitas: U.round2(t.income),
      despesas: U.round2(t.expense),
      saldo: U.round2(t.balance),
      categorias: [],
      metas: [],
      compromissos: [],
      investimentos: {
        quantidade: 0, aportado: 0, valorAtual: 0, rendimento: 0, porTipo: []
      }
    };

    try {
      resumo.categorias = Calc
        .categoryTotals('expense', U.monthStart(periodo), U.monthEnd(periodo))
        .map((c) => ({ nome: c.name, total: U.round2(c.total) }));
    } catch (e) { /* sem categorias, o resumo continua válido */ }

    try {
      resumo.metas = (prof.goals || []).map((g) => ({
        nome: g.name,
        alvo: U.round2(g.target),
        guardado: U.round2(g.saved)
      }));
    } catch (e) { /* idem */ }

    try {
      /* Compromissos = despesas previstas ainda não confirmadas,
         agregadas por dia. O modelo recebe quantidade e total, mas
         nunca a descrição nem a data completa de um lançamento. */
      const porDia = new Map();
      (t.entries || [])
        .filter((e) => !e.confirmed && e.kind === 'expense')
        .forEach((e) => {
          const dia = +String(e.date).slice(8, 10) || 1;
          const atual = porDia.get(dia) || { dia: dia, quantidade: 0, total: 0 };
          atual.quantidade += 1;
          atual.total = U.round2(atual.total + (+e.amount || 0));
          porDia.set(dia, atual);
        });
      resumo.compromissos = Array.from(porDia.values()).sort((a, b) => a.dia - b.dia);
    } catch (e) { /* idem */ }

    try {
      const at = U.monthEnd(periodo);
      const porTipo = {};
      const investimentos = (prof.investments || []).filter((i) => i.date <= at);
      investimentos.forEach((i) => {
        const tipo = i.type || 'Outro';
        porTipo[tipo] = U.round2((porTipo[tipo] || 0) + Calc.investmentValueAt(i, at));
      });
      const aportado = Calc.contributedTotal(at);
      const valorAtual = Calc.investedTotal(at);
      resumo.investimentos = {
        quantidade: investimentos.length,
        aportado: U.round2(aportado),
        valorAtual: U.round2(valorAtual),
        rendimento: U.round2(valorAtual - aportado),
        porTipo: Object.keys(porTipo).map((tipo) => ({ tipo, total: porTipo[tipo] }))
          .sort((a, b) => b.total - a.total)
      };
    } catch (e) { /* segue com carteira zerada */ }

    return resumo;
  };

  /**
   * Retrato temporal para uma análise de dívidas. Não manda nomes de
   * contas, cartões, estabelecimentos ou descrições: o modelo recebe
   * apenas aliases e valores agregados. O OAZE ainda não cadastra o
   * CET de empréstimos; ausência de taxa é declarada, nunca vira zero.
   */
  AI.resumoDividas = function () {
    const prof = Store.profile();
    const hoje = U.todayISO();
    const atual = U.todayYM();
    const mesesPassados = U.monthRange(U.addMonths(atual, -6), U.addMonths(atual, -1));
    const mesesFuturos = U.monthRange(atual, U.addMonths(atual, 5));
    const mensal = (periodo) => {
      const t = Calc.monthTotals(periodo, prof);
      return {
        periodo,
        receitas: U.round2(t.income),
        despesas: U.round2(t.expense),
        saldo: U.round2(t.balance),
        saldoCaixa: U.round2(t.saldoCaixa),
        previstoReceitas: U.round2(t.plannedIncome),
        previstoDespesas: U.round2(t.plannedExpense)
      };
    };
    const passado = mesesPassados.map(mensal);
    const comMovimento = passado.filter((m) => m.receitas || m.despesas);
    const media = (campo) => comMovimento.length
      ? U.round2(U.sum(comMovimento, (m) => m[campo]) / comMovimento.length) : null;
    const ate = U.monthEnd(U.addMonths(atual, 5));
    const desde = Calc.earliestDate(prof);
    const entries = Calc.entries(desde, ate, prof).filter((e) => e.contaNosTotais !== false);
    const faturas = [];
    const parcelas = new Map();
    (prof.cards || []).filter((card) => card.considerado !== false).forEach((card, indice) => {
      /* A referência vem das compras registradas, inclusive antigas e parcelas
         posteriores aos seis meses. Uma janela fixa perderia dívida vencida. */
      const refs = new Set();
      (prof.transactions || []).filter((tx) => tx.kind === 'expense' && tx.cardId === card.id && !tx.recurring)
        .forEach((tx) => { if (U.isValidISO(tx.date)) refs.add(Calc.invoiceRefOfDate(card, tx.date)); });
      entries.filter((e) => e.kind === 'expense' && e.cardId === card.id && e.recurring)
        .forEach((e) => refs.add(Calc.invoiceRefOfDate(card, e.date)));
      Object.keys(prof.invoices || {}).forEach((key) => {
        const [id, ref] = key.split('|');
        if (id === card.id && /^\d{4}-(0[1-9]|1[0-2])$/.test(ref)) refs.add(ref);
      });
      Array.from(refs).sort().forEach((ref) => {
        const inv = Calc.invoice(card.id, ref, prof);
        if (!inv) return;
        const registro = (prof.invoices || {})[Store.invoiceKey(card.id, ref)];
        if (registro && registro.quitada) return;
        /* restante no Calc inclui o previsto. Aqui pagamentos e adiantamentos
           realizados abatem primeiro as compras confirmadas; o restante futuro
           continua identificado como previsão. Pagamento agendado não é pago. */
        const pagou = U.sum(inv.pagamentos.filter((p) => p.at <= hoje), (p) => +p.amount || 0);
        let realizado = 0, previsto = 0;
        inv.items.forEach((item) => {
          const ad = inv.adiantamentos[item.key];
          const adiantado = ad && ad.at <= hoje ? +ad.amount || 0 : 0;
          const restante = Math.max(0, (+item.amount || 0) - adiantado);
          if (item.confirmed) realizado += restante; else previsto += restante;
        });
        const saldo = U.round2(Math.max(0, realizado - pagou));
        const previsao = U.round2(Math.max(0, previsto - Math.max(0, pagou - realizado)));
        if (saldo <= 0 && previsao <= 0) return;
        let pagamentoAAlocar = pagou;
        inv.items.slice().sort((a, b) => Number(b.confirmed) - Number(a.confirmed)).forEach((item) => {
          const ad = inv.adiantamentos[item.key];
          const adiantado = ad && ad.at <= hoje ? +ad.amount || 0 : 0;
          const itemRestante = Math.max(0, (+item.amount || 0) - adiantado);
          const restante = Math.max(0, itemRestante - pagamentoAAlocar);
          pagamentoAAlocar = Math.max(0, pagamentoAAlocar - itemRestante);
          if (!item.installment || restante <= 0) return;
          const key = card.id + '|' + (item.installment.groupId || item.txId);
          const grupo = parcelas.get(key) || { parcelasRestantes: 0 };
          grupo.parcelasRestantes += 1;
          parcelas.set(key, grupo);
        });
        faturas.push({
          origem: 'Cartão ' + (indice + 1),
          referencia: inv.ref,
          saldo,
          previsto: previsao,
          vencimento: inv.dueDate,
          vencida: inv.dueDate < hoje && saldo > 0,
          pagamentoParcial: (pagou > 0 || inv.pagoAdiantado > 0) && saldo > 0,
          taxaOuCET: null,
          pagamentoMinimo: null
        });
      });
    });
    faturas.sort((a, b) => Number(b.vencida) - Number(a.vencida) || a.vencimento.localeCompare(b.vencimento));

    /* Pendência no débito não prova obrigação contraída: pode ser apenas uma
       previsão ainda não ocorrida. Agrupar os vencidos preserva todo o passado
       sem expor descrições nem aumentar indefinidamente o contexto. Crédito já
       está nas faturas e não é somado de novo aqui. */
    const pendentes = entries.filter((e) => e.kind === 'expense' && !e.confirmed && e.method !== 'card');
    const porMes = new Map();
    pendentes.forEach((e) => {
      const periodo = e.date < hoje ? 'vencidos' : U.ymOf(e.date);
      const item = porMes.get(periodo) || { periodo, quantidade: 0, total: 0 };
      item.quantidade += 1; item.total = U.round2(item.total + (+e.amount || 0));
      porMes.set(periodo, item);
    });
    const caixa = (() => { try { return U.round2(Calc.totalAccountsBalance(hoje, prof)); } catch { return null; } })();
    const divida = U.round2(U.sum(faturas, (item) => item.saldo));
    const previsto = U.round2(U.sum(faturas, (item) => item.previsto) + U.sum(pendentes, (e) => +e.amount || 0));

    return {
      versao: 2,
      dataReferencia: hoje,
      caixaDisponivel: caixa,
      saldoAposDividaConfirmada: caixa === null ? null : U.round2(caixa - divida),
      historico: {
        meses: passado,
        mesesComMovimento: comMovimento.length,
        mediaReceitas: media('receitas'),
        mediaDespesas: media('despesas'),
        mediaSobra: comMovimento.length ? U.round2(media('receitas') - media('despesas')) : null,
        mediaSobraCaixa: media('saldoCaixa')
      },
      futuro: mesesFuturos.map(mensal),
      faturas: faturas.slice(0, 8),
      cobertura: { desde, fluxoAte: ate, totalFaturas: faturas.length,
        faturasOmitidas: Math.max(0, faturas.length - 8),
        saldoOmitido: U.round2(U.sum(faturas.slice(8), (f) => f.saldo)),
        previstoOmitido: U.round2(U.sum(faturas.slice(8), (f) => f.previsto)) },
      compromissosPendentes: Array.from(porMes.values()),
      parcelamentos: {
        quantidade: parcelas.size,
        parcelasRestantes: U.sum(Array.from(parcelas.values()), (g) => g.parcelasRestantes),
        incluidoNasFaturas: true
      },
      totalDividaConfirmada: divida,
      totalCompromissosPrevistos: previsto,
      totalObrigacoesMapeadas: U.round2(divida + previsto),
      dadosAusentes: [
        'taxa de juros ou CET das obrigações',
        'saldo devedor de empréstimos externos não cadastrados',
        'pagamento mínimo, despesas essenciais e capacidade mensal de quitação',
        'condições reais de renegociação'
      ],
      limites: 'Caixa é saldo em contas, antes de descontar crédito. Sobra histórica não é capacidade de quitação. Pendências no débito exigem confirmação de obrigação. Previsões e parcelas já estão nos agregados, não some novamente. Ausência de empréstimo cadastrado não significa ausência de dívida.'
    };
  };

  /* ============================================================
     DAQUI PARA BAIXO ERA O UGLEZ, A CONVERSA DO PAINEL ANTERIOR
     ------------------------------------------------------------
     Este arquivo tinha 844 linhas e duas naturezas: o PREPARO do
     que é enviado ao servidor — agregados, janela de meses,
     conversa curta — e a TELA de conversa do painel anterior, com
     bolhas, modal, markdown e proposta de lançamento desenhada em
     DOM.

     A V3 usa a primeira metade e tem a sua própria Coco para a
     segunda. Com o painel anterior apagado, a tela daqui ficou
     chamando UI, Forms e Store de um jeito que não existe mais:
     código morto que ainda parece vivo é o pior tipo, porque o dia
     em que alguém o chamar o erro não vai apontar para cá.
     ============================================================ */

  /**
   * A chamada. O token da sessão vai no Authorization; a plataforma
   * do Supabase valida antes de a função rodar, e a função valida
   * de novo por dentro.
   */
  AI.chamarFuncao = async function (corpo) {
    const cfg = global.SupabaseConfig || {};
    const base = String(cfg.url || '').replace(/\/+$/, '');
    const chave = String(cfg.publishableKey || cfg.anonKey || '');
    if (!base || !chave) return { erro: 'indisponivel', mensagem: 'Assistente não configurado.' };

    const sessao = await AI.tokenDaSessao();
    if (!sessao) return { erro: 'sem_sessao' };

    const r = await fetch(base + '/functions/v1/' + FUNCAO, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: chave,
        authorization: 'Bearer ' + sessao
      },
      body: JSON.stringify(corpo)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok && !j.erro) j.erro = r.status === 401 ? 'sem_sessao' : 'indisponivel';
    return j;
  };

  /** O access token atual, direto do SDK — nunca guardado por nós. */
  AI.tokenDaSessao = async function () {
    try {
      const c = global.SupabaseBackend && SupabaseBackend.cliente && SupabaseBackend.cliente();
      if (!c) return null;
      const { data } = await c.auth.getSession();
      return (data && data.session && data.session.access_token) || null;
    } catch (e) { return null; }
  };

  global.AI = AI;
})(window);
