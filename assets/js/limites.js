/* =============================================================
   limites.js — o serviço de permissões
   ------------------------------------------------------------
   Quatro perguntas, um lugar só:

     Limites.direitos()          o que este usuário tem direito
     Limites.pode(recurso)       este recurso está liberado?
     Limites.cabe(tipo)          ainda cabe mais um deste tipo?
     Limites.uso(tipo)           quanto foi usado de quanto

   ONDE ISTO É A PROTEÇÃO, E ONDE NÃO É
   Aqui é orientação. Botão escondido não é segurança: quem abre o
   DevTools chama a função direto. A proteção real está em dois
   lugares que o navegador não alcança —

     criar registro   → RLS por participação no workspace, e o
                        limite de workspaces está no plano
     consultar a IA   → Edge Function, que lê o plano do banco e
                        reserva a cota de forma atômica

   O papel deste arquivo é fazer a pessoa entender o limite ANTES
   de bater nele, e explicar quando bate. Um erro genérico de
   permissão vindo do banco é tecnicamente seguro e péssimo de
   receber.

   AO BATER NO LIMITE, NADA É APAGADO
   Nem escondido, nem bloqueado. O que para é a criação de itens
   NOVOS daquele tipo. Quem está acima do limite depois de um
   downgrade continua vendo e usando tudo — e pode apagar o que
   quiser para voltar a caber.
   ============================================================= */
