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
      'Perfil ativo',
      `${st.profiles.length} perfil(is). Cada um tem contas, lançamentos e categorias próprios.`,
      el('button', { class: 'btn btn-outline btn-sm', text: 'Gerenciar perfis', onclick: () => Forms.openProfiles() })
    ));

    const prof = Store.profile();
    box.appendChild(linha(
      'Conteúdo deste perfil',
      `${prof.transactions.length} lançamentos · ${prof.accounts.length} contas · ${prof.cards.length} cartões · ${prof.goals.length} metas`,
      el('span', { class: 'muted', text: prof.name })
    ));
  }

  function aparencia() {
    const box = U.clear(document.getElementById('setAppearance'));
    const escuro = Store.state().theme === 'dark';

    box.appendChild(linha(
      'Tema',
      'O escuro é o padrão do OAZE. O claro usa os mesmos tons, em areia.',
      UI.segmented(
        [{ value: 'dark', label: 'Escuro' }, { value: 'light', label: 'Claro' }],
        escuro ? 'dark' : 'light',
        (v) => Store.setTheme(v)
      )
    ));

    box.appendChild(linha(
      'Movimento',
      'O sistema respeita a preferência do seu aparelho por menos movimento e menos transparência.',
      el('span', { class: 'muted', text: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'Reduzido pelo sistema' : 'Normal' })
    ));
  }

  function sinc() {
    const box = U.clear(document.getElementById('setSync'));
    const ligado = !!(global.FirebaseConfig && FirebaseConfig.apiKey);

    box.appendChild(linha(
      'Entre aparelhos',
      ligado
        ? 'Entre com a conta Google para que este perfil apareça também no celular.'
        : 'Não configurada neste arquivo. O app funciona normalmente, só não sincroniza.',
      el('span', { id: 'syncBoxSettings' })
    ));

    // o sync.js escreve no #syncBox da sidebar; espelhamos o estado aqui
    const origem = document.getElementById('syncBox');
    const destino = document.getElementById('syncBoxSettings');
    if (origem && destino) destino.appendChild(el('span', { class: 'muted', text: origem.textContent.trim() || '—' }));

    box.appendChild(linha(
      'Onde os dados ficam',
      'Sempre neste navegador (localStorage). A sincronização é uma cópia, não o original.',
      el('span', { class: 'muted', text: Store.storageOK ? 'Armazenamento disponível' : 'BLOQUEADO neste navegador' })
    ));
  }

  function uglez() {
    const box = U.clear(document.getElementById('setUglez'));
    const modo = AI.modo();

    box.appendChild(linha(
      'Como o UGLEZ responde',
      modo.chave === 'backend'
        ? 'Pelo servidor. A chave fica em variável de ambiente e nunca chega ao navegador.'
        : modo.chave === 'local'
          ? 'Com a sua chave, guardada só neste aparelho e enviada apenas para a Anthropic.'
          : 'Sem chave configurada. As leituras da página UGLEZ continuam funcionando: elas são calculadas aqui, sem rede.',
      el('span', { class: 'badge ' + (modo.chave === 'backend' ? 'badge-ok' : modo.chave === 'local' ? 'badge-card' : ''), text: modo.rotulo })
    ));

    box.appendChild(linha(
      'Chave da API',
      'Usada só quando não há servidor — arquivo aberto do disco ou no iPhone.',
      el('button', { class: 'btn btn-outline btn-sm', text: 'Configurar chave', onclick: () => AI.openConfig() })
    ));
  }

  function dados() {
    const box = U.clear(document.getElementById('setData'));

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

  }

  global.Cfg = Cfg;
})(window);
