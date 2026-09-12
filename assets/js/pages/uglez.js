/* =============================================================
   pages/uglez.js — UGLEZ
   ------------------------------------------------------------
   Os insights desta página são ARITMÉTICA LOCAL sobre o Calc, não
   respostas de modelo. Isso importa por dois motivos: aparecem
   para quem nunca configurou nada, e nenhum dado sai do navegador
   para produzi-los.

   Só a caixa "Conversar" chama a API, e ela passa pela Edge
   Function oaze-assistant do Supabase (ver assets/js/ai.js).
   Nenhuma chave de IA existe neste navegador.
   ============================================================= */
(function (global) {
  'use strict';

  const el = U.el;
  const Ug = {};

  /* ============================================================
     AS PARTÍCULAS DESTA PÁGINA
     ------------------------------------------------------------
     Uma formação só, criada UMA VEZ e guardada. Ug.render() roda a
     cada troca de mês e a cada mudança no Store — criar a formação
     ali dentro significaria dezenas de canvas e dezenas de laços
     de animação empilhados, todos desenhando, nenhum visível a não
     ser o último. É o vazamento clássico deste tipo de peça: a
     tela continua certa e o aparelho vai esquentando.
     ============================================================ */

  let formacao = null;

  function garantirFormacao() {
    if (formacao) return formacao;
    const caixa = document.getElementById('uglezFormacao');
    if (!caixa) return null;
    /* A esfera WebGL é a presença principal desta página. A
       formação 2D continua como fallback deliberado para aparelhos
       sem WebGL — a análise não pode depender do efeito visual. */
    formacao = global.UglezErosao && UglezErosao.montar
      ? UglezErosao.montar(caixa)
      : null;
    if (!formacao && global.UglezParticulas && UglezParticulas.montar) {
      caixa.classList.add('is-fallback');
      formacao = UglezParticulas.montar(caixa, { qtd: 96 });
    }
    return formacao;
  }

  /**
   * Move as partículas e escreve o MESMO estado em texto.
   *
   * O texto não é enfeite: partícula não tem alternativa textual, e
   * quem usa leitor de tela precisa saber que o UGLEZ está pensando
   * — senão o silêncio entre a pergunta e a resposta é
   * indistinguível de uma falha.
   */
  Ug.estadoParticulas = function (estado) {
    const f = garantirFormacao();
    if (f) {
      if (estado === 'sucesso' || estado === 'erro') f.pulsar(estado, 1.2);
      else f.estado(estado);
    }
    const alvo = document.getElementById('uglezEstadoTexto');
    if (!alvo) return;
    const FRASES = {
      repouso: 'Pronto para analisar',
      foco: 'Pronto para analisar',
      recebendo: 'Reunindo os dados do mês…',
      pensando: 'Analisando…',
      respondendo: 'Escrevendo a resposta…',
      sucesso: 'Resposta pronta.',
      erro: 'Não foi possível responder.'
    };
    alvo.textContent = FRASES[estado] || '';
    alvo.className = 'uglez-estado' + (estado === 'erro' ? ' is-erro' : '');
    if (estado === 'sucesso') setTimeout(() => {
      if (alvo.textContent === FRASES.sucesso) alvo.textContent = FRASES.repouso;
    }, 2600);
  };

  /* ============================================================
     SUGESTÕES — só o que o produto REALMENTE faz
     ------------------------------------------------------------
     A lista era fixa e prometia coisas que nem sempre existem. Duas
     das quatro perguntas antigas ("comparar com o mês anterior" e
     "planejar o próximo mês") dependem de comparação entre
     períodos, que é um DIREITO de plano: oferecidas no Grátis, elas
     gastam uma das cinco consultas do mês para receber de volta
     "isso está em outro plano".

     Agora a lista é montada a partir dos direitos e dos dados que
     existem de fato. Uma sugestão que não pode ser respondida não
     é oferecida.
     ============================================================ */

  Ug.sugestoes = function () {
    const lista = [
      { rotulo: 'Onde posso economizar?',
        q: 'Onde posso cortar gastos este mês, olhando as maiores categorias?' },
      { rotulo: 'Resumo do mês',
        q: 'Faça um resumo do meu mês: receitas, despesas e o que mais pesou.' }
    ];

    const pode = (r) => !!(global.Limites && Limites.pode(r));

    if (pode('monthlyComparison')) {
      lista.push({ rotulo: 'Comparar com o mês anterior',
        q: 'Como estão minhas despesas comparadas ao mês passado, por categoria?' });
    }

    /* Metas só entram na lista quando existem metas. Sugerir
       "como estão minhas metas?" para quem não tem nenhuma gasta
       uma consulta para ouvir que não há metas. */
    const prof = Store.profile();
    if (prof && (prof.goals || []).length) {
      lista.push({ rotulo: 'Como estão minhas metas?',
        q: 'Como está o andamento das minhas metas e quanto falta para cada uma?' });
    }

    if (pode('advancedAnalytics')) {
      lista.push({ rotulo: 'Tendências e projeção',
        q: 'Que tendências aparecem nos meus últimos meses e o que elas projetam?' });
    }

    return lista;
  };

  /* Mantido para quem ainda lê Ug.SUGESTOES. É uma leitura da mesma
     fonte, não uma segunda lista. */
  Object.defineProperty(Ug, 'SUGESTOES', { get: () => Ug.sugestoes() });

  /* ============================================================
     CONTEXTO — qual mês, e quanta cota resta
     ------------------------------------------------------------
     O PERÍODO precisa aparecer porque o app tem seletor de mês: sem
     ele, quem voltou para março lê afirmações e não sabe sobre
     quando. "Subiu 18%" sem data é uma frase que não dá para
     conferir.

     A COTA aparece aqui, e não só em Configurações, porque é aqui
     que ela é gasta. Escondida na outra tela, a pessoa descobre o
     limite ao bater nele.
     ============================================================ */

  function renderContexto() {
    const alvo = document.getElementById('uglezPeriodo');
    const mes = U.smartCase(U.monthLabel(App.ym));
    if (alvo) {
      alvo.textContent = mes + ' · contexto do mês selecionado';
    }
    const orbita = document.getElementById('uglezMesOrbita');
    if (orbita) orbita.textContent = mes;

    const cota = document.getElementById('uglezCota');
    const limite = document.getElementById('uglezLimite');
    if (!cota || !limite) return;

    const modo = AI.modo();
    if (modo.chave !== 'servidor' || !global.Limites) {
      cota.hidden = true; limite.hidden = true; return;
    }

    const c = Limites.consumoIA();
    /* limite null = ilimitado. Escrever "0 de null" seria pior do
       que não escrever nada. */
    if (c.limite === null || c.limite === undefined) {
      cota.hidden = true; limite.hidden = true; return;
    }

    const resta = Math.max(0, c.limite - c.usado);

    if (resta === 0) {
      /* Estado de limite atingido: é um bloco próprio, e não uma
         linha de texto cinza. Quem bateu no teto precisa entender o
         que aconteceu e o que fazer, e nenhuma das duas coisas cabe
         numa legenda. */
      cota.hidden = true;
      limite.hidden = false;
      const plano = Planos.get(Limites.plano());
      document.getElementById('uglezLimiteTitulo').textContent =
        'Você usou as ' + c.limite + ' consultas do plano ' + plano.nome + ' neste mês';
      document.getElementById('uglezLimiteTexto').textContent =
        'Elas voltam no dia 1º. Nada foi apagado, e o restante do OAZE continua funcionando ' +
        'normalmente — a leitura do mês abaixo é calculada aqui mesmo e não consome consulta.';
      return;
    }

    limite.hidden = true;
    cota.hidden = false;
    cota.className = 'uglez-cota' + (resta <= 2 ? ' is-pouca' : '');
    cota.textContent = resta + ' de ' + c.limite + ' consultas restantes neste mês. ' +
      'Erro nosso ou indisponibilidade não consomem consulta.';
  }
  Ug.renderContexto = renderContexto;

  /* ---------------- histórico da conversa ----------------
     Só o que aconteceu NESTA sessão, e só na memória. Guardar a
     conversa entre sessões exigiria decidir onde ela mora e quem a
     apaga; enquanto essa decisão não estiver tomada, prometer
     histórico persistente seria prometer o que não há. */

  const conversa = [];

  Ug.registrar = function (pergunta) {
    conversa.push({ pergunta: pergunta, quando: new Date() });
    renderHistorico();
  };

  function renderHistorico() {
    const box = document.getElementById('uglezHistorico');
    if (!box) return;
    U.clear(box);
    if (!conversa.length) { box.hidden = true; return; }
    box.hidden = false;
    /* Só as perguntas: a resposta atual já está logo abaixo, e
       repetir o texto inteiro de cada resposta transformaria a
       página numa rolagem infinita de markdown. */
    conversa.slice(-6).forEach((c) => {
      box.appendChild(el('p', { class: 'uglez-pergunta' }, [
        el('span', { class: 'uglez-pergunta-hora',
          text: c.quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }),
        el('span', { text: c.pergunta })
      ]));
    });
  }

  /* ---------------- render ---------------- */

  /* Ligado uma vez, na primeira pintura da página. Ligar a cada
     render acumularia um ouvinte por troca de mês, e o botão
     passaria a voltar dois, três, quatro meses de uma vez. */
  let ligado = false;

  function ligarUmaVez() {
    if (ligado) return;
    ligado = true;
    const outro = document.getElementById('btnUglezOutroMes');
    if (outro) {
      /* Volta um mês. É a ação certa para um mês vazio: o mês
         anterior é onde o dado provavelmente está, e o seletor do
         cabeçalho continua ali para quem quiser ir mais longe. */
      outro.addEventListener('click', () => App.setYM(U.addMonths(App.ym, -1)));
    }
  }

  Ug.render = function () {
    ligarUmaVez();
    const visual = garantirFormacao();
    if (visual && visual.medir) visual.medir();
    renderContexto();
    renderHistorico();
    renderChips('uglezChipsFull');

    /* ESTADO SEM DADOS. A regra é a mesma do resto do app: sem
       movimentação no mês, nada de número, nada de gráfico, nada de
       análise. O que aparece é o motivo e o caminho de saída. */
    const t = Calc.monthTotals(App.ym);
    const temDado = !!(t.entries && t.entries.length);
    const totalMovimentos = t.entries ? t.entries.length : 0;
    const movimentos = document.getElementById('uglezMovimentos');
    const fonteLocal = document.getElementById('uglezFonteLocal');
    if (movimentos) movimentos.textContent = totalMovimentos +
      (totalMovimentos === 1 ? ' movimentação' : ' movimentações');
    if (fonteLocal) fonteLocal.textContent = temDado
      ? 'Pronta no navegador'
      : 'Aguardando dados';
    const semDados = document.getElementById('uglezSemDados');
    const leitura = document.getElementById('uglezLeitura');
    const campo = document.getElementById('aiQuestion');
    const botao = document.getElementById('btnAiAsk');

    if (semDados) {
      semDados.hidden = temDado;
      const mes = document.getElementById('uglezMesVazio');
      if (mes) mes.textContent = U.monthLabel(App.ym);
    }
    /* O campo continua HABILITADO mesmo sem dados: a pessoa pode
       perguntar sobre o produto, e desabilitar um campo sem dizer
       por quê é a forma mais rápida de parecer quebrado. */
    if (campo) campo.placeholder = temDado
      ? 'Pergunte sobre o mês que você está vendo…'
      : 'Sem lançamentos neste mês — as respostas vão ser genéricas.';
    void botao;

    if (leitura) leitura.hidden = !temDado;
    if (temDado) renderInsights();

    const alvo = document.getElementById('uglezMode');
    if (alvo) {
      const modo = AI.modo();
      alvo.textContent =
        modo.chave === 'servidor'
          ? 'Servidor autenticado — nenhuma chave de IA neste navegador'
          : modo.chave === 'restaurando'
            ? 'Verificando sua conta…'
            : modo.chave === 'sem-sessao'
              ? 'Entre na sua conta para conversar'
              : 'Assistente indisponível neste ambiente';
    }
  };

  /* A sessão terminou de ser restaurada: a página precisa se
     redesenhar. Sem isto ela ficaria dizendo "Verificando sua
     conta…" para sempre — o estado de carregamento só é honesto se
     alguém o encerra. */
  if (global.Sync && Sync.aoResolverSessao) {
    Sync.aoResolverSessao(() => { if (App.page === 'uglez') Ug.render(); });
  }

  /** Chips de pergunta, reusados na home e na página. */
  function renderChips(id) {
    const box = document.getElementById(id);
    if (!box) return;
    U.clear(box);
    Ug.sugestoes().forEach((s) => {
      box.appendChild(el('button', {
        class: 'ai-chip', type: 'button', text: s.rotulo,
        onclick: () => {
          App.goTo('uglez');
          const campo = document.getElementById('aiQuestion');
          if (campo) campo.value = s.q;
          Ug.registrar(s.q);
          setTimeout(() => AI.ask(s.q), 60);
        }
      }));
    });
  }
  Ug.renderChips = renderChips;

  /* ============================================================
     INSIGHTS — quatro leituras, todas verificáveis
     ============================================================ */

  /**
   * De quantos meses com movimentação a previsão dispõe, e qual a
   * sobra média deles.
   *
   * Só conta mês que teve ALGUMA coisa. Incluir os meses vazios na
   * média puxaria tudo para zero e faria "não usei o app em março"
   * parecer "não gastei nada em março" — que é uma afirmação sobre
   * a vida financeira de alguém, feita a partir da ausência de
   * dado.
   *
   * Olha 12 meses para trás porque é o horizonte que uma projeção
   * anual pode honestamente usar; mais que isso, o comportamento
   * provavelmente já mudou.
   */
  Ug.baseDePrevisao = function (ym) {
    const inicio = U.addMonths(ym, -11);
    let serie = [];
    try { serie = Calc.monthlySeries(inicio, ym) || []; } catch (e) { return { meses: 0, media: 0 }; }

    const comDado = serie.filter((m) => (m.income + m.expense) > 0);
    if (!comDado.length) return { meses: 0, media: 0 };

    const soma = U.sum(comDado, (m) => m.income - m.expense);
    return { meses: comDado.length, media: U.round2(soma / comDado.length) };
  };

  Ug.insights = function (ym) {
    const out = [];
    const t = Calc.monthTotals(ym);
    const anterior = U.addMonths(ym, -1);
    const prev = Calc.monthTotals(anterior);
    const score = Calc.score(ym);

    /* 1 · atenção — a parte mais fraca do score */
    const fraca = score.partes.slice().sort((a, b) => a.pontos - b.pontos)[0];
    if (fraca && fraca.pontos < 14) {
      out.push({
        tipo: 'atencao', icone: 'circle-alert', titulo: 'Precisa de atenção',
        linha: fraca.nome, detalhe: fraca.detalhe,
        acao: fraca.chave === 'credito' ? { rotulo: 'Ver faturas', ir: () => App.goTo('accounts', { tab: 'cards' }) }
          : fraca.chave === 'poupanca' ? { rotulo: 'Ver orçamento', ir: () => App.goTo('budget') }
            : fraca.chave === 'reserva' ? { rotulo: 'Criar meta', ir: () => App.goTo('goals') }
              : { rotulo: 'Ver lançamentos', ir: () => App.goTo('transactions') }
      });
    }

    /* 2 · variação — a categoria que mais mudou */
    const agora = Calc.categoryTotals('expense', U.monthStart(ym), U.monthEnd(ym));
    const antes = Calc.categoryTotals('expense', U.monthStart(anterior), U.monthEnd(anterior));
    const mapa = {};
    antes.forEach((c) => { mapa[c.id] = c.total; });
    let maior = null;
    agora.forEach((c) => {
      const base = mapa[c.id];
      if (!base || base <= 0) return;
      const pct = ((c.total - base) / base) * 100;
      if (Math.abs(pct) < 12 || Math.abs(c.total - base) < 30) return;
      if (!maior || Math.abs(pct) > Math.abs(maior.pct)) maior = { nome: c.name, pct, atual: c.total, base };
    });
    if (maior) {
      out.push({
        tipo: maior.pct > 0 ? 'atencao' : 'oportunidade',
        icone: maior.pct > 0 ? 'trending-up' : 'trending-up',
        titulo: maior.pct > 0 ? 'Subiu bastante' : 'Caiu bastante',
        linha: `${maior.nome}: ${maior.pct > 0 ? '+' : '−'}${U.fmtPct(Math.abs(maior.pct), 0)}`,
        detalhe: `${U.fmtBRL(maior.atual)} agora, contra ${U.fmtBRL(maior.base)} em ${U.monthLabel(anterior, true)}.`,
        acao: { rotulo: 'Ver categoria', ir: () => App.goTo('transactions') }
      });
    }

    /* ============================================================
       3 · PREVISÃO — e o que ela precisa para existir
       ------------------------------------------------------------
       Este bloco era empilhado SEM CONDIÇÃO NENHUMA. Com zero
       lançamentos, sobra = 0, a comparação `0 >= 0` dava verdadeira,
       e a tela dizia:

         "R$ 0,00 em um ano"
         "Você está guardando R$ 0,00 por mês."

       Duas frases confiantes sobre nada. Pior que um espaço vazio,
       porque um espaço vazio ninguém confunde com informação.

       E havia um erro maior escondido nele: mesmo COM dados, ele
       multiplicava a sobra de UM mês por doze e chamava isso de
       previsão. Um mês não é tendência -- é um ponto. Dezembro com
       décimo terceiro projetaria um ano de fartura; janeiro com IPTU
       projetaria a ruína.

       A regra agora é a base, e ela é dita em voz alta:
         0 meses  → não há previsão, e a tela explica o que falta
         1-2      → o resultado do mês, SEM extrapolar
         3+       → projeção pela MÉDIA, dizendo de quantos meses
       ============================================================ */
    const base = Ug.baseDePrevisao(ym);
    const sobra = U.round2(t.income - t.expense);

    if (!base.meses) {
      out.push({
        tipo: 'previsao', icone: 'chart-line',
        titulo: 'Ainda sem base para prever',
        linha: 'Você ainda não possui movimentações suficientes para uma previsão.',
        detalhe: 'Cadastre receitas e despesas para receber sua primeira análise.',
        acao: { rotulo: 'Registrar lançamento', ir: () => Forms.openTransaction('expense') }
      });
    } else if (base.meses < 3) {
      /* Há dado, mas não o bastante para chamar de tendência. Diz o
         que sabe -- o resultado deste mês -- e diz o que falta. */
      out.push({
        tipo: sobra >= 0 ? 'previsao' : 'risco', icone: 'chart-line',
        titulo: sobra >= 0 ? 'Resultado deste mês' : 'Atenção ao mês',
        linha: sobra >= 0
          ? `Sobraram ${U.fmtBRL(sobra)} em ${U.monthLabel(ym, true)}`
          : `Faltaram ${U.fmtBRL(Math.abs(sobra))} em ${U.monthLabel(ym, true)}`,
        detalhe: `Com ${base.meses} ${base.meses === 1 ? 'mês' : 'meses'} de histórico ainda não dá para projetar um ano — ` +
          'um mês isolado não mostra tendência. A partir de três, a previsão aparece aqui.',
        acao: { rotulo: 'Ver análises', ir: () => App.goTo('reports') }
      });
    } else {
      const anual = U.round2(base.media * 12);
      out.push({
        tipo: base.media >= 0 ? 'previsao' : 'risco', icone: 'chart-line',
        titulo: base.media >= 0 ? 'Se mantiver o ritmo' : 'Atenção ao ritmo',
        linha: base.media >= 0
          ? `${U.fmtBRL(anual)} em um ano`
          : `${U.fmtBRL(Math.abs(anual))} de rombo em um ano`,
        /* A base entra na frase. Sem ela, uma projeção parece um
           fato; com ela, o leitor sabe de onde saiu e o quanto
           confiar. */
        detalhe: `Média de ${U.fmtBRL(base.media)} por mês nos últimos ${base.meses} meses com movimentação. ` +
          'É uma projeção do ritmo atual, não uma promessa.',
        acao: { rotulo: 'Ver análises', ir: () => App.goTo('reports') }
      });
    }

    /* 4 · oportunidade — recorrências pesam muito? */
    const fixas = Store.profile().transactions.filter((x) => x.recurring && x.kind === 'expense');
    const pesoFixo = U.sum(fixas, (x) => x.amount);
    if (pesoFixo > 0 && t.income > 0) {
      const pct = (pesoFixo / t.income) * 100;
      out.push({
        tipo: pct > 50 ? 'risco' : 'oportunidade',
        icone: 'repeat',
        titulo: pct > 50 ? 'Muito comprometido' : 'Compromissos fixos',
        linha: `${U.fmtPct(pct, 0)} da sua receita já está comprometida`,
        detalhe: `${fixas.length} despesa(s) fixa(s) somam ${U.fmtBRL(pesoFixo)} por mês — ${U.fmtBRL(U.round2(pesoFixo * 12))} no ano.`,
        acao: { rotulo: 'Ver recorrências', ir: () => App.goTo('recurring') }
      });
    }

    void prev;
    return out;
  };

  /** Linha curta para a home. */
  Ug.resumo = function (ym) {
    const t = Calc.monthTotals(ym);
    if (!t.entries.length) {
      return { linha: 'Nada lançado neste mês ainda.', sub: 'Assim que houver movimentação, a leitura aparece aqui.' };
    }
    const ins = Ug.insights(ym);
    const principal = ins.find((i) => i.tipo === 'atencao') || ins[0];
    const score = Calc.score(ym);
    return {
      linha: principal ? principal.linha : `Score ${score.total} — ${score.faixa}.`,
      sub: principal ? principal.detalhe : ''
    };
  };

  function renderInsights() {
    const box = U.clear(document.getElementById('uglezInsights'));
    let itens = [];
    try { itens = Ug.insights(App.ym); } catch (e) { console.error('UGLEZ:', e); }

    if (!itens.length) {
      box.appendChild(el('div', { class: 'card empty-state' }, [
        el('span', { class: 'empty-ico' }, Icons.lucide('sparkles', 26)),
        el('p', { class: 'empty-title', text: 'Sem leituras para este mês' }),
        el('p', { class: 'empty-sub', text: 'Lance receitas e despesas para o UGLEZ ter o que analisar.' })
      ]));
      return;
    }

    itens.forEach((i) => {
      box.appendChild(el('article', { class: 'insight-card is-' + i.tipo }, [
        el('div', { class: 'insight-head' }, [
          el('span', { class: 'insight-ico' }, Icons.lucide(i.icone, 16)),
          el('span', { class: 'insight-tag', text: rotuloTipo(i.tipo) })
        ]),
        el('h3', { class: 'insight-title', text: i.titulo }),
        el('p', { class: 'insight-line', text: i.linha }),
        el('p', { class: 'insight-detail', text: i.detalhe }),
        i.acao
          ? el('button', { class: 'btn btn-ghost btn-sm', text: i.acao.rotulo + ' →', onclick: i.acao.ir })
          : null
      ].filter(Boolean)));
    });
  }

  function rotuloTipo(t) {
    return t === 'atencao' ? 'Atenção' : t === 'oportunidade' ? 'Oportunidade'
      : t === 'previsao' ? 'Previsão' : 'Risco';
  }

  /** Bloco compacto da home. */
  Ug.renderHome = function (ym) {
    const linha = document.getElementById('uglezInsight');
    const sub = document.getElementById('uglezInsightSub');
    if (!linha) return;
    let r;
    try { r = Ug.resumo(ym); } catch (e) {
      console.error('UGLEZ:', e);
      r = { linha: 'Leitura indisponível para este mês.', sub: '' };
    }
    linha.textContent = r.linha;
    sub.textContent = r.sub || '';
    renderChips('uglezChips');
  };

  global.Ug = Ug;
})(window);