(function (global) {
  'use strict';

  const Limites = {};
  const el = U.el;

  /* Direitos do plano Grátis, embutidos. Servem quando não há
     sessão ou rede — e é a escolha conservadora certa: na dúvida,
     o menor plano, nunca o maior. */
  const PADRAO = {
    plano: 'free',
    status: 'free',
    limites: Planos.get('free').limites,
    recursos: Planos.get('free').recursos
  };

  let direitos = PADRAO;
  let consumoIA = { usado: 0, limite: 5 };

  function sb() {
    try {
      return (global.SupabaseBackend && SupabaseBackend.cliente && SupabaseBackend.cliente()) || null;
    } catch (e) { return null; }
  }

  Limites.direitos = () => direitos;
  Limites.plano = () => direitos.plano;
  Limites.consumoIA = () => consumoIA;

  /* ---------------- carga ---------------- */

  /**
   * Uma chamada só, resolvida no banco: a função meus_direitos()
   * junta assinatura, plano e direitos. Fazer três consultas aqui
   * seria três oportunidades de ficar num estado meio carregado.
   */
  Limites.carregar = async function () {
    const c = sb();
    const u = global.Sync && Sync.currentUser();
    if (!c || !u) { direitos = PADRAO; return direitos; }
    try {
      const { data, error } = await c.rpc('meus_direitos');
      if (error) throw error;
      if (data) {
        direitos = {
          plano: data.plano || 'free',
          planoContratado: data.plano_contratado,
          status: data.status || 'free',
          ciclo: data.ciclo,
          fimPeriodo: data.fim_periodo,
          cancelaNoFim: !!data.cancela_no_fim,
          limites: data.limites || PADRAO.limites,
          recursos: data.recursos || PADRAO.recursos
        };
      }
      await Limites.carregarConsumo();
    } catch (e) {
      console.warn('Limites: usando o plano Grátis por precaução —', e.message);
      direitos = PADRAO;
    }
    return direitos;
  };

  Limites.carregarConsumo = async function () {
    const c = sb();
    const u = global.Sync && Sync.currentUser();
    if (!c || !u) return;
    /* O mês no fuso do OAZE, igual ao que o banco usa. Calcular em
       UTC faria o contador "virar" às 21h do dia 30. */
    const mes = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
    try {
      const { data } = await c.from('usage_counters')
        .select('usado, limite').eq('user_id', u.uid)
        .eq('tipo', 'ai_query').eq('periodo', mes).maybeSingle();
      consumoIA = {
        usado: (data && data.usado) || 0,
        limite: direitos.limites.ai_queries_per_month
      };
    } catch (e) { /* offline */ }
  };

  /* ---------------- perguntas ---------------- */

  /* As perguntas aceitam o nome do brief (features.csvImport) e o
     nome interno (import_csv) indiferentemente — Planos.chave()
     traduz. Sem isso, um typo em qualquer um dos dois dialetos
     devolveria "undefined", e "!!undefined" é false: o recurso
     ficaria bloqueado para todo mundo, sem erro em lugar nenhum e
     sem ninguém reclamando, porque quem não vê um botão não sabe
     que deveria vê-lo. Por isso a chave desconhecida grita. */
  function chaveConhecida(nome, mapa) {
    const k = Planos.chave(nome);
    if (mapa && !(k in mapa)) {
      console.warn('Limites: chave desconhecida "' + nome + '". ' +
        'Ela não existe em planos.js e será tratada como não liberada.');
    }
    return k;
  }

  Limites.pode = function (recurso) {
    const k = chaveConhecida(recurso, direitos.recursos);
    return !!(direitos.recursos && direitos.recursos[k]);
  };

  Limites.limite = function (tipo) {
    const k = chaveConhecida(tipo, direitos.limites);
    const v = direitos.limites ? direitos.limites[k] : undefined;
    return v === undefined ? null : v;
  };

  /** Quantos itens deste tipo já existem no perfil ativo. */
  Limites.contar = function (tipo) {
    const p = Store.profile();
    if (!p) return 0;
    switch (Planos.chave(tipo)) {
      case 'workspaces': return Store.state().profiles.length;
      /* Lançamentos são contados POR MÊS, e pelo mês que está na
         tela — não pelo total do perfil. O limite do brief é "até
         100 movimentações por mês": um teto sobre o acervo inteiro
         seria outro produto, e travaria alguém no segundo ano de
         uso por causa do primeiro. */
      case 'transactions_per_month': {
        const ym = (global.App && App.ym) || U.todayYM();
        return (p.transactions || []).filter((t) => U.ymOf(t.date) === ym).length;
      }
      case 'accounts': return (p.accounts || []).length;
      case 'credit_cards': return (p.cards || []).length;
      case 'budgets': return Object.keys(p.budgets || {}).length;
      case 'goals': return (p.goals || []).length;
      case 'recurring_items': return (p.transactions || []).filter((t) => t.recurring).length;
      case 'custom_categories': {
        /* Só as que a pessoa criou contam. As que vêm prontas não
           deveriam consumir a cota de "personalizadas" — cobrar por
           elas seria cobrar pelo padrão do produto. */
        const padrao = new Set(Store.CATEGORIAS_PADRAO || []);
        return (p.categories || []).filter((c) => !padrao.has(c.name)).length;
      }
      default: return 0;
    }
  };

  /** Ainda cabe mais um? */
  Limites.cabe = function (tipo) {
    const teto = Limites.limite(tipo);
    if (teto === null) return true;
    return Limites.contar(tipo) < teto;
  };

  Limites.uso = function (tipo) {
    return { usado: Limites.contar(tipo), limite: Limites.limite(tipo) };
  };

  /* ---------------- explicação ---------------- */

  const NOMES = {
    workspaces: ['espaço financeiro', 'espaços financeiros'],
    transactions_per_month: ['movimentação neste mês', 'movimentações neste mês'],
    accounts: ['conta', 'contas'],
    credit_cards: ['cartão de crédito', 'cartões de crédito'],
    custom_categories: ['categoria personalizada', 'categorias personalizadas'],
    budgets: ['orçamento', 'orçamentos'],
    goals: ['meta', 'metas'],
    recurring_items: ['recorrência', 'recorrências']
  };

  /** O próximo plano que resolve este limite — se houver. */
  function proximoQueResolve(nome) {
    const tipo = Planos.chave(nome);
    const atual = Planos.IDS.indexOf(direitos.plano);
    for (let i = atual + 1; i < Planos.LISTA.length; i++) {
      const p = Planos.LISTA[i];
      const v = p.limites[tipo];
      if (v === null || v > (Limites.limite(tipo) || 0)) return p;
    }
    return null;
  }

  /**
   * Barra a criação e EXPLICA. A frase segue a fórmula do brief:
   * quanto está usando, de quanto, e o que o próximo plano dá.
   * Um "limite atingido" seco manda a pessoa adivinhar.
   */
  Limites.exigirEspaco = function (chave) {
    const tipo = Planos.chave(chave);
    if (Limites.cabe(tipo)) return true;

    const teto = Limites.limite(tipo);
    const nome = NOMES[tipo] || ['item', 'itens'];
    const plural = teto === 1 ? nome[0] : nome[1];
    const prox = proximoQueResolve(tipo);
    const planoAtual = Planos.get(direitos.plano);

    const corpo = el('div', { style: { fontSize: '13.5px', lineHeight: '1.65' } }, [
      el('p', [
        el('strong', { text: 'Você está usando ' + teto + ' de ' + teto + ' ' + plural }),
        el('span', { text: ' disponíveis no plano ' + planoAtual.nome + '.' })
      ]),
      prox
        ? el('p', { style: { marginTop: '10px' } }, [
          el('span', { text: 'No ' + prox.nome + ', você pode cadastrar ' }),
          el('strong', { text: prox.limites[tipo] === null ? 'quantos quiser' : 'até ' + prox.limites[tipo] }),
          el('span', { text: '.' })
        ])
        : null,
      el('p', { style: { marginTop: '10px' }, text: 'Nada foi apagado, e o resto do app continua funcionando. Você também pode excluir um dos que já existem para abrir espaço.' })
    ].filter(Boolean));

    UI.openModal({
      title: 'Limite do plano ' + planoAtual.nome,
      body: corpo,
      buttons: [
        { label: 'Entendi', class: 'btn-outline', onClick: UI.closeModal },
        prox
          ? {
            label: 'Ver planos', class: 'btn-primary',
            onClick: () => { UI.closeModal(); App.goTo('precos'); }
          }
          : null
      ].filter(Boolean)
    });
    return false;
  };

  /** Mesma ideia, para recurso que é sim-ou-não. */
  Limites.exigirRecurso = function (nome, oQueEra) {
    const recurso = Planos.chave(nome);
    if (Limites.pode(recurso)) return true;

    const prox = Planos.LISTA.find((p) =>
      Planos.IDS.indexOf(p.id) > Planos.IDS.indexOf(direitos.plano) && p.recursos[recurso]);
    const planoAtual = Planos.get(direitos.plano);

    UI.openModal({
      title: 'Disponível em outro plano',
      body: el('div', { style: { fontSize: '13.5px', lineHeight: '1.65' } }, [
        el('p', { text: oQueEra + ' não está incluído no plano ' + planoAtual.nome + '.' }),
        prox ? el('p', { style: { marginTop: '10px' }, text: 'Está disponível a partir do ' + prox.nome + '.' }) : null,
        el('p', { style: { marginTop: '10px' }, text: 'Seus dados continuam intactos e o resto do app segue funcionando normalmente.' })
      ].filter(Boolean)),
      buttons: [
        { label: 'Fechar', class: 'btn-outline', onClick: UI.closeModal },
        prox ? { label: 'Ver planos', class: 'btn-primary', onClick: () => { UI.closeModal(); App.goTo('precos'); } } : null
      ].filter(Boolean)
    });
    return false;
  };

  /* ---------------- barra de consumo ---------------- */

  /**
   * Uma barra que não existe quando o limite é ilimitado: desenhar
   * uma barra sempre vazia sugere um teto que não há.
   */
  Limites.barra = function (rotulo, usado, limite, unidade) {
    if (limite === null || limite === undefined) {
      return el('div', { class: 'uso-linha' }, [
        el('span', { class: 'uso-rotulo', text: rotulo }),
        el('span', { class: 'uso-num', text: usado + (unidade ? ' ' + unidade : '') + ' · ilimitado' })
      ]);
    }
    const pct = limite > 0 ? Math.min(100, Math.round((usado / limite) * 100)) : 0;
    const cheio = usado >= limite;
    return el('div', { class: 'uso-linha' }, [
      el('span', { class: 'uso-rotulo', text: rotulo }),
      el('span', { class: 'uso-num' + (cheio ? ' is-cheio' : ''), text: usado + ' de ' + limite }),
      el('div', {
        class: 'uso-barra' + (cheio ? ' is-cheio' : ''),
        role: 'progressbar', 'aria-valuenow': String(usado),
        'aria-valuemin': '0', 'aria-valuemax': String(limite),
        'aria-label': rotulo + ': ' + usado + ' de ' + limite
      }, el('i', { style: { width: pct + '%' } }))
    ]);
  };

  /* ============================================================
     EXCEDENTE — o que sobra depois de descer de plano
     ------------------------------------------------------------
     Quem tinha 8 contas no Basic e volta para o Grátis, que permite
     2, continua com 8. NADA É APAGADO — nem aqui, nem em lugar
     nenhum do código. Apagar seria a única ação irreversível de
     toda a mudança de plano, e não há motivo para ela: o custo de
     manter é algumas linhas no banco.

     O QUE MUDA
     Só a criação, que já estava barrada por exigirEspaco(). O que
     existe continua visível, continua entrando nos relatórios de
     períodos passados, continua exportável e continua editável --
     "organizar" inclui poder editar e apagar o que se escolher.

     QUAL É O EXCEDENTE, E POR QUE ESSA REGRA
     Os ÚLTIMOS da lista. A ordem do array é a de criação, então o
     excedente é o que foi criado mais tarde -- provavelmente já sob
     o plano maior. Marcar os PRIMEIROS seria pior: apontaria como
     sobra justamente a conta principal, criada no primeiro dia.

     Isto é uma indicação, não uma trava: a pessoa escolhe o que
     manter ativo, sem prazo, e o OAZE nunca decide por ela.
     ============================================================ */

  const TIPOS_COM_EXCEDENTE = ['workspaces', 'accounts', 'credit_cards',
    'custom_categories', 'budgets', 'goals', 'recurring_items'];

  /** Quantos passam do teto. Zero quando cabe ou quando é ilimitado. */
  Limites.quantosExcedem = function (nome) {
    const tipo = Planos.chave(nome);
    const teto = Limites.limite(tipo);
    if (teto === null || teto === undefined) return 0;
    return Math.max(0, Limites.contar(tipo) - teto);
  };

  /** Os ids que estão além do teto, ou [] quando não há excedente. */
  Limites.idsExcedentes = function (tipo) {
    const sobra = Limites.quantosExcedem(tipo);
    if (!sobra) return [];
    const p = Store.profile();
    if (!p) return [];

    let lista = [];
    if (tipo === 'accounts') lista = (p.accounts || []).map((x) => x.id);
    else if (tipo === 'credit_cards') lista = (p.cards || []).map((x) => x.id);
    else if (tipo === 'goals') lista = (p.goals || []).map((x) => x.id);
    else if (tipo === 'workspaces') lista = Store.state().profiles.map((x) => x.id);
    else if (tipo === 'budgets') lista = Object.keys(p.budgets || {});
    else if (tipo === 'custom_categories') {
      const padrao = new Set(Store.CATEGORIAS_PADRAO || []);
      lista = (p.categories || []).filter((c) => !padrao.has(c.name)).map((c) => c.id);
    } else if (tipo === 'recurring_items') {
      lista = (p.transactions || []).filter((t) => t.recurring).map((t) => t.id);
    }
    return lista.slice(-sobra);
  };

  /** Um resumo de tudo que excede, para a faixa de aviso. */
  Limites.resumoExcedente = function () {
    const itens = [];
    TIPOS_COM_EXCEDENTE.forEach((tipo) => {
      const sobra = Limites.quantosExcedem(tipo);
      if (!sobra) return;
      const nome = NOMES[tipo] || ['item', 'itens'];
      itens.push({
        tipo: tipo,
        sobra: sobra,
        texto: sobra + ' ' + (sobra === 1 ? nome[0] : nome[1]),
        usado: Limites.contar(tipo),
        limite: Limites.limite(tipo)
      });
    });
    return itens;
  };

  Limites.temExcedente = () => Limites.resumoExcedente().length > 0;

  /**
   * Desenha a faixa de excedente. Chamada a cada render de página,
   * porque o excedente muda quando o usuário apaga algo.
   *
   * O TEXTO IMPORTA MAIS QUE A FAIXA. Alguém que desceu de plano e
   * encontra a criação barrada precisa saber três coisas, nesta
   * ordem: que nada foi apagado, quanto está além do limite, e que
   * a escolha do que manter é dele. Uma faixa que só dissesse
   * "limite excedido" produziria exatamente o medo que ela deveria
   * evitar — o de ter perdido alguma coisa.
   */
  Limites.pintarExcedente = function () {
    const alvo = document.getElementById('faixaExcedente');
    if (!alvo) return;

    const itens = Limites.resumoExcedente();
    if (!itens.length) { alvo.hidden = true; U.clear(alvo); return; }

    const plano = Planos.get(direitos.plano);
    const lista = itens.map((i) => i.texto).join(', ')
      .replace(/, ([^,]*)$/, ' e $1');   /* "a, b e c", não "a, b, c" */

    U.clear(alvo);
    alvo.hidden = false;
    alvo.appendChild(el('div', { class: 'faixa-excedente-corpo' }, [
      el('p', { class: 'faixa-excedente-titulo',
        text: 'Você tem mais itens do que o plano ' + (plano ? plano.nome : direitos.plano) + ' permite' }),
      el('p', { class: 'faixa-excedente-texto' }, [
        el('strong', { text: 'Nada foi apagado. ' }),
        el('span', { text: 'Estão além do limite: ' + lista + '. ' +
          'Tudo continua visível, entra nos relatórios e pode ser exportado — ' +
          'mas não dá para criar novos até ficar dentro do limite. ' +
          'Você escolhe o que manter ativo, sem prazo.' })
      ]),
      el('div', { class: 'faixa-excedente-usos' },
        itens.map((i) => Limites.barra(
          (NOMES[i.tipo] || ['item', 'itens'])[1], i.usado, i.limite)))
    ]));
  };

  /* ---------------- ciclo ---------------- */

  Limites.aoEntrar = async function () {
    await Limites.carregar();
    /* O assistente flutuante depende de um DIREITO, e o direito só
       é conhecido depois desta carga. Sincronizar aqui é o que faz
       um upgrade aparecer na hora, sem recarregar a página — quem
       acabou de pagar não deveria ter que dar F5 para ver o que
       comprou. */
    if (global.UglezFlutuante) UglezFlutuante.sincronizar();
    if (App.page === 'settings') Cfg.render();
    if (App.page === 'precos' && global.Precos) Precos.render();
  };

  Limites.aoSair = function () {
    direitos = PADRAO;
    if (global.UglezFlutuante) UglezFlutuante.sincronizar();
    consumoIA = { usado: 0, limite: 5 };
  };

  global.Limites = Limites;
})(window);
