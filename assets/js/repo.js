/* =============================================================
   repo.js — a tradução entre o app e o banco normalizado
   ------------------------------------------------------------
   O app inteiro trabalha com um "perfil": um objeto com arrays de
   contas, cartões, categorias, lançamentos. O banco trabalha com
   tabelas ligadas por UUID. Este arquivo é a única fronteira entre
   os dois mundos — e existir num lugar só é o ponto: qualquer
   campo novo se traduz aqui, e nenhuma página precisa saber que o
   Supabase existe.

   IDENTIDADE, E POR QUE HÁ DOIS IDs
   No localStorage o id é uma string como "acc_k3f9". No banco é
   um UUID. Guardamos o antigo em `legacy_id` porque ele é a chave
   da idempotência: reimportar o mesmo perfil encontra as linhas
   que já existem em vez de criar cópias. Sem isso, um F5 no meio
   da migração duplicaria um ano de lançamentos.

   ORDEM DE INSERÇÃO
   Não é arbitrária: cartão aponta para conta, lançamento aponta
   para categoria, conta e cartão. Inserir fora de ordem quebraria
   a chave estrangeira ou gravaria null onde havia ligação.
   ============================================================= */
(function (global) {
  'use strict';

  const Repo = {};

  /* Um pedaço grande de uma vez é mais rápido, mas um erro derruba
     o lote inteiro e o diagnóstico fica pior. 200 é o meio-termo:
     poucas viagens e uma falha ainda aponta para onde olhar. */
  const LOTE = 200;

  function cliente() {
    const c = global.SupabaseBackend && SupabaseBackend.cliente && SupabaseBackend.cliente();
    if (!c) throw new Error('Sem conexão com o Supabase.');
    return c;
  }

  /** Nome curto do aparelho, para saber de onde veio cada linha. */
  Repo.origem = function () {
    const ua = navigator.userAgent;
    const nome = /iPhone|iPad/.test(ua) ? 'iOS'
      : /Android/.test(ua) ? 'Android'
        : /Mac/.test(ua) ? 'Mac'
          : /Windows/.test(ua) ? 'Windows' : 'web';
    return nome + ' · ' + (navigator.language || 'pt-BR');
  };

  const dataOu = (v, alt) => (U.isValidISO(v) ? v : alt);
  const num = (v) => U.round2(+v || 0);

  /* ============================================================
     1 · APP → BANCO
     ============================================================ */

  Repo.mapa = {
    conta: (a, ws) => ({
      workspace_id: ws, legacy_id: a.id,
      name: String(a.name || 'Conta').slice(0, 80),
      bank: String(a.bank || ''),
      tipo: String(a.type || 'Conta corrente'),
      cor: a.color, gradiente: a.gradient || null,
      last4: String(a.last4 || ''),
      saldo_inicial: num(a.openingBalance),
      aberta_em: dataOu(a.openedAt, U.todayISO()),
      arquivada: !!a.archived,
      origem: Repo.origem()
    }),

    cartao: (c, ws, idDe) => ({
      workspace_id: ws, legacy_id: c.id,
      name: String(c.name || 'Cartão').slice(0, 80),
      bank: String(c.bank || ''),
      cor: c.color, gradiente: c.gradient || null,
      last4: String(c.last4 || ''),
      limite: num(c.limit),
      dia_fechamento: Math.min(31, Math.max(1, +c.closingDay || 1)),
      dia_vencimento: Math.min(31, Math.max(1, +c.dueDay || 10)),
      account_id: idDe.contas[c.accountId] || null,
      origem: Repo.origem()
    }),

    categoria: (c, ws) => ({
      workspace_id: ws, legacy_id: c.id,
      name: String(c.name || 'Categoria').slice(0, 60),
      kind: c.kind === 'income' ? 'income' : 'expense',
      cor: c.color, icone: c.icon || null,
      origem: Repo.origem()
    }),

    lancamento: (t, ws, idDe) => ({
      workspace_id: ws, legacy_id: t.id,
      kind: t.kind,
      descricao: String(t.description || '').slice(0, 200),
      valor: Math.abs(num(t.amount)),
      data: dataOu(t.date, U.todayISO()),
      category_id: idDe.categorias[t.categoryId] || null,
      metodo: t.method === 'card' ? 'card' : 'account',
      account_id: idDe.contas[t.accountId] || null,
      to_account_id: idDe.contas[t.toAccountId] || null,
      card_id: idDe.cartoes[t.cardId] || null,
      recorrente: !!t.recurring,
      recorrencia_fim: t.recurEnd || null,
      confirmado: t.confirmed !== false,
      /* Atributos da linha, não entidades — ver o cabeçalho. */
      ocorrencias: t.occ && typeof t.occ === 'object' ? t.occ : {},
      parcelamento: t.installment || null,
      notas: String(t.notes || ''),
      origem_registro: String(t.source || 'manual'),
      origem: Repo.origem()
    }),

    investimento: (i, ws, idDe) => ({
      workspace_id: ws, legacy_id: i.id,
      name: String(i.name || 'Investimento').slice(0, 80),
      tipo: String(i.type || 'Renda fixa'),
      valor: num(i.amount),
      data: dataOu(i.date, U.todayISO()),
      taxa: +i.rate || 0,
      valor_atual: i.currentValue == null ? null : num(i.currentValue),
      account_id: idDe.contas[i.accountId] || null,
      notas: String(i.notes || ''),
      origem: Repo.origem()
    }),

    meta: (g, ws, idDe) => ({
      workspace_id: ws, legacy_id: g.id,
      name: String(g.name || 'Meta').slice(0, 60),
      alvo: num(g.target), guardado: num(g.saved),
      prazo: U.isValidISO(g.deadline) ? g.deadline : null,
      cor: g.color, icone: g.icon || 'target',
      account_id: idDe.contas[g.accountId] || null,
      origem: Repo.origem()
    })
  };

  /* ============================================================
     2 · ENVIO DE UM ESPAÇO INTEIRO
     ============================================================ */

  /**
   * Grava (ou reaproveita) o espaço e tudo dentro dele.
   *
   * Idempotente por construção: cada upsert usa `legacy_id` como
   * chave de conflito, então rodar duas vezes atualiza as mesmas
   * linhas em vez de criar outras.
   *
   * @param {object} perfil  perfil do Store
   * @param {string} userId  dono
   * @param {function} aviso  recebe ('contas', 12) para a barra de progresso
   */
  Repo.enviarEspaco = async function (perfil, userId, aviso) {
    const sb = cliente();
    const diga = aviso || function () {};

    /* ---- o espaço ---- */
    const { data: ws, error: eWs } = await sb.from('workspaces').upsert({
      owner_id: userId,
      legacy_id: perfil.id,
      name: String(perfil.name || 'Pessoal').slice(0, 60),
      origem: Repo.origem()
    }, { onConflict: 'owner_id,legacy_id' }).select('id').single();
    if (eWs) throw new Error('espaço: ' + eWs.message);
    const wsId = ws.id;

    /* A participação é o que o RLS consulta. Sem ela, as próprias
       inserções abaixo seriam negadas — o dono não é membro por
       decreto, é membro por linha. */
    const { error: eM } = await sb.from('workspace_members')
      .upsert({ workspace_id: wsId, user_id: userId, papel: 'owner' },
        { onConflict: 'workspace_id,user_id' });
    if (eM) throw new Error('participação: ' + eM.message);

    const idDe = { contas: {}, cartoes: {}, categorias: {} };
    const contagens = { contas: 0, cartoes: 0, categorias: 0, lancamentos: 0, investimentos: 0, faturas: 0, orcamentos: 0, metas: 0 };

    /** Envia em lotes e devolve o mapa legacy_id → uuid. */
    async function enviar(tabela, linhas, guardarEm) {
      if (!linhas.length) return;
      for (let i = 0; i < linhas.length; i += LOTE) {
        const pedaco = linhas.slice(i, i + LOTE);
        const { data, error } = await sb.from(tabela)
          .upsert(pedaco, { onConflict: 'workspace_id,legacy_id', ignoreDuplicates: false })
          .select('id, legacy_id');
        if (error) throw new Error(tabela + ': ' + error.message);
        if (guardarEm) (data || []).forEach((r) => { guardarEm[r.legacy_id] = r.id; });
      }
    }

    /* ---- ordem obrigatória: quem é apontado vem antes ---- */
    const contas = (perfil.accounts || []).map((a) => Repo.mapa.conta(a, wsId));
    await enviar('accounts', contas, idDe.contas);
    contagens.contas = contas.length; diga('contas', contas.length);

    const cats = (perfil.categories || []).map((c) => Repo.mapa.categoria(c, wsId));
    await enviar('categories', cats, idDe.categorias);
    contagens.categorias = cats.length; diga('categorias', cats.length);

    const cartoes = (perfil.cards || []).map((c) => Repo.mapa.cartao(c, wsId, idDe));
    await enviar('credit_cards', cartoes, idDe.cartoes);
    contagens.cartoes = cartoes.length; diga('cartões', cartoes.length);

    const txs = (perfil.transactions || []).map((t) => Repo.mapa.lancamento(t, wsId, idDe));
    await enviar('transactions', txs);
    contagens.lancamentos = txs.length; diga('lançamentos', txs.length);

    const invs = (perfil.investments || []).map((i) => Repo.mapa.investimento(i, wsId, idDe));
    await enviar('investments', invs);
    contagens.investimentos = invs.length; diga('investimentos', invs.length);

    const metas = (perfil.goals || []).map((g) => Repo.mapa.meta(g, wsId, idDe));
    await enviar('goals', metas);
    contagens.metas = metas.length; diga('metas', metas.length);

    /* ---- faturas: mapa "cardId|YYYY-MM" vira linhas ---- */
    const faturas = [];
    Object.keys(perfil.invoices || {}).forEach((k) => {
      const [legacyCard, ref] = String(k).split('|');
      const cardId = idDe.cartoes[legacyCard];
      if (!cardId || !/^\d{4}-\d{2}$/.test(ref || '')) return;   // cartão apagado: a fatura perdeu o dono
      const v = perfil.invoices[k] || {};
      faturas.push({
        workspace_id: wsId, card_id: cardId, referencia: ref,
        paga: v.paid !== false,
        paga_em: U.isValidISO(v.paidAt) ? v.paidAt : null,
        account_id: idDe.contas[v.accountId] || null,
        valor: num(v.amount),
        origem: Repo.origem()
      });
    });
    if (faturas.length) {
      const { error } = await sb.from('card_invoices')
        .upsert(faturas, { onConflict: 'card_id,referencia' });
      if (error) throw new Error('faturas: ' + error.message);
    }
    contagens.faturas = faturas.length; diga('faturas', faturas.length);

    /* ---- orçamentos: mapa categoria → limite ---- */
    const orcs = [];
    Object.keys(perfil.budgets || {}).forEach((legacyCat) => {
      const catId = idDe.categorias[legacyCat];
      const limite = num(perfil.budgets[legacyCat]);
      if (catId && limite > 0) {
        orcs.push({ workspace_id: wsId, category_id: catId, limite, origem: Repo.origem() });
      }
    });
    if (orcs.length) {
      const { error } = await sb.from('budgets')
        .upsert(orcs, { onConflict: 'workspace_id,category_id' });
      if (error) throw new Error('orçamentos: ' + error.message);
    }
    contagens.orcamentos = orcs.length; diga('orçamentos', orcs.length);

    return { workspaceId: wsId, contagens };
  };

  /* ============================================================
     3 · CONFERÊNCIA
     ============================================================
     Gravar sem conferir é torcer. Contamos de volta o que o banco
     realmente tem, e é ESSE número que decide se a migração pode
     ser marcada como concluída. */

  Repo.contarNoBanco = async function (wsId) {
    const sb = cliente();
    const tabelas = {
      contas: 'accounts', cartoes: 'credit_cards', categorias: 'categories',
      lancamentos: 'transactions', investimentos: 'investments',
      faturas: 'card_invoices', orcamentos: 'budgets', metas: 'goals'
    };
    const out = {};
    await Promise.all(Object.keys(tabelas).map(async (chave) => {
      const { count, error } = await sb.from(tabelas[chave])
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', wsId).is('deleted_at', null);
      out[chave] = error ? -1 : (count || 0);
    }));
    return out;
  };

  /** Compara o que foi enviado com o que o banco devolveu. */
  Repo.conferir = function (enviado, noBanco) {
    const problemas = [];
    Object.keys(enviado).forEach((k) => {
      const a = enviado[k], b = noBanco[k];
      if (b < 0) problemas.push(k + ': não foi possível contar');
      else if (b < a) problemas.push(k + ': enviados ' + a + ', gravados ' + b);
    });
    return { ok: !problemas.length, problemas };
  };

  global.Repo = Repo;
})(window);
