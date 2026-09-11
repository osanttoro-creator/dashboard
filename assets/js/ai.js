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
   consolidadas, metas e compromissos do período. Nunca a lista de
   lançamentos, nunca identificador interno, nunca outro perfil.

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
    'Mês e ano selecionados',
    'Total de receitas, despesas e saldo',
    'Gastos consolidados por categoria',
    'Metas e quanto já foi guardado',
    'Compromissos previstos do período'
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
     categorias consolidadas, metas e compromissos. Mais nada.
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
  AI.historico = function (ym, meses) {
    const fim = ym || App.ym;
    const inicio = U.addMonths(fim, -(meses || 11));
    let serie = [];
    try { serie = Calc.monthlySeries(inicio, U.addMonths(fim, -1)) || []; }
    catch (e) { return []; }
    return serie
      .filter((m) => (m.income + m.expense) > 0)
      .map((m) => ({
        periodo: m.ym,
        receitas: U.round2(m.income),
        despesas: U.round2(m.expense),
        saldo: U.round2(m.balance)
      }));
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
      compromissos: []
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
      /* Compromissos = o que está previsto e ainda não confirmado
         no mês exibido. É a informação que responde "o que ainda vai
         sair", e ela não aparece nos totais justamente por não ter
         acontecido. Vai só o dia, nunca a data inteira: o dia basta
         para o modelo falar de fim de mês apertado, e a data cheia
         seria um passo a mais de identificação sem ganho nenhum. */
      resumo.compromissos = (t.entries || [])
        .filter((e) => !e.confirmed && e.kind !== 'transfer')
        .map((e) => ({
          titulo: String(e.description || 'Sem descrição').slice(0, 60),
          valor: U.round2(e.amount),
          dia: +String(e.date).slice(8, 10) || 1
        }));
    } catch (e) { /* idem */ }

    return resumo;
  };

  const SYSTEM = [
    'Você ajuda uma pessoa a organizar as próprias finanças pessoais. Ela usa um painel financeiro',
    'e envia abaixo um resumo dos dados de UM perfil e UM mês.',
    '',
    'Convenções dos dados (respeite-as ao interpretar):',
    '· Só lançamentos CONFIRMADOS entram nos totais. "Previstos" foram lançados mas ainda não confirmados.',
    '· Despesa no cartão de crédito conta na data da compra, não na data de pagamento da fatura.',
    '· "Saldo do mês" é receitas menos despesas. "Saldo em contas" é o caixa real das contas bancárias.',
    '· Aporte em investimento não é despesa: é dinheiro que mudou de lugar.',
    '· Todos os valores estão em reais (R$), formato brasileiro.',
    '',
    'Responda em português do Brasil, em markdown simples (títulos com ##, listas com -, **negrito**).',
    'Use os números concretos do resumo — cite valores e categorias em vez de falar em termos genéricos.',
    'Seja direto e prático: comece pela resposta, depois o raciocínio. Se os dados não sustentam uma conclusão,',
    'diga o que falta em vez de supor. Se a pergunta pedir recomendação de investimento específico,',
    'explique que isso depende de perfil e objetivos que os dados não mostram, e volte ao que dá para dizer:',
    'organização, orçamento e padrões de gasto.'
  ].join('\n');

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

  /** O destino padrão: a caixa da página do UGLEZ. */
  function destinoDaPagina() {
    const caixa = document.getElementById('aiAnswer');
    if (!caixa) return null;
    return {
      caixa: caixa,
      botao: document.getElementById('btnAiAsk'),
      estado: (e) => { if (global.Ug && Ug.estadoParticulas) Ug.estadoParticulas(e); }
    };
  }

  AI.ask = function (question) {
    return AI.perguntar(question, destinoDaPagina());
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
    const d = destino || destinoDaPagina();
    if (!d || !d.caixa) return;
    const box = d.caixa;
    const sinal = d.estado || function () {};

    const q = String(question || '').trim();
    if (!q) { UI.toast('Escreva uma pergunta primeiro.', 'error'); return; }
    if (busy) return;

    const modo = AI.modo();
    if (modo.chave !== 'servidor') { AI.explicarIndisponivel(modo); return; }

    busy = true;
    const btn = d.botao;
    const rotuloAntes = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Pensando…'; }

    box.hidden = false;
    box.className = 'ai-answer is-loading';
    /* aria-live faz o leitor de tela anunciar a chegada da resposta
       sem que a pessoa precise sair procurando. */
    box.setAttribute('aria-live', 'polite');
    box.setAttribute('aria-busy', 'true');
    box.textContent = 'Analisando os dados de ' + U.monthLabel(App.ym);

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
      if (btn) { btn.disabled = false; btn.textContent = rotuloAntes || 'Perguntar'; }
    };

    try {
      const r = await AI.chamarFuncao({
        pergunta: q,
        periodo: App.ym,
        resumo: AI.resumoAgregado(),
        /* O histórico vai sempre; quem decide se ele CHEGA ao modelo
           é a Edge Function, pelo plano. Ver AI.historico. */
        historico: AI.historico()
      });

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
      if (!r.texto) {
        renderError(box, 'A resposta veio vazia. Tente reformular a pergunta.');
        encerrar('erro');
        return;
      }

      sinal('respondendo');
      box.className = 'ai-answer';
      box.innerHTML = renderMarkdown(r.texto);
      box.appendChild(el('div', { class: 'ai-meta' }, [
        /* O período analisado sai junto da resposta, e vem da
           FUNÇÃO — não do que a tela achava que tinha pedido. Se os
           dois divergirem, é a resposta que manda, porque foi sobre
           ela que o modelo escreveu. */
        r.periodo ? el('span', { text: 'Período analisado: ' + U.monthLabel(r.periodo) + '.' }) : null,
        el('span', { text: ' Orientativo, não é consultoria financeira.' }),
        /* Mensal, não diário. Mesma correção de nomes de campo. */
        r.uso && r.uso.limite != null
          ? el('span', { text: ' · ' + r.uso.usado + ' de ' + r.uso.limite + ' neste mês' })
          : null
      ].filter(Boolean)));

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
    const r = AI.resumoAgregado();
    UI.openModal({
      title: 'O que o UGLEZ recebe',
      body: el('div', { style: { fontSize: '13.5px', lineHeight: '1.65' } }, [
        el('p', { text: 'Ao perguntar, sai daqui um resumo agregado do mês exibido — e só ele:' }),
        el('ul', { style: { marginTop: '8px', paddingLeft: '18px', listStyle: 'disc' } },
          AI.CATEGORIAS_ENVIADAS.map((c) => el('li', { text: c }))),
        el('p', { style: { marginTop: '10px' }, text: 'Não sai: a lista de lançamentos, nomes de contas ou cartões, identificadores internos, seu e-mail, nem qualquer dado de outro perfil ou de outro mês.' }),
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
  AI.renderMarkdown = renderMarkdown;

  /* ============================================================
     4 · CONFIGURAÇÃO DA CHAVE
     ============================================================ */

  AI.insight = function (ym) {
    const t = Calc.monthTotals(ym);
    const anterior = U.addMonths(ym, -1);
    const prev = Calc.monthTotals(anterior);

    if (!t.entries.length) {
      return { linha: 'Nada lançado ainda neste mês.', sub: 'Assim que houver movimentação, o resumo aparece aqui.' };
    }
    if (t.expense === 0 && t.income === 0) {
      return {
        linha: `${t.pendingCount} lançamento(s) esperando confirmação.`,
        sub: 'Marque a caixinha de cada um para eles entrarem no saldo.'
      };
    }

    /* categoria que mais variou contra o mês anterior */
    const agora = Calc.categoryTotals('expense', U.monthStart(ym), U.monthEnd(ym));
    const antes = Calc.categoryTotals('expense', U.monthStart(anterior), U.monthEnd(anterior));
    const antesPor = {};
    antes.forEach((c) => { antesPor[c.id] = c.total; });

    let maior = null;
    agora.forEach((c) => {
      const base = antesPor[c.id];
      if (!base || base <= 0) return;
      const pct = ((c.total - base) / base) * 100;
      // variação irrelevante não vira manchete
      if (Math.abs(pct) < 10 || Math.abs(c.total - base) < 20) return;
      if (!maior || Math.abs(pct) > Math.abs(maior.pct)) maior = { nome: c.name, pct, atual: c.total };
    });

    const sobra = U.round2(t.income - t.expense);
    const sub = sobra >= 0
      ? `Neste ritmo, sobram ${U.fmtBRL(sobra)} no mês — ${U.fmtBRL(U.round2(sobra * 12))} em um ano.`
      : `Neste ritmo, faltam ${U.fmtBRL(Math.abs(sobra))} no mês. Vale olhar as maiores categorias.`;

    if (maior) {
      const verbo = maior.pct > 0 ? 'a mais' : 'a menos';
      return {
        linha: `Você gastou ${U.fmtPct(Math.abs(maior.pct), 0)} ${verbo} com ${maior.nome} que em ${U.monthLabel(anterior, true)}.`,
        sub
      };
    }
    const topo = agora[0];
    return {
      linha: topo
        ? `${topo.name} lidera os gastos do mês, com ${U.fmtBRL(topo.total)}.`
        : `Você confirmou ${U.fmtBRL(t.expense)} em despesas neste mês.`,
      sub
    };
  };

  /** Escreve a leitura no topo do assistente. Chamado a cada render. */
  AI.renderInsight = function (ym) {
    const linha = document.getElementById('aiInsight');
    const sub = document.getElementById('aiInsightSub');
    if (!linha || !sub) return;
    let r;
    try {
      r = AI.insight(ym);
    } catch (e) {
      console.error('Falha ao montar a leitura do assistente:', e);
      r = { linha: 'Resumo indisponível para este mês.', sub: '' };
    }
    linha.textContent = r.linha;
    sub.textContent = r.sub || '';
  };

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

    /* Perguntar pela página guarda a pergunta no histórico da
       sessão ANTES de enviar. Guardar só no sucesso perderia
       justamente as que falharam — que são as que a pessoa quer
       repetir. */
    const perguntarDaPagina = () => {
      const q = field ? String(field.value || '').trim() : '';
      if (!q) { UI.toast('Escreva uma pergunta primeiro.', 'error'); return; }
      if (global.Ug && Ug.registrar) Ug.registrar(q);
      AI.ask(q);
      if (field) field.value = '';
    };

    if (btnAsk && field) {
      btnAsk.addEventListener('click', perguntarDaPagina);
      field.addEventListener('keydown', (ev) => {
        /* Enter envia, Shift+Enter quebra linha — a convenção de
           todo campo de conversa. O atalho antigo (Ctrl/Cmd+Enter)
           continua valendo para quem já o tinha no dedo. */
        if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); perguntarDaPagina(); }
      });
    }
  };

  global.AI = AI;
})(window);
