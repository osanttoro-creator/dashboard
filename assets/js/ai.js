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
     1 · RESUMO FINANCEIRO ENVIADO AO MODELO
     ============================================================ */

  const money = (n) => U.fmtBRL(n);

  /** Monta o resumo do perfil/mês ativos. Nenhum outro perfil entra. */
  AI.buildSummary = function () {
    const prof = Store.profile();
    const ym = App.ym;
    const prevYM = U.addMonths(ym, -1);
    const monthEnd = U.monthEnd(ym);
    const L = [];

    const t = Calc.monthTotals(ym);
    const prev = Calc.monthTotals(prevYM);
    const opening = Calc.openingBalanceOfMonth(ym);

    L.push(`PERFIL: ${prof.name}`);
    L.push(`MÊS DE REFERÊNCIA: ${U.monthLabel(ym)} (hoje é ${U.fmtDateBR(U.todayISO())})`);
    L.push('');

    L.push('## Resumo do mês (somente lançamentos CONFIRMADOS)');
    L.push(`- Saldo inicial: ${money(opening)}`);
    L.push(`- Receitas: ${money(t.income)} (mês anterior: ${money(prev.income)})`);
    L.push(`- Despesas: ${money(t.expense)} (mês anterior: ${money(prev.expense)})`);
    L.push(`- Saldo do mês: ${money(t.balance)}`);
    L.push(`- Saldo final projetado: ${money(opening + t.balance)}`);
    if (t.income > 0) L.push(`- Taxa de poupança: ${U.fmtPct((t.balance / t.income) * 100)} da receita`);
    L.push('');

    if (t.pendingCount > 0) {
      L.push('## Previstos ainda NÃO confirmados (fora dos totais acima)');
      L.push(`- Receitas previstas: ${money(t.pendingIncome)}`);
      L.push(`- Despesas previstas: ${money(t.pendingExpense)}`);
      L.push(`- Se tudo se confirmar, o saldo do mês vira ${money(t.plannedBalance)}`);
      const pend = t.entries.filter((e) => !e.confirmed && e.kind !== 'transfer').slice(0, 12);
      pend.forEach((e) => L.push(`  · ${U.fmtDayMonth(e.date)} ${e.description} — ${money(e.amount)} (${e.kind === 'income' ? 'receita' : 'despesa'}, ${Calc.categoryName(e.categoryId)})`));
      L.push('');
    }

    /* despesas por categoria, com comparação */
    const cats = Calc.categoryTotals('expense', U.monthStart(ym), U.monthEnd(ym));
    const catsPrev = Calc.categoryTotals('expense', U.monthStart(prevYM), U.monthEnd(prevYM));
    const prevById = new Map(catsPrev.map((c) => [c.id, c.total]));
    if (cats.length) {
      L.push('## Despesas por categoria neste mês (vs. mês anterior)');
      cats.forEach((c) => {
        const p = prevById.get(c.id) || 0;
        const delta = p > 0 ? ` — variação ${((c.total - p) / p * 100).toFixed(0)}%` : ' — não havia no mês anterior';
        L.push(`- ${c.name}: ${money(c.total)} (${U.fmtPct(c.pct, 0)} do total; anterior ${money(p)}${delta})`);
      });
      L.push('');
    }

    const inc = Calc.categoryTotals('income', U.monthStart(ym), U.monthEnd(ym));
    if (inc.length) {
      L.push('## Receitas por categoria neste mês');
      inc.forEach((c) => L.push(`- ${c.name}: ${money(c.total)} (${U.fmtPct(c.pct, 0)})`));
      L.push('');
    }

    /* fixas x variáveis */
    const conf = t.entries.filter((e) => e.confirmed && e.kind === 'expense');
    const fixas = U.sum(conf.filter((e) => e.recurring), (e) => e.amount);
    const variaveis = U.sum(conf.filter((e) => !e.recurring), (e) => e.amount);
    if (conf.length) {
      L.push('## Estrutura das despesas confirmadas');
      L.push(`- Fixas (recorrentes): ${money(fixas)}`);
      L.push(`- Variáveis: ${money(variaveis)}`);
      L.push('');
    }

    /* histórico */
    const serie = Calc.monthlySeries(U.addMonths(ym, -5), ym);
    L.push('## Últimos 6 meses');
    serie.forEach((r) => L.push(`- ${U.monthLabel(r.ym)}: receitas ${money(r.income)} | despesas ${money(r.expense)} | saldo ${money(r.balance)}`));
    L.push('');

    /* contas */
    if (prof.accounts.length) {
      L.push('## Contas');
      prof.accounts.forEach((a) => {
        L.push(`- ${a.name} (${a.bank || 'sem banco'}, ${a.type}): saldo ${money(Calc.accountBalance(a.id, monthEnd))}`);
      });
      L.push(`- Soma em contas: ${money(Calc.totalAccountsBalance(monthEnd))}`);
      L.push('');
    }

    /* cartões */
    if (prof.cards.length) {
      L.push('## Cartões de crédito');
      prof.cards.forEach((card) => {
        const ref = Calc.currentInvoiceRef(card, ym);
        const invoice = Calc.invoice(card.id, ref);
        const used = Calc.cardUsed(card.id);
        const pct = card.limit > 0 ? ` (${U.fmtPct(used / card.limit * 100, 0)} do limite de ${money(card.limit)})` : '';
        L.push(`- ${card.name}: fatura de ${U.monthLabel(ref)} = ${money(invoice.planned)}, vence ${U.fmtDateBR(invoice.dueDate)}, ${invoice.paid ? 'PAGA' : invoice.isOverdue ? 'VENCIDA' : invoice.isOpen ? 'em aberto' : 'fechada e a pagar'}`);
        L.push(`  · comprometido em faturas não pagas: ${money(used)}${pct}`);
      });
      L.push('');
    }

    /* investimentos */
    if (prof.investments.length) {
      const value = Calc.investedTotal(monthEnd);
      const contributed = Calc.contributedTotal(monthEnd);
      L.push('## Investimentos');
      L.push(`- Total aportado: ${money(contributed)}`);
      L.push(`- Valor atual estimado: ${money(value)} (rendimento ${money(value - contributed)})`);
      const byType = U.groupBy(prof.investments.filter((i) => i.date <= monthEnd), (i) => i.type);
      byType.forEach((list, type) => {
        L.push(`- ${type}: ${money(U.sum(list, (i) => Calc.investmentValueAt(i, monthEnd)))} em ${list.length} aporte(s)`);
      });
      L.push('');
    }

    return L.join('\n');
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
  AI.ask = async function (question) {
    const box = document.getElementById('aiAnswer');
    if (!box) return;

    const q = String(question || '').trim();
    if (!q) { UI.toast('Escreva uma pergunta primeiro.', 'error'); return; }
    if (busy) return;

    const modo = AI.modo();
    if (modo.chave !== 'servidor') { AI.explicarIndisponivel(modo); return; }

    busy = true;
    const btn = document.getElementById('btnAiAsk');
    if (btn) { btn.disabled = true; btn.textContent = 'Pensando…'; }
    box.hidden = false;
    box.className = 'ai-answer is-loading';
    /* aria-live faz o leitor de tela anunciar a chegada da resposta
       sem que a pessoa precise sair procurando. */
    box.setAttribute('aria-live', 'polite');
    box.setAttribute('aria-busy', 'true');
    box.textContent = 'Analisando os dados de ' + U.monthLabel(App.ym);

    try {
      const r = await AI.chamarFuncao({
        pergunta: q,
        periodo: App.ym,
        resumo: AI.resumoAgregado()
      });

      if (r.erro === 'sem_sessao') {
        renderError(box, 'Sua sessão expirou. Entre de novo para continuar.');
        return;
      }
      if (r.erro === 'limite') {
        const u = r.usado || {};
        const l = r.limites || {};
        renderError(box, 'Você usou ' + (u.dia || 0) + ' de ' + (l.por_dia || '?') +
          ' perguntas hoje. O limite recomeça amanhã.');
        return;
      }
      if (r.erro) {
        renderError(box, r.mensagem || 'O assistente está indisponível agora.');
        return;
      }
      if (!r.texto) {
        renderError(box, 'A resposta veio vazia. Tente reformular a pergunta.');
        return;
      }

      box.className = 'ai-answer';
      box.innerHTML = renderMarkdown(r.texto);
      box.appendChild(el('div', { class: 'ai-meta' }, [
        el('span', { text: 'Orientativo, não é consultoria financeira.' }),
        r.uso ? el('span', { text: ' · ' + r.uso.dia + ' de ' + r.uso.limite_dia + ' hoje' }) : null
      ].filter(Boolean)));
    } catch (e) {
      console.error('UGLEZ:', e);
      renderError(box, 'Não foi possível falar com o assistente. Verifique a conexão e tente de novo.');
    } finally {
      box.setAttribute('aria-busy', 'false');
      busy = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Perguntar'; }
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
    if (/chave/i.test(message)) {
      box.appendChild(el('div', { style: { marginTop: '10px' } },
        el('button', { class: 'btn btn-outline btn-sm', text: '⚙ Configurar chave', onclick: () => AI.openConfig() })));
    }
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
    const caixa = document.getElementById('aiAskBox');
    const abrir = document.getElementById('btnAiOpen');

    if (abrir && caixa) {
      abrir.addEventListener('click', () => {
        const aberto = abrir.getAttribute('aria-expanded') === 'true';
        abrir.setAttribute('aria-expanded', aberto ? 'false' : 'true');
        caixa.hidden = aberto;
        if (!aberto && field) field.focus();
      });
    }
    if (btnAsk && field) {
      btnAsk.addEventListener('click', () => AI.ask(field.value));
      field.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); AI.ask(field.value); }
      });
    }
    U.$$('[data-ai-q]').forEach((chip) => {
      chip.addEventListener('click', () => {
        if (field) field.value = chip.dataset.aiQ;
        AI.ask(chip.dataset.aiQ);
      });
    });
  };

  global.AI = AI;
})(window);
