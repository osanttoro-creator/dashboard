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
  const el = U.el;

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
  AI.corpoDaPergunta = function (pergunta) {
    return {
      pergunta,
      periodo: App.ym,
      escopo: global.Ug && Ug.escopo ? Ug.escopo() : 'mes',
      resumo: AI.resumoAgregado(),
      ano: AI.resumoDoAno(),
      /* O histórico vai sempre; quem decide se ele CHEGA ao modelo
         é a Edge Function, pelo plano. Ver AI.historico. */
      historico: AI.historico(),
      conversa: AI.conversaRecente()
    };
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

  /* ============================================================
     1c · AÇÃO PROPOSTA, NUNCA AÇÃO SILENCIOSA
     ------------------------------------------------------------
     A função pode reconhecer "gastei 50 reais..." e devolver
     campos estruturados. Quem resolve o nome da conta/cartão é este
     navegador — os nomes da carteira não saem para a IA — e quem
     grava continua sendo o formulário oficial, depois de um clique.
     ============================================================ */

  function normalizarNome(v) {
    return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function encontrarOrigem(lista, nome) {
    const alvo = normalizarNome(nome);
    if (!alvo) return null;
    const itens = (lista || []).map((i) => ({ item: i, nome: normalizarNome(i.name) }));
    const exato = itens.find((i) => i.nome === alvo);
    if (exato) return exato.item;
    const proximos = itens.filter((i) => i.nome.includes(alvo) || alvo.includes(i.nome));
    return proximos.length === 1 ? proximos[0].item : null;
  }

  function encontrarCategoria(tipo, nome) {
    const alvo = normalizarNome(nome);
    if (!alvo) return null;
    const lista = (Store.profile().categories || []).filter((c) => c.kind === tipo);
    return lista.find((c) => normalizarNome(c.name) === alvo) || null;
  }

  function acaoValida(bruta) {
    if (!bruta || (bruta.tipo !== 'expense' && bruta.tipo !== 'income')) return null;
    if (bruta.forma_pagamento !== 'card' && bruta.forma_pagamento !== 'account') return null;
    if (bruta.tipo === 'income' && bruta.forma_pagamento === 'card') return null;
    const valor = Number(bruta.valor);
    if (!Number.isFinite(valor) || valor <= 0 || !U.isValidISO(String(bruta.data || ''))) return null;
    const descricao = String(bruta.descricao || '').trim().slice(0, 90);
    if (!descricao) return null;
    return {
      tipo: bruta.tipo,
      descricao,
      valor: Math.round(Math.abs(valor) * 100) / 100,
      data: String(bruta.data),
      forma_pagamento: bruta.forma_pagamento,
      origem: String(bruta.origem || '').trim().slice(0, 60),
      categoria: bruta.categoria == null ? '' : String(bruta.categoria).trim().slice(0, 40),
      confirmado: bruta.confirmado === true
    };
  }

  function renderAcaoProposta(bruta) {
    const a = acaoValida(bruta);
    if (!a) return null;
    const prof = Store.profile();
    const listaOrigem = a.forma_pagamento === 'card' ? prof.cards : prof.accounts;
    const origem = encontrarOrigem(listaOrigem, a.origem);
    const categoria = encontrarCategoria(a.tipo, a.categoria);
    const nomeOrigem = origem ? origem.name : (a.origem || 'Selecionar no formulário');

    const abrirFormulario = () => {
      if (a.forma_pagamento === 'card' && !prof.cards.length) {
        UI.toast('Cadastre o cartão antes de revisar este lançamento.', 'error');
        App.goTo('accounts', { tab: 'cards' });
        return;
      }
      if (a.forma_pagamento === 'account' && !prof.accounts.length) {
        UI.toast('Cadastre a conta antes de revisar este lançamento.', 'error');
        App.goTo('accounts', { tab: 'accounts' });
        return;
      }
      Forms.openTransaction(a.tipo, null, {
        description: a.descricao,
        amount: a.valor,
        date: a.data,
        method: a.forma_pagamento,
        accountId: a.forma_pagamento === 'account' && origem ? origem.id : null,
        cardId: a.forma_pagamento === 'card' && origem ? origem.id : null,
        categoryId: categoria ? categoria.id : null,
        confirmed: a.confirmado,
        requireOrigin: !origem,
        source: 'uglez'
      });
    };

    return el('section', { class: 'uglez-proposta', 'aria-label': 'Lançamento preparado pelo UGLEZ' }, [
      el('div', { class: 'uglez-proposta-topo' }, [
        el('span', { class: 'uglez-proposta-sinal' }, [Icons.lucide('receipt-text', 16)]),
        el('div', {}, [
          el('strong', { text: a.tipo === 'income' ? 'Receita preparada' : 'Despesa preparada' }),
          el('span', { text: 'Revise antes de salvar' })
        ])
      ]),
      el('dl', { class: 'uglez-proposta-dados' }, [
        el('div', {}, [el('dt', { text: 'Descrição' }), el('dd', { text: a.descricao })]),
        el('div', {}, [el('dt', { text: 'Valor' }), el('dd', { text: U.fmtBRL(a.valor) })]),
        el('div', {}, [el('dt', { text: 'Data' }), el('dd', { text: U.fmtDateBR(a.data) })]),
        el('div', {}, [el('dt', { text: a.forma_pagamento === 'card' ? 'Cartão' : 'Conta' }), el('dd', { text: nomeOrigem })])
      ]),
      !origem ? el('p', {
        class: 'uglez-proposta-aviso',
        text: 'Não encontrei essa origem com segurança. Escolha a conta ou o cartão no formulário.'
      }) : null,
      el('p', { class: 'uglez-proposta-seguranca', text: 'Nada será salvo até você confirmar no formulário.' }),
      el('button', {
        class: 'btn btn-ai uglez-proposta-botao', type: 'button',
        text: 'Revisar no formulário', onclick: abrirFormulario
      })
    ].filter(Boolean));
  }

  /* ============================================================
     2 · CHAMADA À API
     ============================================================ */

  /**
   * Envia a pergunta. Um envio por vez: `busy` existe porque dois
   * cliques rápidos custariam duas chamadas pagas e devolveriam a
   * segunda por cima da primeira.
   */
  /* ============================================================
     O DESTINO DA RESPOSTA É PARÂMETRO, NÃO CONSTANTE
     ------------------------------------------------------------
     AI.ask escrevia direto em #aiAnswer e mexia em #btnAiAsk pelo
     id. Isso funcionava enquanto existia UMA caixa de conversa no
     produto inteiro. Com o assistente flutuante passa a haver duas,
     e a versão antiga faria a resposta pedida no painel flutuante
     aparecer na página do UGLEZ — atrás do painel, invisível, com o
     flutuante parado dizendo "Pensando…" para sempre.

     Então quem pergunta diz ONDE a resposta vai. AI.ask continua
     existindo com a assinatura antiga (a página e os chips a usam),
     e agora é só um atalho para AI.perguntar com o destino da
     página.
     ============================================================ */

  /**
   * @typedef {object} Destino
   * @property {HTMLElement} caixa    onde a resposta é escrita
   * @property {HTMLElement} [botao]  botão que vira "Pensando…"
   * @property {function}   [estado]  recebe 'recebendo' | 'pensando'
   *                                  | 'respondendo' | 'sucesso' | 'erro'
   *                                  — é o que move as partículas
   */

  /** O destino padrão: uma mensagem nova na conversa da página. */
  function destinoDaPagina(pergunta) {
    if (global.Ug && Ug.novaResposta) {
      const d = Ug.novaResposta(pergunta);
      if (d) {
        d.botao = document.getElementById('btnAiAsk');
        d.estado = (e) => { if (Ug.estadoParticulas) Ug.estadoParticulas(e); };
        return d;
      }
    }
    return null;
  }

  AI.ask = function (question) {
    const q = String(question || '').trim();
    if (!q || busy) return AI.perguntar(q, null);
    /* Sem sessão, a pergunta nem entra na conversa: o modal explica
       o motivo, e uma bolha órfã sem resposta pareceria defeito. */
    const modo = AI.modo();
    if (modo.chave !== 'servidor') { AI.explicarIndisponivel(modo); return Promise.resolve(); }
    return AI.perguntar(q, destinoDaPagina(q));
  };

  /**
   * Envia a pergunta e escreve a resposta no destino.
   *
   * Um envio por vez em TODO o app — `busy` é do módulo, não do
   * destino. Dois cliques rápidos (ou um na página e outro no
   * flutuante) custariam duas chamadas pagas e devolveriam a
   * segunda por cima da primeira.
   */
  AI.perguntar = async function (question, destino) {
    const q = String(question || '').trim();
    if (!q) { UI.toast('Escreva uma pergunta primeiro.', 'error'); return; }
    if (busy) return;

    const modo = AI.modo();
    if (modo.chave !== 'servidor') { AI.explicarIndisponivel(modo); return; }

    const d = destino || destinoDaPagina(q);
    if (!d || !d.caixa) return;
    const box = d.caixa;
    const sinal = d.estado || function () {};

    busy = true;
    const btn = d.botao;
    /* O botão de enviar da conversa é um ícone: trocar o texto dele
       apagaria a seta. Ele ganha o estado por classe. */
    const botaoIcone = !!(btn && btn.dataset.icone === 'sim');
    const rotuloAntes = btn && !botaoIcone ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      if (botaoIcone) btn.classList.add('is-ocupado'); else btn.textContent = 'Pensando…';
    }

    box.hidden = false;
    box.className = 'ai-answer is-loading';
    /* aria-live faz o leitor de tela anunciar a chegada da resposta
       sem que a pessoa precise sair procurando. */
    box.setAttribute('aria-live', 'polite');
    box.setAttribute('aria-busy', 'true');
    const escopo = global.Ug && Ug.escopo ? Ug.escopo() : 'mes';
    const lendo = escopo === 'mes'
      ? 'Lendo ' + U.monthLabel(App.ym)
      : escopo === 'ano' ? 'Lendo os meses de ' + U.ymParts(App.ym).y : 'Lendo o ano e os meses anteriores';
    if (d.aoCarregar) d.aoCarregar(box, lendo); else box.textContent = lendo;

    /* As partículas contam a mesma história do texto, em outro
       canal: junta o material, pensa, responde. Quem não vê a
       animação continua tendo o texto; quem não lê o texto de
       relance percebe que algo está acontecendo. */
    sinal('recebendo');
    const paraPensar = setTimeout(() => sinal('pensando'), 420);

    /** Encerra o estado ocupado, aconteça o que acontecer. */
    const encerrar = (comoTerminou) => {
      clearTimeout(paraPensar);
      sinal(comoTerminou);
      box.setAttribute('aria-busy', 'false');
      busy = false;
      if (btn) {
        btn.disabled = false;
        if (botaoIcone) btn.classList.remove('is-ocupado'); else btn.textContent = rotuloAntes || 'Perguntar';
      }
      if (d.aoTerminar) d.aoTerminar(comoTerminou);
    };

    try {
      const r = await AI.chamarFuncao(AI.corpoDaPergunta(q));

      if (r.erro === 'sem_sessao') {
        renderError(box, 'Sua sessão expirou. Entre de novo para continuar.');
        encerrar('erro');
        return;
      }
      if (r.erro === 'limite') {
        /* A COTA É MENSAL, e este trecho dizia "hoje".
           Ele lia r.usado.dia e r.limites.por_dia — campos de um
           desenho anterior, com limite diário, que a função nunca
           devolveu. Na prática a tela diria "Você usou 0 de ?
           perguntas hoje. O limite recomeça amanhã": errada no
           número, no período e na promessa. Alguém esperaria até o
           dia seguinte por algo que só volta no mês que vem.

           Os nomes agora são os que a função realmente manda:
           usado, limite e periodo. */
        const usado = r.usado != null ? r.usado : '?';
        const teto = r.limite != null ? r.limite : '?';
        renderError(box, 'Você usou ' + usado + ' de ' + teto +
          ' consultas do seu plano neste mês. Elas voltam no dia 1º. ' +
          'Erro nosso ou indisponibilidade não consomem consulta.');
        if (global.Ug && Ug.renderContexto) Ug.renderContexto();
        encerrar('erro');
        return;
      }
      if (r.erro) {
        renderError(box, r.mensagem || 'O assistente está indisponível agora.');
        encerrar('erro');
        return;
      }
      if (!r.texto && !r.acao_proposta) {
        renderError(box, 'A resposta veio vazia. Tente reformular a pergunta.');
        encerrar('erro');
        return;
      }

      sinal('respondendo');
      box.className = 'ai-answer';
      const textoResposta = r.texto || 'Preparei o lançamento abaixo. Revise os dados antes de confirmar.';
      box.innerHTML = renderMarkdown(textoResposta);
      const proposta = renderAcaoProposta(r.acao_proposta);
      if (proposta) box.appendChild(proposta);
      box.appendChild(el('div', { class: 'ai-meta' }, [
        /* O período analisado sai junto da resposta, e vem da
           FUNÇÃO — não do que a tela achava que tinha pedido. Se os
           dois divergirem, é a resposta que manda, porque foi sobre
           ela que o modelo escreveu. */
        r.periodo ? el('span', {
          text: escopo === 'mes'
            ? 'Período analisado: ' + U.monthLabel(r.periodo) + '.'
            : 'Alcance: ' + (escopo === 'ano' ? 'o ano de ' + U.ymParts(r.periodo).y : 'o ano e os meses anteriores') +
              ', a partir de ' + U.monthLabel(r.periodo) + '.'
        }) : null,
        el('span', { text: ' Orientativo, não é consultoria financeira.' }),
        /* Mensal, não diário. Mesma correção de nomes de campo. */
        r.uso && r.uso.limite != null
          ? el('span', { text: ' · ' + r.uso.usado + ' de ' + r.uso.limite + ' neste mês' })
          : null
      ].filter(Boolean)));
      if (d.aoResponder) d.aoResponder(box, textoResposta);

      /* A cota mudou; a faixa da página precisa refletir isso agora,
         e não só no próximo carregamento. */
      if (global.Limites && Limites.carregarConsumo) {
        Limites.carregarConsumo().then(() => {
          if (global.Ug && Ug.renderContexto) Ug.renderContexto();
          if (global.UglezFlutuante && UglezFlutuante.renderCota) UglezFlutuante.renderCota();
        });
      }

      /* O "respondendo" fica no ar um instante antes do pulso de
         sucesso: a onda precisa de tempo para sair do centro e
         chegar à borda, e cortá-la na metade transforma a conclusão
         num piscar. */
      setTimeout(() => encerrar('sucesso'), 700);
    } catch (e) {
      console.error('UGLEZ:', e);
      renderError(box, 'Não foi possível falar com o assistente. Verifique a conexão e tente de novo.');
      encerrar('erro');
    }
  };

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

  /** Explica por que não dá para perguntar, e o que fazer. */
  AI.explicarIndisponivel = function (modo) {
    UI.openModal({
      title: 'UGLEZ',
      body: el('div', { style: { fontSize: '13.5px', lineHeight: '1.65' } }, [
        el('p', {
          text: modo.chave === 'sem-sessao'
            ? 'O UGLEZ precisa da sua conta para funcionar. Não é uma trava comercial: é assim que o servidor sabe de quem é o limite de uso e a quais dados a pergunta se refere.'
            : 'O assistente ainda não está configurado neste ambiente.'
        }),
        el('p', { style: { marginTop: '10px' }, text: 'A análise acontece no servidor. Nenhuma chave de IA existe neste navegador, e nenhuma pergunta sai daqui sem passar por ele.' })
      ]),
      buttons: [
        { label: 'Fechar', class: 'btn-outline', onClick: UI.closeModal },
        modo.chave === 'sem-sessao'
          ? { label: 'Entrar', class: 'btn-primary', onClick: () => { UI.closeModal(); Sync.signIn(); } }
          : null
      ].filter(Boolean)
    });
  };

  /** O que exatamente será enviado — o usuário tem direito de ver. */
  AI.mostrarDados = function () {
    const r = AI.corpoDaPergunta('(sua pergunta)');
    UI.openModal({
      title: 'O que a UGLEZ recebe',
      body: el('div', { style: { fontSize: '13.5px', lineHeight: '1.65' } }, [
        el('p', { text: 'Ao perguntar, sai daqui um resumo agregado — e só ele:' }),
        el('ul', { style: { marginTop: '8px', paddingLeft: '18px', listStyle: 'disc' } },
          AI.CATEGORIAS_ENVIADAS.map((c) => el('li', { text: c }))),
        el('p', { style: { marginTop: '10px' }, text: 'Não sai: a lista de lançamentos, a descrição de qualquer lançamento, nomes de contas ou cartões, identificadores internos, seu e-mail, nem dados de outro espaço. Quantos meses chegam ao modelo depende do seu plano — o servidor corta o resto.' }),
        el('p', { class: 'hint', style: { marginTop: '10px' }, text: 'Abaixo, exatamente o que seria enviado agora:' }),
        el('textarea', {
          class: 'input textarea', rows: 12, readonly: true,
          style: { marginTop: '6px', fontFamily: 'ui-monospace, monospace', fontSize: '11.5px' },
          text: JSON.stringify(r, null, 2)
        })
      ]),
      wide: true,
      buttons: [{ label: 'Fechar', class: 'btn-primary', onClick: UI.closeModal }]
    });
  };

  function renderError(box, message) {
    box.className = 'ai-answer is-error';
    U.clear(box);
    box.appendChild(el('strong', { text: 'Não deu certo. ' }));
    box.appendChild(document.createTextNode(message));
    /* Havia aqui um botão "Configurar chave" que chamava
       AI.openConfig() — função que não existe desde que a chave saiu
       do navegador. Ele só aparecia quando a mensagem continha a
       palavra "chave", então nunca era testado, e clicá-lo dava
       TypeError em cima de uma tela que já estava mostrando um erro.
       Não há chave para configurar: o botão saiu. */
  }

  /* ============================================================
     3 · MARKDOWN MÍNIMO (o texto do modelo é escapado antes)
     ============================================================ */

  function inline(s) {
    return U.escape(s)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  function renderMarkdown(md) {
    const out = [];
    let list = null;   // 'ul' | 'ol' | null

    const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };

    String(md).split(/\r?\n/).forEach((line) => {
      const raw = line.trim();
      if (!raw) { closeList(); return; }

      const h = /^(#{1,6})\s+(.*)$/.exec(raw);
      if (h) { closeList(); out.push(`<h4>${inline(h[2])}</h4>`); return; }

      const ul = /^[-*+]\s+(.*)$/.exec(raw);
      if (ul) {
        if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
        out.push(`<li>${inline(ul[1])}</li>`);
        return;
      }

      const ol = /^\d+[.)]\s+(.*)$/.exec(raw);
      if (ol) {
        if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
        out.push(`<li>${inline(ol[1])}</li>`);
        return;
      }

      closeList();
      out.push(`<p>${inline(raw)}</p>`);
    });
    closeList();
    return out.join('');
  }
  /* A conversa da página redesenha as próprias bolhas com o mesmo
     markdown mínimo — e o texto continua escapado antes. */
  AI.markdown = renderMarkdown;

  /* ---------------- ligação com a página ---------------- */

  AI.init = function () {
    /* Higiene: se este navegador guardou uma chave no formato
       antigo, ela sai agora. Uma chave que já esteve no
       localStorage deve ser considerada comprometida — o usuário
       precisa revogá-la no provedor, não só apagá-la daqui. */
    try {
      if (localStorage.getItem(CHAVE_ANTIGA)) {
        localStorage.removeItem(CHAVE_ANTIGA);
        console.warn('UGLEZ: uma chave de IA guardada neste navegador foi removida. ' +
          'Revogue-a no painel do provedor: uma chave que esteve no navegador está exposta.');
        if (global.UI) UI.toast('Removemos a chave de IA guardada neste aparelho. Revogue-a no painel do provedor.', 'error', 12000);
      }
    } catch (e) { /* sem localStorage, nada a limpar */ }

    /* O botão que configurava a chave agora mostra o que é enviado.
       O lugar na interface continua útil; o que mudou foi a pergunta
       que ele responde — de "onde ponho minha chave" para "o que sai
       daqui". */
    const btnCfg = document.getElementById('btnAiConfig');
    if (btnCfg) {
      btnCfg.textContent = 'O que é enviado';
      btnCfg.addEventListener('click', () => AI.mostrarDados());
    }

    const btnAsk = document.getElementById('btnAiAsk');
    const field = document.getElementById('aiQuestion');

    /* A pergunta entra na conversa ANTES da resposta chegar (ver
       Ug.novaResposta). Guardar só no sucesso perderia justamente as
       que falharam — que são as que a pessoa quer repetir. */
    const cresce = () => {
      if (!field) return;
      field.style.height = 'auto';
      field.style.height = Math.min(field.scrollHeight, 168) + 'px';
      if (btnAsk) btnAsk.classList.toggle('tem-texto', !!field.value.trim());
    };
    const perguntarDaPagina = () => {
      const q = field ? String(field.value || '').trim() : '';
      if (!q) { field && field.focus(); return; }
      if (busy) return;
      AI.ask(q);
      if (field && AI.modo().chave === 'servidor') { field.value = ''; cresce(); }
    };

    if (btnAsk && field) {
      btnAsk.addEventListener('click', perguntarDaPagina);
      field.addEventListener('input', cresce);
      field.addEventListener('keydown', (ev) => {
        /* Enter envia, Shift+Enter quebra linha — a convenção de
           todo campo de conversa. No teclado virtual do celular não
           há Shift: lá o Enter quebra a linha e a seta envia. */
        const toque = global.matchMedia && global.matchMedia('(hover: none)').matches;
        if (ev.key === 'Enter' && !ev.shiftKey && !toque && !ev.isComposing) { ev.preventDefault(); perguntarDaPagina(); }
      });
    }
  };

  global.AI = AI;
})(window);
