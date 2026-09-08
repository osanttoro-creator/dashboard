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

  /* Perguntas oferecidas. Ficam aqui para a home e a página usarem a
     mesma lista — dois lugares com perguntas diferentes confundiria. */
  Ug.SUGESTOES = [
    { rotulo: 'Onde posso economizar?', q: 'Onde posso cortar gastos este mês, olhando as maiores categorias?' },
    { rotulo: 'Comparar com mês anterior', q: 'Como estão minhas despesas comparadas ao mês passado, por categoria?' },
    { rotulo: 'Planejar próximo mês', q: 'Monte um plano simples de organização financeira para o próximo mês.' },
    { rotulo: 'Como está minha reserva?', q: 'Minha reserva de emergência está adequada? Quanto tempo ela cobre?' }
  ];

  /**
   * O período que está sendo lido, e a cota que resta.
   *
   * O PERÍODO precisa aparecer porque o app tem seletor de mês: sem
   * ele, quem voltou para março vê quatro cartões afirmando coisas
   * e não sabe sobre quando. "Subiu 18%" sem data é uma frase que
   * não pode ser conferida.
   *
   * A COTA precisa aparecer aqui, e não só em Configurações, porque
   * é aqui que ela é gasta. Escondida na outra tela, a pessoa
   * descobre o limite ao bater nele.
   */
  function renderContexto() {
    const alvo = document.getElementById('uglezPeriodo');
    if (alvo) {
      alvo.textContent = 'Período analisado: ' +
        U.smartCase(U.monthLabel(App.ym)) + '.';
    }

    const cota = document.getElementById('uglezCota');
    if (!cota) return;

    const modo = AI.modo();
    if (modo.chave !== 'servidor' || !global.Limites) { cota.hidden = true; return; }

    const c = Limites.consumoIA();
    /* limite null = ilimitado. Escrever "0 de null" seria pior do
       que não escrever nada. */
    if (c.limite === null || c.limite === undefined) { cota.hidden = true; return; }

    const resta = Math.max(0, c.limite - c.usado);
    cota.hidden = false;
    cota.className = 'uglez-cota' + (resta === 0 ? ' is-esgotada' : resta <= 2 ? ' is-pouca' : '');
    cota.textContent = resta === 0
      ? 'Você usou as ' + c.limite + ' consultas do seu plano neste mês. Elas voltam no dia 1º.'
      : resta + ' de ' + c.limite + ' consultas restantes neste mês. ' +
        'Erro nosso ou indisponibilidade não consomem consulta.';
  }
  Ug.renderContexto = renderContexto;

  Ug.render = function () {
    renderContexto();
    renderInsights();
    renderChips('uglezChipsFull');
    const modo = AI.modo();
    document.getElementById('uglezMode').textContent =
      modo.chave === 'servidor'
        ? 'Respondendo por servidor autenticado — nenhuma chave de IA neste navegador'
        : modo.chave === 'sem-sessao'
          ? 'Entre na sua conta para conversar. As leituras acima não precisam disso.'
          : 'Assistente indisponível neste ambiente. As leituras acima continuam funcionando.';
  };

  /** Chips de pergunta, reusados na home e na página. */
  function renderChips(id) {
    const box = document.getElementById(id);
    if (!box) return;
    U.clear(box);
    Ug.SUGESTOES.forEach((s) => {
      box.appendChild(el('button', {
        class: 'ai-chip', 'data-ai-q': s.q, text: s.rotulo,
        onclick: () => { App.goTo('uglez'); setTimeout(() => AI.ask(s.q), 60); }
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
