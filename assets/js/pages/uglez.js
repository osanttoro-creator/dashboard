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
    const ano = U.ymParts(App.ym).y;
    const mes = U.mesNaFrase(U.ymParts(App.ym).m);
    const escopo = Ug.escopo();
    const pode = (r) => !!(global.Limites && Limites.pode(r));
    const prof = Store.profile();
    const temMetas = !!(prof && (prof.goals || []).length);
    const temInvestimentos = !!(prof && (prof.investments || []).length);

    /* O resumo do ano e as fixas vão para todos os planos — são
       totais do ano, não comparação entre meses. */
    const doAno = [
      { icone: 'calendar', rotulo: 'Resumo de ' + ano,
        sub: 'Receitas, despesas e o que mais pesou',
        q: `Faça um resumo do meu ano de ${ano}: quanto entrou, quanto saiu, o saldo e as categorias que mais pesaram.` },
      { icone: 'repeat', rotulo: 'Fixas no ano',
        sub: 'Quanto já está comprometido',
        q: `Quanto das minhas despesas de ${ano} é fixo, e quanto isso compromete da minha receita até dezembro?` }
    ];
    const doMes = [
      { icone: 'target', rotulo: 'Onde economizar',
        sub: 'As maiores categorias de ' + mes,
        q: 'Onde posso cortar gastos este mês, olhando as maiores categorias?' },
      { icone: 'receipt', rotulo: 'Resumo de ' + mes,
        sub: 'Entradas, saídas e o que pesou',
        q: 'Faça um resumo do meu mês: receitas, despesas e o que mais pesou.' }
    ];
    const comparar = pode('monthlyComparison') ? [
      { icone: 'chart-line', rotulo: 'Mês mais caro',
        sub: 'E o que explica a diferença',
        q: `Qual foi o mês mais caro de ${ano}, e quais categorias explicam a diferença para os outros meses?` },
      { icone: 'trending-up', rotulo: 'Até dezembro',
        sub: 'O que já está previsto',
        q: `Olhando o que já está previsto, como devem ficar meus próximos meses até dezembro de ${ano}?` }
    ] : [];
    const metas = temMetas ? [{
      icone: 'flag', rotulo: 'Minhas metas', sub: 'Ritmo e quanto falta',
      q: 'Como está o andamento das minhas metas, e no ritmo do ano, quando chego lá?'
    }] : [];
    const investimentos = [{
      icone: 'coins',
      rotulo: temInvestimentos ? 'Menor aporte possível' : 'Começar a investir',
      sub: temInvestimentos ? 'Sem apertar o restante do mês' : 'Um valor que caiba no orçamento',
      q: temInvestimentos
        ? 'Qual é o menor aporte que cabe no meu mês, com base no meu saldo, compromissos e carteira?'
        : 'Com base no meu saldo e nos compromissos do mês, que valor inicial cabe no orçamento para começar a investir?'
    }];

    const lista = escopo === 'mes'
      ? investimentos.concat(doMes, comparar.slice(0, 1), doAno.slice(0, 1), metas)
      : investimentos.concat(doAno, comparar, metas, doMes.slice(0, 1));
    return lista.slice(0, 4);
  };

  /* ============================================================
     ALCANCE — mês, ano ou tudo
     ------------------------------------------------------------
     Muda o que a pergunta leva e a forma como a UGLEZ lê. Fica no
     aparelho: é uma preferência de quem olha, não um dado da conta.
     ============================================================ */
  const CHAVE_ESCOPO = 'oaze.uglez.escopo';
  let escopoAtual = null;

  Ug.escopo = function () {
    if (escopoAtual) return escopoAtual;
    try {
      const v = localStorage.getItem(CHAVE_ESCOPO);
      escopoAtual = ['mes', 'ano', 'geral'].includes(v) ? v : 'ano';
    } catch (e) { escopoAtual = 'ano'; }
    return escopoAtual;
  };

  function pintaEscopo() {
    const atual = Ug.escopo();
    U.$$('#uglezEscopo [data-escopo]').forEach((b) => {
      const ativo = b.dataset.escopo === atual;
      b.classList.toggle('is-active', ativo);
      b.setAttribute('aria-pressed', ativo ? 'true' : 'false');
    });
  }

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
      const escopo = Ug.escopo();
      alvo.textContent = escopo === 'mes' ? 'Lendo ' + mes
        : escopo === 'ano' ? 'Lendo o ano de ' + U.ymParts(App.ym).y
          : 'Lendo o ano e os meses anteriores';
    }
    const orbita = document.getElementById('uglezMesOrbita');
    if (orbita) orbita.textContent = U.smartCase(U.monthLabel(App.ym, true));

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

  /** As trocas desta sessão — ai.js manda as últimas junto da pergunta. */
  Ug.trocas = () => conversa.slice();

  /* Mantido para quem ainda chama Ug.registrar: agora registrar é
     abrir a troca na conversa, que é o que Ug.novaResposta faz. */
  Ug.registrar = function () {};

  const hora = (d) => d.toLocaleTimeString(((window.U && U.LOCALE) || 'pt-BR'), { hour: '2-digit', minute: '2-digit' });

  function rolaParaOFim() {
    const corpo = document.getElementById('uglezCorpo');
    if (!corpo) return;
    const reduzir = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    corpo.scrollTo({ top: corpo.scrollHeight, behavior: reduzir ? 'auto' : 'smooth' });
  }

  /**
   * Abre uma troca na conversa: a bolha da pergunta e, logo abaixo,
   * a mensagem da UGLEZ ainda "digitando". Devolve o destino que
   * AI.perguntar preenche.
   */
  Ug.novaResposta = function (pergunta) {
    const box = document.getElementById('uglezHistorico');
    if (!box) return null;
    const troca = { pergunta, resposta: null, quando: new Date() };
    conversa.push(troca);

    box.appendChild(el('div', { class: 'uglez-msg is-pessoa' }, [
      el('div', { class: 'uglez-bolha', text: pergunta }),
      el('span', { class: 'uglez-msg-hora', text: hora(troca.quando) })
    ]));

    const caixa = el('div', { class: 'ai-answer' });
    const acoes = el('div', { class: 'uglez-msg-acoes', hidden: true });
    box.appendChild(el('div', { class: 'uglez-msg is-uglez' }, [
      el('span', { class: 'uglez-avatar', 'aria-hidden': 'true' }),
      el('div', { class: 'uglez-msg-corpo' }, [
        el('span', { class: 'uglez-msg-nome', text: 'UGLEZ' }),
        caixa,
        acoes
      ])
    ]));
    renderHistorico();
    rolaParaOFim();

    return {
      caixa,
      aoCarregar: (alvo, texto) => {
        U.clear(alvo);
        alvo.appendChild(el('span', { class: 'uglez-digitando', 'aria-hidden': 'true' }, [el('i'), el('i'), el('i')]));
        alvo.appendChild(el('span', { class: 'uglez-digitando-texto', text: texto + '…' }));
      },
      aoResponder: (alvo, texto) => {
        troca.resposta = texto;
        U.clear(acoes);
        acoes.hidden = false;
        acoes.appendChild(el('button', {
          type: 'button', class: 'uglez-acao', 'aria-label': 'Copiar resposta',
          onclick: async (ev) => {
            const b = ev.currentTarget;
            try {
              await navigator.clipboard.writeText(texto);
              b.classList.add('is-feito');
              b.lastChild.textContent = 'Copiado';
              setTimeout(() => { b.classList.remove('is-feito'); b.lastChild.textContent = 'Copiar'; }, 1800);
            } catch (e) { UI.toast('Não foi possível copiar.', 'error'); }
          }
        }, [
          el('span', {
            class: 'uglez-acao-ico', 'aria-hidden': 'true',
            html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>'
          }),
          el('span', { text: 'Copiar' })
        ]));
        acoes.appendChild(el('button', {
          type: 'button', class: 'uglez-acao', 'aria-label': 'Perguntar de novo',
          onclick: () => AI.ask(pergunta)
        }, [Icons.lucide('repeat', 14), el('span', { text: 'Refazer' })]));
        rolaParaOFim();
      },
      aoTerminar: () => { rolaParaOFim(); }
    };
  };

  /** Mostra as boas-vindas só enquanto a conversa está vazia. */
  function renderHistorico() {
    const box = document.getElementById('uglezHistorico');
    const boas = document.getElementById('uglezBoasVindas');
    const nova = document.getElementById('btnUglezNova');
    const vazia = !conversa.length;
    if (box) box.hidden = vazia;
    if (boas) boas.hidden = !vazia;
    if (nova) nova.hidden = vazia;
    const pagina = document.querySelector('.uglez-page');
    if (pagina) pagina.classList.toggle('tem-conversa', !vazia);
  }

  function novaConversa() {
    conversa.length = 0;
    const box = document.getElementById('uglezHistorico');
    if (box) U.clear(box);
    renderHistorico();
    const campo = document.getElementById('aiQuestion');
    if (campo) campo.focus();
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
    U.$$('#uglezEscopo [data-escopo]').forEach((b) => b.addEventListener('click', () => {
      escopoAtual = b.dataset.escopo;
      try { localStorage.setItem(CHAVE_ESCOPO, escopoAtual); } catch (e) { /* fica na memória */ }
      Ug.render();
    }));
    const nova = document.getElementById('btnUglezNova');
    if (nova) nova.addEventListener('click', novaConversa);
  }

  Ug.render = function () {
    ligarUmaVez();
    const visual = garantirFormacao();
    if (visual && visual.medir) visual.medir();
    pintaEscopo();
    renderContexto();
    renderHistorico();
    renderCartoes();

    const saudacao = document.getElementById('uglezSaudacao');
    if (saudacao) {
      const nome = String(Store.ownerName() || '').trim().split(/\s+/)[0];
      const h = new Date().getHours();
      const periodo = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
      saudacao.textContent = (nome ? `${periodo}, ${nome}.` : `${periodo}.`) + ' Sobre o que vamos conversar?';
    }

    /* ESTADO SEM DADOS. A regra é a mesma do resto do app: sem
       movimentação no mês, nada de número, nada de gráfico, nada de
       análise. O que aparece é o motivo e o caminho de saída. */
    const t = Calc.monthTotals(App.ym);
    const temDado = !!(t.entries && t.entries.length);
    const totalMovimentos = t.entries ? t.entries.length : 0;
    const movimentos = document.getElementById('uglezMovimentos');
    const fonteLocal = document.getElementById('uglezFonteLocal');
    if (movimentos) movimentos.textContent = totalMovimentos +
      (totalMovimentos === 1 ? ' lançamento' : ' lançamentos');
    if (fonteLocal) fonteLocal.textContent = temDado
      ? 'Local'
      : 'Sem dados';
    const semDados = document.getElementById('uglezSemDados');
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
    const escopo = Ug.escopo();
    if (campo) campo.placeholder = escopo !== 'mes'
      ? 'Pergunte sobre o seu ano…'
      : temDado ? 'Pergunte sobre ' + U.frase(U.monthLabel(App.ym)) + '…'
        : 'Sem lançamentos neste mês — escolha "Ano" para ler os outros meses.';
    /* "Sem dados no mês" só faz sentido quando a leitura É o mês. Com
       o ano no alcance, um mês vazio não impede a conversa. */
    if (semDados && escopo !== 'mes') semDados.hidden = true;
    void botao;

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

  /** Chips de pergunta da home: levam para a conversa e perguntam. */
  function renderChips(id) {
    const box = document.getElementById(id);
    if (!box) return;
    U.clear(box);
    Ug.sugestoes().forEach((s) => {
      box.appendChild(el('button', {
        class: 'ai-chip', type: 'button', text: s.rotulo,
        onclick: () => {
          App.goTo('uglez');
          setTimeout(() => AI.ask(s.q), 60);
        }
      }));
    });
  }
  Ug.renderChips = renderChips;

  /** Cartões de começo de conversa, como nos assistentes de IA. */
  function renderCartoes() {
    const box = document.getElementById('uglezChipsFull');
    if (!box) return;
    U.clear(box);
    Ug.sugestoes().forEach((s) => {
      box.appendChild(el('button', {
        class: 'uglez-cartao', type: 'button',
        onclick: () => AI.ask(s.q)
      }, [
        el('span', { class: 'uglez-cartao-ico' }, Icons.lucide(s.icone || 'sparkles', 16)),
        el('span', { class: 'uglez-cartao-t', text: s.rotulo }),
        el('span', { class: 'uglez-cartao-s', text: s.sub || '' })
      ]));
    });
  }

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
