/* =============================================================
   pages/uglez.js — UGLEZ
   ------------------------------------------------------------
   Os insights desta página são ARITMÉTICA LOCAL sobre o Calc, não
   respostas de modelo. Isso importa por dois motivos: aparecem
   para quem nunca configurou nada, e nenhum dado sai do navegador
   para produzi-los.

   Só a caixa "Conversar" chama a API — e, quando publicado, ela
   passa pelo backend (ver api/uglez.js).
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

  Ug.render = function () {
    renderInsights();
    renderChips('uglezChipsFull');
    const modo = AI.modo();
    document.getElementById('uglezMode').textContent =
      modo.chave === 'backend' ? 'Respondendo pelo servidor — nenhuma chave no navegador'
        : modo.chave === 'local' ? 'Respondendo com a sua chave, guardada só neste aparelho'
          : 'Configure uma chave para conversar. Os insights acima não precisam dela.';
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

    /* 3 · previsão — projeção de sobra anual no ritmo atual */
    const sobra = U.round2(t.income - t.expense);
    out.push({
      tipo: sobra >= 0 ? 'previsao' : 'risco',
      icone: 'chart-line',
      titulo: sobra >= 0 ? 'Se mantiver o ritmo' : 'Atenção ao ritmo',
      linha: sobra >= 0
        ? `${U.fmtBRL(U.round2(sobra * 12))} em um ano`
        : `Faltam ${U.fmtBRL(Math.abs(sobra))} neste mês`,
      detalhe: sobra >= 0
        ? `Você está guardando ${U.fmtBRL(sobra)} por mês.`
        : 'As despesas passaram as receitas. Vale olhar as maiores categorias.',
      acao: { rotulo: 'Ver análises', ir: () => App.goTo('reports') }
    });

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
