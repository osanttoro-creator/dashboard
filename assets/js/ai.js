/* =============================================================
   ai.js — sugestões de organização financeira via API da Anthropic
   ------------------------------------------------------------
   · A chave é do próprio usuário e fica só no localStorage deste
     navegador. Nunca é embutida no código nem enviada a outro
     servidor além de api.anthropic.com.
   · O resumo enviado cobre APENAS o perfil e o mês selecionados,
     e respeita as convenções contábeis do app (só confirmado
     entra nos totais; cartão conta na data da compra).
   · Sem chave configurada, a seção fica inerte — o resto do app
     não depende dela.
   ============================================================= */
(function (global) {
  'use strict';

  const AI = {};
  const el = U.el;

  const KEY = 'financas.anthropicKey';
  const ENDPOINT = 'https://api.anthropic.com/v1/messages';
  const MODEL = 'claude-opus-5';

  let busy = false;

  /* ---------------- chave ---------------- */

  AI.getKey = function () {
    try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; }
  };
  AI.setKey = function (k) {
    try {
      if (k) localStorage.setItem(KEY, k); else localStorage.removeItem(KEY);
      return true;
    } catch (e) { return false; }
  };
  AI.hasKey = () => !!AI.getKey();

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

  AI.ask = async function (question) {
    const box = document.getElementById('aiAnswer');
    if (!box) return;

    const q = String(question || '').trim();
    if (!q) { UI.toast('Escreva uma pergunta primeiro.', 'error'); return; }
    if (!AI.hasKey()) { AI.openConfig(); return; }
    if (busy) return;

    busy = true;
    const btn = document.getElementById('btnAiAsk');
    if (btn) { btn.disabled = true; btn.textContent = 'Pensando…'; }
    box.hidden = false;
    box.className = 'ai-answer is-loading';
    box.textContent = 'Analisando os dados de ' + U.monthLabel(App.ym);

    try {
      const resp = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': AI.getKey(),
          'anthropic-version': '2023-06-01',
          // sem este cabeçalho o navegador é bloqueado por CORS
          'anthropic-dangerous-direct-browser-access': 'true',
          'anthropic-beta': 'server-side-fallback-2026-07-01'
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 16000,
          system: SYSTEM,
          output_config: { effort: 'medium' },
          fallbacks: 'default',
          messages: [{
            role: 'user',
            content: `${AI.buildSummary()}\n\n---\n\nPERGUNTA: ${q}`
          }]
        })
      });

      if (!resp.ok) {
        const raw = await resp.text();
        throw new Error(friendlyError(resp.status, raw));
      }

      const data = await resp.json();

      // refusal chega com HTTP 200 e content vazio — checar ANTES de ler content
      if (data.stop_reason === 'refusal') {
        renderError(box, 'O modelo recusou responder a esta solicitação. Reformule a pergunta.');
        return;
      }

      const text = (data.content || [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n').trim();

      if (!text) {
        renderError(box, 'A resposta veio vazia. Tente novamente ou reformule a pergunta.');
        return;
      }

      box.className = 'ai-answer';
      box.innerHTML = renderMarkdown(text);

      const u = data.usage || {};
      box.appendChild(el('div', {
        class: 'ai-meta',
        text: `${MODEL} · ${U.fmtInt(u.input_tokens || 0)} tokens de entrada, ${U.fmtInt(u.output_tokens || 0)} de saída` +
          (data.stop_reason === 'max_tokens' ? ' · resposta cortada no limite de tokens' : '')
      }));
    } catch (e) {
      console.error('IA:', e);
      renderError(box, e.message || 'Falha na chamada.');
    } finally {
      busy = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Pedir sugestão'; }
    }
  };

  function friendlyError(status, raw) {
    let apiMsg = '';
    try { apiMsg = (JSON.parse(raw).error || {}).message || ''; } catch (e) { /* texto cru */ }
    if (status === 401) return 'Chave de API inválida ou revogada. Confira em "⚙ Configurar chave".';
    if (status === 403) return 'Esta chave não tem permissão para usar este modelo.';
    if (status === 404) return 'Modelo não encontrado para esta chave.';
    if (status === 429) return 'Limite de uso excedido. Aguarde um pouco e tente de novo.';
    if (status === 400) return 'A API recusou a requisição' + (apiMsg ? ': ' + apiMsg : '.');
    if (status >= 500) return 'A API da Anthropic está indisponível no momento. Tente mais tarde.';
    return `Erro ${status}${apiMsg ? ': ' + apiMsg : ''}`;
  }

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

  AI.openConfig = function () {
    const input = el('input', {
      class: 'input', type: 'password', value: AI.getKey(),
      placeholder: 'sk-ant-api03-…', autocomplete: 'off', spellcheck: 'false'
    });

    const body = el('div', {}, [
      el('div', { class: 'parse-info' }, el('div', {
        html: 'Esta função é <strong>opcional</strong> e usa a <strong>sua</strong> chave da API da Anthropic, ' +
          'cobrada por uso conforme a tabela de preços deles. Sem chave, o resto do painel funciona igual.'
      })),
      el('div', { class: 'field' }, [
        el('span', { class: 'field-label', text: 'Chave da API (x-api-key)' }),
        input,
        el('p', {
          class: 'hint',
          html: 'Crie em <strong>console.anthropic.com → API Keys</strong>. A chave fica salva apenas no ' +
            'localStorage deste navegador e vai direto para <code>api.anthropic.com</code> — não passa por mais nenhum servidor.'
        })
      ]),
      el('div', { class: 'parse-info is-warn', style: { marginTop: '14px' } }, el('div', {
        html: '<strong>Cuidado:</strong> qualquer pessoa com acesso a este navegador consegue ler a chave. ' +
          'Se hospedar o painel na internet, prefira uma chave com limite de gasto baixo e revogue-a se suspeitar de vazamento.'
      })),
      el('div', { style: { marginTop: '14px' } }, [
        el('span', { class: 'field-label', text: 'O que é enviado' }),
        el('p', {
          class: 'hint',
          text: 'Apenas o resumo do perfil e do mês selecionados: saldos, totais por categoria, faturas e investimentos. ' +
            'Nenhum outro perfil é incluído, e a chave nunca sai deste navegador a não ser para a própria API.'
        }),
        el('button', {
          class: 'btn btn-ghost btn-sm', style: { marginTop: '6px' }, text: 'Ver o resumo exato que seria enviado',
          onclick: () => {
            UI.openModal({
              title: 'Resumo que seria enviado à API',
              wide: true,
              body: el('textarea', { class: 'input textarea', rows: 22, readonly: true, text: AI.buildSummary() }),
              buttons: [{ label: 'Voltar', class: 'btn-primary', onClick: () => AI.openConfig() }]
            });
          }
        })
      ])
    ]);

    UI.openModal({
      title: 'Sugestões com IA — configuração',
      wide: true,
      body,
      buttons: [
        AI.hasKey() ? {
          label: 'Remover chave', class: 'btn-ghost', align: 'left',
          onClick: () => { AI.setKey(''); UI.toast('Chave removida deste navegador.'); UI.closeModal(); }
        } : null,
        { label: 'Cancelar', class: 'btn-outline', onClick: UI.closeModal },
        {
          label: 'Salvar', class: 'btn-ai',
          onClick: () => {
            const v = input.value.trim();
            if (v && !/^sk-ant-/.test(v)) {
              UI.toast('Chaves da Anthropic começam com "sk-ant-". Confira antes de salvar.', 'error');
              return;
            }
            AI.setKey(v);
            UI.toast(v ? 'Chave salva neste navegador.' : 'Chave removida.', v ? 'success' : null);
            UI.closeModal();
          }
        }
      ].filter(Boolean)
    });
  };

  /* ---------------- ligação com a página ---------------- */

  AI.init = function () {
    const btnCfg = document.getElementById('btnAiConfig');
    if (btnCfg) btnCfg.addEventListener('click', () => AI.openConfig());

    const btnAsk = document.getElementById('btnAiAsk');
    const field = document.getElementById('aiQuestion');
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
