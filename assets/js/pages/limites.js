/* =============================================================
   pages/limites.js — Plano e limites
   -------------------------------------------------------------
   A tela que responde "o que acontece quando eu chego no limite".

   Antes desta página a resposta estava espalhada: uma barra de
   consumo escondida atrás de um <details> em Configurações, e um
   modal que aparecia no instante em que a criação era barrada. Quem
   levava o modal descobria o teto no pior momento possível — com o
   formulário preenchido — e não tinha para onde ir depois de
   fechá-lo.

   Aqui estão as três coisas, no mesmo lugar e nesta ordem:

     1. O QUE ESTÁ BLOQUEADO AGORA. Primeiro, porque é a pergunta
        de quem chegou aqui pelo modal. Cada item diz que ação
        parou e leva para onde dá para abrir espaço.
     2. QUANTO CABE, DE TUDO. Uma barra por limite, inclusive os
        que estão longe do teto — é assim que a pessoa vê o limite
        ANTES de bater nele, que é o único momento em que a
        informação ainda é útil.
     3. O QUE NÃO ACONTECE. Nada é apagado, nada fica escondido,
        nada para de funcionar. Só a criação de itens NOVOS
        daquele tipo. Dito em voz alta, porque é exatamente o medo
        de quem lê "limite atingido" num app de dinheiro.

   ESTA TELA NÃO DECIDE NADA
   Igual ao resto do front-end: quem barra de verdade é o RLS e a
   Edge Function da IA (ver o cabeçalho de limites.js). O que está
   aqui é explicação.
   ============================================================= */
