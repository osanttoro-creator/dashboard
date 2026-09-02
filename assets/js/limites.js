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

  Limites.pode = function (recurso) {
    return !!(direitos.recursos && direitos.recursos[recurso]);
  };

  Limites.limite = function (tipo) {
    const v = direitos.limites ? direitos.limites[tipo] : undefined;
    return v === undefined ? null : v;
  };

  /** Quantos itens deste tipo já existem no perfil ativo. */
  Limites.contar = function (tipo) {
    const p = Store.profile();
    if (!p) return 0;
    switch (tipo) {
      case 'workspaces': return Store.state().profiles.length;
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
    accounts: ['conta', 'contas'],
    credit_cards: ['cartão de crédito', 'cartões de crédito'],
    custom_categories: ['categoria personalizada', 'categorias personalizadas'],
    budgets: ['orçamento', 'orçamentos'],
    goals: ['meta', 'metas'],
    recurring_items: ['recorrência', 'recorrências']
  };

  /** O próximo plano que resolve este limite — se houver. */
  function proximoQueResolve(tipo) {
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
  Limites.exigirEspaco = function (tipo) {
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
  Limites.exigirRecurso = function (recurso, oQueEra) {
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

  /* ---------------- ciclo ---------------- */

  Limites.aoEntrar = async function () {
    await Limites.carregar();
    if (App.page === 'settings') Cfg.render();
    if (App.page === 'precos' && global.Precos) Precos.render();
  };

  Limites.aoSair = function () {
    direitos = PADRAO;
    consumoIA = { usado: 0, limite: 5 };
  };

  global.Limites = Limites;
})(window);
