/* =============================================================
   pages/settings.js — Configurações
   ------------------------------------------------------------
   Conta, plano, perfil, aparência, planos e ajuda.

   O QUE SAIU, E POR QUÊ (12/09/2026)
     · Espaço ativo e conteúdo do espaço: repetiam o seletor de
       espaço do cabeçalho, que é onde se troca e se gerencia.
     · UGLEZ: mostrava como o assistente é servido e o resumo
       enviado. É configuração interna do produto, não da pessoa.
       Nenhuma chave de IA existe no navegador — a da IA vive só na
       Edge Function —, mas a tela não precisava falar disso.
     · Sincronização: estado repetido do indicador da barra, com
       explicação que não levava a nenhuma ação.
     · Dados (baixar, restaurar e trazer dados antigos): os dados
       vão e voltam pela conta, e de nenhuma outra forma.
   ============================================================= */
(function (global) {
  'use strict';

  const el = U.el;
  const Cfg = {};

  Cfg.render = function () {
    perfil();
    aparencia();
    conta();
    plano();
    navegacao();
  };

  /** Uma linha de configuração: rótulo, explicação e o controle. */
  function linha(titulo, descricao, controle) {
    return el('div', { class: 'set-row' }, [
      el('div', { class: 'set-id' }, [
        el('p', { class: 'set-title', text: titulo }),
        descricao ? el('p', { class: 'set-desc', text: descricao }) : null
      ].filter(Boolean)),
      el('div', { class: 'set-ctl' }, controle)
    ]);
  }

  /**
   * Um segmentado com ícone antes do rótulo.
   *
   * Existe em vez de UI.segmented porque aquele só aceita texto, e
   * aqui o ícone é a metade que a pessoa reconhece de relance — sol
   * e lua são lidos antes das palavras "claro" e "escuro". Mas o
   * texto FICA: ícone sozinho num controle de três estados obriga a
   * adivinhar, e é assim que se erra o clique.
   *
   * role=radiogroup, e não um punhado de botões soltos: são opções
   * mutuamente exclusivas de um mesmo campo, e é isso que faz o
   * leitor de tela anunciar "1 de 3" e as setas funcionarem.
   */
  function segmentadoComIcone(opcoes, valor, aoMudar) {
    const wrap = el('div', { class: 'seg seg-ico', role: 'radiogroup', 'aria-label': 'Tema' });
    opcoes.forEach((o) => {
      const ativo = o.value === valor;
      const b = el('button', {
        type: 'button', role: 'radio',
        'aria-checked': ativo ? 'true' : 'false',
        /* Só o selecionado fica na ordem de Tab; as setas percorrem
           o grupo. É como um grupo de rádio se comporta em todo
           lugar, e quebrar isso faz o teclado parar num controle. */
        tabindex: ativo ? '0' : '-1',
        class: ativo ? 'is-active' : '',
        onclick: () => aoMudar(o.value),
        onkeydown: (ev) => {
          if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft' &&
              ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
          ev.preventDefault();
          const i = opcoes.findIndex((x) => x.value === o.value);
          const passo = (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') ? 1 : -1;
          aoMudar(opcoes[(i + passo + opcoes.length) % opcoes.length].value);
        }
      });
      b.appendChild(Icons.lucide(o.icone, 15));
      b.appendChild(el('span', { text: o.label }));
      wrap.appendChild(b);
    });
    return wrap;
  }

  function perfil() {
    const box = U.clear(document.getElementById('setProfile'));

    box.appendChild(linha(
      'Nome na saudação',
      'Aparece no topo do painel.',
      el('button', {
        class: 'btn btn-outline btn-sm',
        text: Store.ownerName() || 'Definir nome',
        onclick: () => App.askOwnerName()
      })
    ));

  }

  /* ============================================================
     APARÊNCIA — e este é o ÚNICO lugar onde o tema se troca
     ------------------------------------------------------------
     Havia um segundo controle no popover da engrenagem do
     cabeçalho ("Alternar tema claro/escuro"). Ele saiu. Dois
     controles para um estado é sempre a mesma história: um deles
     desatualiza, e a pessoa nunca sabe qual venceu.

     TRÊS OPÇÕES, NÃO DUAS. "Sistema" não é enfeite: sem ela,
     "respeitar o tema do sistema operacional quando não houver
     escolha" vira um estado do qual não se volta — quem tocasse
     uma vez no seletor ficaria preso à escolha para sempre, mesmo
     tendo tocado por engano.

     SÓ SOL E LUA. Nenhum outro ícone entra aqui: um deslizador,
     um contraste ou uma paleta obrigam a pessoa a aprender o que
     significam. Sol e lua já são conhecidos, e "monitor" só marca
     o estado que não é nem um nem outro.
     ============================================================ */
  function aparencia() {
    const box = U.clear(document.getElementById('setAppearance'));
    const escolha = global.Tema ? Tema.escolha() : (Store.state().theme || null);
    const doSistema = global.Tema ? Tema.doSistema() : 'dark';

    const opcao = (valor, icone, rotulo) => ({
      value: valor === null ? 'sistema' : valor,
      label: rotulo,
      icone: icone
    });

    const controle = segmentadoComIcone(
      [
        opcao(null, 'monitor', 'Sistema'),
        opcao('light', 'sun', 'Claro'),
        opcao('dark', 'moon', 'Escuro')
      ],
      escolha === null ? 'sistema' : escolha,
      (v) => {
        Tema.definir(v === 'sistema' ? null : v);
        aparencia();          // redesenha para a frase abaixo acompanhar
      }
    );

    box.appendChild(linha(
      'Tema',
      escolha === null
        ? 'Seguindo o seu sistema operacional, que agora pede o tema ' +
          (doSistema === 'dark' ? 'escuro' : 'claro') + '. Escolher aqui vale para a sua conta, em qualquer aparelho.'
        : 'Escolhido por você. Vale para a sua conta em qualquer aparelho — volte para "Sistema" se quiser acompanhar o aparelho de novo.',
      controle
    ));

    box.appendChild(linha(
      'Movimento',
      'O sistema respeita a preferência do seu aparelho por menos movimento e menos transparência.',
      el('span', { class: 'muted', text: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'Reduzido pelo sistema' : 'Normal' })
    ));
  }

  /* Planos e ajuda saíram do menu genérico "Mais". Configurações é
     a casa permanente destes recursos, inclusive para quem ainda
     não entrou numa conta. */
  function navegacao() {
    const box = document.getElementById('setNavigation');
    if (!box) return;
    U.clear(box);

    box.appendChild(linha(
      'Planos',
      'Consulte recursos, limites e opções de assinatura.',
      el('button', {
        class: 'btn btn-outline btn-sm', type: 'button', text: 'Ver planos',
        onclick: () => App.goTo('precos')
      })
    ));

    box.appendChild(linha(
      'Ajuda e suporte',
      'Abra a central de ajuda do OAZE.',
      el('a', { class: 'btn btn-outline btn-sm', href: '/suporte', text: 'Abrir ajuda' })
    ));
  }

  /* ---------------- plano ---------------- */

  function plano() {
    const box = document.getElementById('setPlano');
    if (!box) return;
    U.clear(box);

    const u = global.Sync && Sync.currentUser();
    const d = Limites.direitos();
    const p = Planos.get(d.plano);

    box.appendChild(linha(
      'Plano atual',
      p.id === 'free' ? 'Sem cobrança.' : 'Acesso já registrado na sua conta.',
      el('span', { class: 'badge ' + (p.id === 'free' ? '' : 'badge-ok'), text: p.nome })
    ));

    if (!u) {
      box.appendChild(el('p', { class: 'hint', style: { padding: '0 2px 8px' },
        text: 'Sem conta, o app usa os limites do plano Semente neste aparelho.' }));
      return;
    }

    /* --- consumo --- */
    const consumo = Limites.consumoIA();
    const caixa = el('div', { class: 'uso-caixa' }, [
      Limites.barra('UGLEZ neste mês', consumo.usado, consumo.limite, 'consultas'),
      Limites.barra('Espaços financeiros', Limites.contar('workspaces'), Limites.limite('workspaces')),
      Limites.barra('Contas', Limites.contar('accounts'), Limites.limite('accounts')),
      Limites.barra('Cartões', Limites.contar('credit_cards'), Limites.limite('credit_cards')),
      Limites.barra('Categorias personalizadas', Limites.contar('custom_categories'), Limites.limite('custom_categories')),
      Limites.barra('Orçamentos', Limites.contar('budgets'), Limites.limite('budgets')),
      Limites.barra('Metas', Limites.contar('goals'), Limites.limite('goals')),
      Limites.barra('Recorrências', Limites.contar('recurring_items'), Limites.limite('recurring_items'))
    ]);
    const detalhes = el('details', { class: 'uso-detalhes' }, [
      el('summary', { class: 'uso-resumo' }, [
        el('span', { text: 'Acompanhar recursos utilizados' }),
        el('span', { class: 'uso-seta', 'aria-hidden': 'true' })
      ]),
      caixa
    ]);
    box.appendChild(linha('Consumo do plano',
      'A cota do UGLEZ reinicia todo dia 1º, no horário de Brasília.', detalhes));

    if (p.id === 'free') {
      box.appendChild(linha(
        'Coqueiro e Oásis',
        'Mais contas, histórico e consultas ao UGLEZ. No cartão, cancele quando quiser.',
        el('button', {
          class: 'btn btn-outline btn-sm', type: 'button', text: 'Ver planos',
          onclick: () => App.goTo('precos')
        })
      ));
      return;
    }

    const ate = d.fimPeriodo ? new Date(d.fimPeriodo).toLocaleDateString('pt-BR') : null;
    if (d.cancelaNoFim) {
      box.appendChild(linha(
        'Assinatura cancelada',
        ate ? 'Não renova. Você continua com o ' + p.nome + ' até ' + ate + '.' : 'Não renova.',
        el('button', {
          class: 'btn btn-outline btn-sm', type: 'button', text: 'Ver planos',
          onclick: () => App.goTo('precos')
        })
      ));
      return;
    }

    box.appendChild(linha(
      'Assinatura',
      (d.status === 'past_due'
        ? 'O último pagamento não passou. Atualize o cartão pelo aviso da Stripe'
        : 'Renova no cartão ' + (d.ciclo === 'annual' ? 'todo ano' : 'todo mês'))
        + (ate ? ' · período atual até ' + ate + '.' : '.'),
      el('button', {
        class: 'btn btn-outline btn-sm danger', type: 'button', text: 'Cancelar assinatura…',
        onclick: () => cancelarAssinatura(p, ate)
      })
    ));
  }

  function cancelarAssinatura(p, ate) {
    const aviso = el('p', { class: 'hint', role: 'status', style: { minHeight: '18px' } });
    let enviando = false;
    UI.openModal({
      title: 'Cancelar o ' + p.nome,
      body: el('div', { style: { fontSize: '13.5px', lineHeight: '1.65' } }, [
        el('p', { text: 'A renovação para agora e nada mais é cobrado.' + (ate ? ' Você continua com o ' + p.nome + ' até ' + ate + '.' : '') }),
        el('p', { style: { marginTop: '10px' }, text: 'Depois, a conta volta ao Semente. Nenhum dado é apagado.' }),
        aviso
      ]),
      buttons: [
        { label: 'Manter assinatura', class: 'btn-outline', onClick: UI.closeModal },
        {
          label: 'Cancelar assinatura', class: 'btn-danger',
          onClick: async () => {
            if (enviando) return;
            enviando = true;
            aviso.textContent = 'Cancelando…';
            try {
              const r = await Conta.chamarFuncao('oaze-pagamento', { acao: 'cancelar' });
              if (r.ok !== true) {
                aviso.textContent = r.mensagem || 'Não foi possível cancelar agora. Tente de novo.';
                enviando = false;
                return;
              }
              UI.closeModal();
              UI.toast('Assinatura cancelada. Nada mais será cobrado.', 'success', 5000);
              await Limites.carregar();
              await Conta.carregarAssinatura();
              Cfg.render();
            } catch (e) {
              aviso.textContent = 'Falha ao falar com o servidor. Nada mudou.';
              enviando = false;
            }
          }
        }
      ]
    });
  }

  /* ---------------- conta ---------------- */

  function conta() {
    const box = document.getElementById('setConta');
    if (!box) return;
    U.clear(box);

    const u = global.Sync && Sync.currentUser();

    /* ENQUANTO A SESSÃO NÃO FOI RESOLVIDA, NÃO SE AFIRMA NADA.
       Restaurar a sessão é assíncrono, e até a resposta chegar
       currentUser() é null — que NÃO significa "não tem conta".
       Dizer "sem conta neste aparelho" para quem está logado, com
       um botão de criar conta ao lado, é como se ensinava a pessoa
       a criar a segunda conta. */
    if (global.Sync && Sync.restaurando && Sync.restaurando()) {
      box.appendChild(linha(
        'Verificando sua conta…',
        'Restaurando a sessão salva neste aparelho.',
        el('span', { class: 'muted', text: 'Aguarde' })
      ));
      return;
    }

    if (!u) {
      box.appendChild(linha(
        'Sem conta neste aparelho',
        'O painel funciona assim mesmo. Uma conta serve para ver os mesmos dados no computador e no celular, e para usar o UGLEZ.',
        el('button', { class: 'btn btn-primary btn-sm', text: 'Entrar ou criar conta', onclick: () => Sync.signIn() })
      ));
      return;
    }

    box.appendChild(linha(
      'Seu perfil',
      u.email || 'conta conectada',
      el('button', { class: 'btn btn-outline btn-sm', text: 'Editar perfil', onclick: () => Conta.editarPerfil() })
    ));

    /* O plano aparece uma vez só, no cartão Plano. */

    box.appendChild(linha(
      'Excluir a conta',
      'Apaga a conta e todos os dados do servidor, em todos os aparelhos, e encerra a assinatura. Não tem volta.',
      el('button', { class: 'btn btn-outline btn-sm danger', text: 'Excluir conta…', onclick: () => Conta.excluir() })
    ));
  }

  /* Mesmo motivo da página do UGLEZ: quem desenhou "Verificando
     sua conta…" precisa ser avisado quando a verificação termina. */
  if (global.Sync && Sync.aoResolverSessao) {
    Sync.aoResolverSessao(() => { if (App.page === 'settings') Cfg.render(); });
  }

  global.Cfg = Cfg;
})(window);