(function (global) {
  'use strict';

  const el = U.el;
  const Lim = {};

  /* Cada limite, o que para de funcionar quando ele enche, e onde a
     pessoa abre espaço. O destino é uma página do app de verdade:
     "exclua alguma coisa" sem dizer onde é meio conselho. */
  const LINHAS = [
    {
      chave: 'workspaces', rotulo: 'Espaços financeiros',
      para: 'Criar outro espaço (Pessoal, PJ…).',
      onde: null
    },
    {
      chave: 'accounts', rotulo: 'Contas',
      para: 'Cadastrar uma conta nova.',
      onde: { pagina: 'accounts', aba: 'accounts', texto: 'Ver minhas contas' }
    },
    {
      chave: 'credit_cards', rotulo: 'Cartões de crédito',
      para: 'Cadastrar um cartão novo.',
      onde: { pagina: 'accounts', aba: 'cards', texto: 'Ver meus cartões' }
    },
    {
      chave: 'transactions_per_month', rotulo: 'Movimentações no mês',
      para: 'Lançar mais movimentações NESTE mês. O mês que vem começa zerado.',
      onde: { pagina: 'transactions', texto: 'Ver as movimentações do mês' }
    },
    {
      chave: 'custom_categories', rotulo: 'Categorias personalizadas',
      para: 'Criar outra categoria sua. As que vêm prontas não contam.',
      onde: { pagina: 'categories', texto: 'Ver minhas categorias' }
    },
    {
      chave: 'budgets', rotulo: 'Orçamentos',
      para: 'Definir o orçamento de mais uma categoria.',
      onde: { pagina: 'budget', texto: 'Ver meus orçamentos' }
    },
    {
      chave: 'goals', rotulo: 'Metas',
      para: 'Criar outra meta.',
      onde: { pagina: 'goals', texto: 'Ver minhas metas' }
    },
    {
      chave: 'recurring_items', rotulo: 'Recorrências',
      para: 'Marcar mais um lançamento como recorrente.',
      onde: { pagina: 'recurring', texto: 'Ver minhas recorrências' }
    }
  ];

  function irPara(onde) {
    return el('button', {
      class: 'btn btn-ghost btn-sm', type: 'button', text: onde.texto,
      onclick: () => App.goTo(onde.pagina, onde.aba ? { tab: onde.aba } : undefined)
    });
  }

  /** O plano que resolve um limite, se existir algum acima do atual. */
  function proximoQueResolve(chave) {
    const atual = Planos.IDS.indexOf(Limites.plano());
    const teto = Limites.limite(chave);
    for (let i = atual + 1; i < Planos.LISTA.length; i++) {
      const p = Planos.LISTA[i];
      const v = p.limites[chave];
      if (v === null || v > (teto || 0)) return p;
    }
    return null;
  }

  Lim.render = function () {
    const raiz = U.clear(document.getElementById('limitesConteudo'));
    const plano = Planos.get(Limites.plano());
    const u = global.Sync && Sync.currentUser && Sync.currentUser();

    /* ---------------- o plano ---------------- */
    raiz.appendChild(el('div', { class: 'card limites-plano' }, [
      el('div', { class: 'limites-plano-id' }, [
        el('span', { class: 'limites-plano-rotulo', text: 'Seu plano' }),
        el('strong', { class: 'limites-plano-nome', text: plano.nome, translate: 'no' }),
        el('span', { class: 'hint', text: plano.descricao })
      ]),
      el('div', { class: 'row gap-6' }, [
        el('button', {
          class: 'btn btn-primary btn-sm', type: 'button',
          text: plano.id === 'free' ? 'Ver planos' : 'Mudar de plano',
          onclick: () => App.goTo('precos')
        })
      ])
    ]));

    if (!u) {
      raiz.appendChild(el('p', {
        class: 'hint',
        text: 'Sem conta, o app usa os limites do plano Semente neste aparelho. Entrando, os limites passam a ser os do seu plano.'
      }));
    }

    /* ---------------- o que está bloqueado ---------------- */
    const cheios = LINHAS.filter((l) => !Limites.cabe(l.chave));
    const bloco = el('div', { class: 'card limites-bloqueios' + (cheios.length ? ' is-cheio' : '') });
    bloco.appendChild(el('h3', { text: cheios.length ? 'O que está bloqueado agora' : 'Nada bloqueado' }));

    if (!cheios.length) {
      bloco.appendChild(el('p', {
        class: 'hint',
        text: 'Você está dentro de todos os limites do plano ' + plano.nome + '. Quando algum encher, ele aparece aqui dizendo o que parou e onde abrir espaço.'
      }));
    } else {
      bloco.appendChild(el('ul', { class: 'limites-lista' }, cheios.map((l) => {
        const prox = proximoQueResolve(l.chave);
        return el('li', {}, [
          el('span', { class: 'limites-item-topo' }, [
            el('strong', { text: l.rotulo }),
            el('span', {
              class: 'badge badge-late',
              text: Limites.contar(l.chave) + ' de ' + Limites.limite(l.chave)
            })
          ]),
          el('span', { class: 'limites-item-para', text: 'Parou: ' + l.para }),
          prox
            ? el('span', {
              class: 'limites-item-saida',
              text: 'No ' + prox.nome + ': ' +
                (prox.limites[l.chave] === null ? 'sem limite' : 'até ' + prox.limites[l.chave]) + '.'
            })
            : null,
          l.onde ? el('span', { class: 'limites-item-acao' }, irPara(l.onde)) : null
        ].filter(Boolean));
      })));
    }
    raiz.appendChild(bloco);

    /* ---------------- quanto cabe ---------------- */
    const consumo = Limites.consumoIA();
    const uso = el('div', { class: 'card' }, [
      el('h3', { text: 'Quanto cabe no seu plano' }),
      el('p', { class: 'hint', text: 'A contagem de movimentações é a do mês que está na barra do topo — ' + U.monthLabel(App.ym) + '. A cota do UGLEZ reinicia todo dia 1º, no horário de Brasília.' }),
      el('div', { class: 'uso-caixa' },
        [Limites.barra('UGLEZ neste mês', consumo.usado, consumo.limite, 'consultas')]
          .concat(LINHAS.map((l) => Limites.barra(l.rotulo, Limites.contar(l.chave), Limites.limite(l.chave)))))
    ]);
    raiz.appendChild(uso);

    /* ---------------- o que não acontece ---------------- */
    raiz.appendChild(el('div', { class: 'card limites-calma' }, [
      el('h3', { text: 'O que o limite NÃO faz' }),
      el('ul', { class: 'limites-calma-lista' }, [
        el('li', { text: 'Não apaga nada. Nem depois de trocar para um plano menor.' }),
        el('li', { text: 'Não esconde nada. Tudo o que já existe continua na tela e continua sendo somado.' }),
        el('li', { text: 'Não trava o app. Editar, pagar, lançar em outro mês e sair com seus dados continuam funcionando.' }),
        el('li', { text: 'O que para é só a criação de itens novos daquele tipo — e volta assim que você abrir espaço ou mudar de plano.' })
      ])
    ]));
  };

  global.Lim = Lim;
})(window);
