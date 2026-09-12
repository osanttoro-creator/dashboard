/* =============================================================
   pages/settings.js — Configurações
   ------------------------------------------------------------
   Reúne numa página o que antes estava espalhado em botões da
   barra: perfil, tema, sincronização, UGLEZ e backup. Nenhuma
   funcionalidade nova — só um lugar previsível para achá-las.
   ============================================================= */
(function (global) {
  'use strict';

  const el = U.el;
  const Cfg = {};

  Cfg.render = function () {
    perfil();
    aparencia();
    sinc();
    uglez();
    dados();
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
    const st = Store.state();

    box.appendChild(linha(
      'Nome na saudação',
      'Aparece no topo do painel.',
      el('button', {
        class: 'btn btn-outline btn-sm',
        text: Store.ownerName() || 'Definir nome',
        onclick: () => App.askOwnerName()
      })
    ));

    box.appendChild(linha(
      'Espaço financeiro ativo',
      `${st.profiles.length} espaço(s). Cada um tem contas, cartões, lançamentos e categorias próprios — separar pessoal de trabalho, por exemplo.`,
      el('button', { class: 'btn btn-outline btn-sm', text: 'Gerenciar espaços', onclick: () => Forms.openProfiles() })
    ));

    const prof = Store.profile();
    box.appendChild(linha(
      'Conteúdo deste espaço',
      `${prof.transactions.length} lançamentos · ${prof.accounts.length} contas · ${prof.cards.length} cartões · ${prof.goals.length} metas`,
      el('span', { class: 'muted', text: prof.name })
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

  function sinc() {
    const box = U.clear(document.getElementById('setSync'));
    /* Antes isto perguntava pelo FirebaseConfig -- e como o Firebase
       saiu, a resposta era sempre "não configurada", mesmo com a
       sincronização funcionando. Quem responde é quem sincroniza. */
    const ligado = !!(global.SupabaseConfig && SupabaseConfig.url &&
                      (SupabaseConfig.publishableKey || SupabaseConfig.anonKey));

    box.appendChild(linha(
      'Entre aparelhos',
      ligado
        ? 'Entre na sua conta para que este perfil apareça também no celular.'
        : 'Não configurada neste arquivo. O app funciona normalmente, só não sincroniza.',
      el('span', { id: 'syncBoxSettings' })
    ));

    // o sync.js escreve no #syncBox da sidebar; espelhamos o estado aqui
    const origem = document.getElementById('syncBox');
    const destino = document.getElementById('syncBoxSettings');
    if (origem && destino) destino.appendChild(el('span', { class: 'muted', text: origem.textContent.trim() || '—' }));

    /* A frase muda conforme a situação REAL da conta, e não é
       decorativa: ela é a diferença entre "se eu limpar o navegador,
       perco tudo" e "não perco". Antes dizia sempre que a
       sincronização era uma cópia e o navegador o original -- o que
       deixou de ser verdade quando o banco virou a fonte, e
       continuar dizendo faria alguém tratar como descartável o
       único lugar onde os dados dele existem. */
    const comConta = global.Dados && Dados.estado() !== 'local';
    box.appendChild(linha(
      'Onde os dados ficam',
      comConta
        ? 'No servidor, na sua conta — é lá que eles existem de verdade e é de lá que ' +
          'vêm ao abrir em qualquer aparelho. Este navegador guarda uma cópia local para ' +
          'a tela abrir rápido e para você continuar trabalhando sem internet.'
        : 'Só neste navegador (localStorage). Não há cópia em lugar nenhum: limpar os ' +
          'dados do site, trocar de aparelho ou usar uma janela anônima apaga tudo. ' +
          'Com uma conta, eles passam a viver no servidor.',
      el('span', { class: 'muted', text: Store.storageOK ? 'Armazenamento disponível' : 'BLOQUEADO neste navegador' })
    ));
  }

  function uglez() {
    const box = U.clear(document.getElementById('setUglez'));
    const modo = AI.modo();

    box.appendChild(linha(
      'Como o UGLEZ responde',
      modo.chave === 'servidor'
        ? 'Por um servidor autenticado. Nenhuma chave de IA existe neste navegador.'
        : modo.chave === 'sem-sessao'
          ? 'Entre na sua conta para conversar. As leituras da página UGLEZ continuam funcionando: são calculadas aqui, sem rede.'
          : 'Assistente não configurado neste ambiente. As leituras da página UGLEZ continuam funcionando.',
      el('span', { class: 'badge ' + (modo.chave === 'servidor' ? 'badge-ok' : ''), text: modo.rotulo })
    ));

    box.appendChild(linha(
      'O que é enviado',
      'Um resumo agregado do mês exibido. Nunca a lista de lançamentos nem dados de outro perfil.',
      el('button', { class: 'btn btn-outline btn-sm', text: 'Ver exatamente', onclick: () => AI.mostrarDados() })
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
        text: 'Sem conta, o app usa os limites do plano Grátis neste aparelho.' }));
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
    box.appendChild(linha('Consumo do plano',
      'A cota do UGLEZ reinicia todo dia 1º, no horário de Brasília.', caixa));

    box.appendChild(linha(
      'Planos Basic e Pro',
      'As novas assinaturas ainda não estão disponíveis.',
      el('button', {
        class: 'btn btn-outline btn-sm', type: 'button', text: 'Ver planos',
        onclick: () => App.goTo('precos')
      })
    ));
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

    /* O plano vem do banco. O navegador não tem como alterá-lo:
       não existe política de escrita em subscriptions. */
    const plano = Conta.plano();
    box.appendChild(linha(
      'Plano',
      plano === 'free'
          ? 'Plano gratuito. Todos os recursos disponíveis hoje estão liberados.'
          : 'Plano ' + U.smartCase(plano) + ' ativo na sua conta.',
      el('span', {
        class: 'badge ' + (plano === 'free' ? '' : 'badge-ok'),
        text: plano === 'free' ? 'Gratuito' : U.smartCase(plano)
      })
    ));

    box.appendChild(linha(
      'Excluir a conta',
      'Apaga a conta e todos os dados do servidor, em todos os aparelhos. Não tem volta.',
      el('button', { class: 'btn btn-outline btn-sm danger', text: 'Excluir conta…', onclick: () => Conta.excluir() })
    ));
  }

  function dados() {
    const box = U.clear(document.getElementById('setData'));

    box.appendChild(linha(
      'Configuração inicial',
      'Refazer as etapas de configuração. Nada é apagado — os campos vêm preenchidos com o que já existe.',
      el('button', {
        class: 'btn btn-outline btn-sm', text: 'Reabrir configuração',
        onclick: () => Ob.reabrir()
      })
    ));

    box.appendChild(linha(
      'Backup',
      'Baixa um JSON com TODOS os perfis. Guarde antes de mexer em algo grande.',
      el('button', {
        class: 'btn btn-primary btn-sm', text: '↓ Baixar backup',
        onclick: () => {
          U.download(`oaze-backup-${U.todayISO()}.json`, Store.exportJSON());
          UI.toast('Backup baixado.', 'success');
        }
      })
    ));

    box.appendChild(linha(
      'Restaurar',
      'Substitui todos os dados atuais pelo conteúdo do arquivo. Pede confirmação.',
      el('button', {
        class: 'btn btn-outline btn-sm', text: '↑ Restaurar backup',
        onclick: () => document.getElementById('fileRestore').click()
      })
    ));

    /* ============================================================
       TRAZER OS DADOS ANTIGOS — a porta de volta
       ------------------------------------------------------------
       O convite automático agora aparece uma vez e respeita o "não".
       Esta linha é a contrapartida obrigatória disso: uma decisão
       que o sistema guarda para sempre e o usuário não pode revisar
       não é uma decisão, é uma porta que trancou.

       Só aparece quando há de fato dado antigo neste navegador.
       Um botão que só sabe dizer "não há nada para trazer" é ruído
       permanente em Configurações.
       ============================================================ */
    if (global.Mig && Mig.temDadoAntigo && Mig.temDadoAntigo()) {
      const decisao = Mig.decisaoConhecida && Mig.decisaoConhecida();
      const concluida = decisao && decisao.status === 'concluida';
      box.appendChild(linha(
        'Dados antigos deste navegador',
        concluida
          ? 'Já copiados para a sua conta e conferidos no servidor. O que está aqui continua aqui — nada foi apagado.'
          : 'Este navegador guarda dados de antes da sua conta. Copiá-los é idempotente: rodar de novo não duplica nada.',
        el('button', {
          class: 'btn btn-outline btn-sm',
          text: concluida ? 'Ver situação' : 'Trazer para a conta',
          onclick: () => Mig.reabrir()
        })
      ));
    }
  }

  /* Mesmo motivo da página do UGLEZ: quem desenhou "Verificando
     sua conta…" precisa ser avisado quando a verificação termina. */
  if (global.Sync && Sync.aoResolverSessao) {
    Sync.aoResolverSessao(() => { if (App.page === 'settings') Cfg.render(); });
  }

  global.Cfg = Cfg;
})(window);
