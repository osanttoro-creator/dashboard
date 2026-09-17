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
      /* O registro guarda movimentos (pagamentos e compras
         adiantadas), não mais um booleano. A linha relacional
         continua com uma data e um valor: a data é a do último
         pagamento e o valor é tudo o que já saiu por esta fatura. */
      const pagamentos = Array.isArray(v.pagamentos) ? v.pagamentos : [];
      const adiant = (v.adiantamentos && typeof v.adiantamentos === 'object') ? v.adiantamentos : {};
      const ultimo = pagamentos.length ? pagamentos[pagamentos.length - 1] : null;
      const saiu = pagamentos.reduce((s, m) => s + num(m.amount), 0)
        + Object.keys(adiant).reduce((s, c) => s + num(adiant[c].amount), 0);
      faturas.push({
        workspace_id: wsId, card_id: cardId, referencia: ref,
        paga: !!v.quitada,
        paga_em: ultimo && U.isValidISO(ultimo.at) ? ultimo.at : null,
        account_id: (ultimo && idDe.contas[ultimo.accountId]) || null,
        valor: num(saiu),
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

  /* ============================================================
     4 · LEITURA — o caminho de volta
     ============================================================
     Até aqui o Repo era via de mão única: o app escrevia no banco e
     nunca lia de lá. Isso é o que mantinha o localStorage como
     fonte da verdade, com o banco de cópia. Invertida a direção, o
     banco passa a ser o original e o localStorage o cache.
     ============================================================ */

  /* Quantas linhas por viagem. NÃO É AJUSTE DE DESEMPENHO -- é
     correção. O PostgREST corta a resposta em 1.000 linhas por
     padrão e NÃO avisa: uma conta com 1.400 lançamentos leria 1.000
     e o app mostraria um ano incompleto sem erro nenhum, sem nada no
     console, com todos os totais errados por um valor plausível.
     Por isso toda leitura abaixo passa por `todas()`. */
  const PAGINA = 1000;

  /** Lê uma tabela inteira do espaço, paginando até acabar. */
  async function todas(sb, tabela, wsId, ordem) {
    const linhas = [];
    for (let de = 0; ; de += PAGINA) {
      let q = sb.from(tabela).select('*')
        .eq('workspace_id', wsId)
        .is('deleted_at', null)
        .range(de, de + PAGINA - 1);
      /* A ordenação precisa ser TOTAL. Ordenar só por data deixa
         empates soltos, e o Postgres não promete ordem estável entre
         eles -- duas leituras devolveriam a mesma lista embaralhada,
         e a tela pisca a cada sincronização sem nada ter mudado. */
      if (ordem) ordem.forEach((c) => { q = q.order(c.col, { ascending: c.asc !== false }); });
      q = q.order('id', { ascending: true });

      const { data, error } = await q;
      if (error) throw new Error(tabela + ': ' + error.message);
      linhas.push.apply(linhas, data || []);
      if (!data || data.length < PAGINA) return linhas;
    }
  }

  /* O id que o app usa. Preferimos o legacy_id porque é ele que
     mantém a identidade estável na ida e na volta: enviarEspaco
     grava `legacy_id: a.id`, então ler de volta como `a.id` fecha o
     ciclo e o upsert seguinte encontra a MESMA linha.
     Linha criada direto no banco não tem legacy_id; aí o UUID vira o
     id do app, e o próximo envio grava esse UUID em legacy_id. O
     ciclo se fecha sozinho na primeira volta. */
  const idApp = (r) => r.legacy_id || r.id;

  /**
   * Lê um espaço inteiro e devolve no formato que o Store espera.
   * O inverso exato de Repo.mapa.
   */
  Repo.carregarEspaco = async function (wsId, nome, legacyDoEspaco) {
    const sb = cliente();

    /* Em paralelo: são consultas independentes, e em série o tempo
       de abrir o app seria a soma de oito viagens em vez da mais
       lenta delas. */
    const [contas, cats, cartoes, txs, invs, metas, faturas, orcs] = await Promise.all([
      todas(sb, 'accounts',      wsId, [{ col: 'name' }]),
      todas(sb, 'categories',    wsId, [{ col: 'name' }]),
      todas(sb, 'credit_cards',  wsId, [{ col: 'name' }]),
      todas(sb, 'transactions',  wsId, [{ col: 'data', asc: false }]),
      todas(sb, 'investments',   wsId, [{ col: 'data', asc: false }]),
      todas(sb, 'goals',         wsId, [{ col: 'name' }]),
      todas(sb, 'card_invoices', wsId, [{ col: 'referencia' }]),
      todas(sb, 'budgets',       wsId, [{ col: 'created_at' }])
    ]);

    /* UUID → id do app, para reconstruir as ligações. As chaves
       estrangeiras no banco são UUID; o app cruza por id de texto. */
    const de = {};
    [contas, cats, cartoes].forEach((lista) => lista.forEach((r) => { de[r.id] = idApp(r); }));

    const perfil = {
      id: legacyDoEspaco || wsId,
      name: nome || 'Pessoal',
      /* O uuid do espaço não é do formato do app, mas o app nunca o
         lê -- quem usa é a sincronização, para saber onde gravar. */
      workspaceId: wsId,

      accounts: contas.map((a) => ({
        id: idApp(a),
        name: a.name, bank: a.bank || '', type: a.tipo || 'Conta corrente',
        color: a.cor, gradient: a.gradiente || null,
        last4: String(a.last4 || ''),
        openingBalance: +a.saldo_inicial || 0,
        openedAt: a.aberta_em, archived: !!a.arquivada
      })),

      categories: cats.map((c) => ({
        id: idApp(c), name: c.name,
        kind: c.kind === 'income' ? 'income' : 'expense',
        color: c.cor, icon: c.icone || null
      })),

      cards: cartoes.map((c) => ({
        id: idApp(c), name: c.name, bank: c.bank || '',
        color: c.cor, gradient: c.gradiente || null,
        last4: String(c.last4 || ''),
        limit: +c.limite || 0,
        closingDay: +c.dia_fechamento || 1,
        dueDay: +c.dia_vencimento || 10,
        accountId: de[c.account_id] || null
      })),

      transactions: txs.map((t) => ({
        id: idApp(t), kind: t.kind,
        description: t.descricao || '',
        amount: +t.valor || 0,
        date: t.data,
        categoryId: de[t.category_id] || null,
        method: t.metodo === 'card' ? 'card' : 'account',
        accountId: de[t.account_id] || null,
        toAccountId: de[t.to_account_id] || null,
        cardId: de[t.card_id] || null,
        recurring: !!t.recorrente,
        recurEnd: t.recorrencia_fim || null,
        confirmed: t.confirmado !== false,
        occ: t.ocorrencias && typeof t.ocorrencias === 'object' ? t.ocorrencias : {},
        installment: t.parcelamento || null,
        notes: t.notas || '',
        source: t.origem_registro || 'manual'
      })),

      investments: invs.map((i) => ({
        id: idApp(i), name: i.name, type: i.tipo,
        amount: +i.valor || 0, date: i.data, rate: +i.taxa || 0,
        currentValue: i.valor_atual == null ? null : +i.valor_atual,
        accountId: de[i.account_id] || null,
        notes: i.notas || ''
      })),

      goals: metas.map((g) => ({
        id: idApp(g), name: g.name,
        target: +g.alvo || 0, saved: +g.guardado || 0,
        deadline: g.prazo || null,
        color: g.cor, icon: g.icone || 'target',
        accountId: de[g.account_id] || null
      })),

      /* Faturas e orçamentos voltam a ser MAPAS, não listas -- é
         assim que o app os usa, e converter aqui evita que cada
         página tenha de saber dos dois formatos. */
      invoices: {},
      budgets: {}
    };

    faturas.forEach((f) => {
      const cartao = de[f.card_id];
      if (!cartao) return;   /* cartão apagado: a fatura perdeu o dono */
      /* A linha relacional guarda um total e uma data; o app guarda
         movimentos. A volta reconstrói UM pagamento com o que a
         linha sabe — se houve dois, eles voltam somados, que é o
         máximo que a tabela permite dizer sem mentir. */
      const valor = +f.valor || 0;
      perfil.invoices[cartao + '|' + f.referencia] = {
        pagamentos: valor > 0 ? [{
          at: f.paga_em || null,
          amount: valor,
          accountId: de[f.account_id] || null
        }] : [],
        adiantamentos: {},
        quitada: !!f.paga
      };
    });

    orcs.forEach((o) => {
      const cat = de[o.category_id];
      if (cat) perfil.budgets[cat] = +o.limite || 0;
    });

    return perfil;
  };

  /** Os espaços do usuário, em ordem estável. */
  Repo.listarEspacos = async function (userId) {
    const sb = cliente();
    const { data, error } = await sb.from('workspaces')
      .select('id, name, legacy_id, posicao, created_at')
      .eq('owner_id', userId)
      .is('deleted_at', null)
      .order('posicao', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw new Error('espaços: ' + error.message);
    return data || [];
  };

  global.Repo = Repo;
})(window);
