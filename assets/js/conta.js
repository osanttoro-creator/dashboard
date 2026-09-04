/* =============================================================
   conta.js — a conta como objeto de primeira classe
   ------------------------------------------------------------
   Reúne o que o brief pede sobre identidade e acesso: perfil do
   usuário, recuperação de senha, status da assinatura, controle
   de acesso e exclusão da conta.

   UMA DECISÃO QUE PRECISA FICAR EXPLÍCITA
   O brief pede "rotas protegidas". O OAZE sempre funcionou sem
   conta, offline, e o mesmo brief manda preservar as funções
   existentes. Trancar o painel atrás de login resolveria uma
   frase e quebraria a outra — e quebraria o app aberto do disco e
   o arquivo único do iPhone, onde não existe servidor.

   Então a proteção é do que DEPENDE de conta, não do produto:

     livre        painel, lançamentos, gráficos, backup local
     exige conta  sincronizar, UGLEZ, dados em outro aparelho
     exige plano  o que for definido quando houver planos

   Quem abre sem conta vê o app funcionando e um convite; quem
   entra ganha as três coisas de cima. Ninguém encontra uma porta
   fechada sem explicação.

   O PLANO NUNCA VEM DO NAVEGADOR
   Acesso.plano() lê a tabela `subscriptions`, que só o webhook
   escreve. O cliente não tem política de INSERT nem UPDATE ali —
   se tivesse, "assinante" seria uma linha de DevTools.
   ============================================================= */
(function (global) {
  'use strict';

  const Conta = {};
  const el = U.el;

  /* Enquanto não há planos definidos, tudo que existe é gratuito.
     Este mapa é o único lugar que decide — quando os planos forem
     definidos, muda aqui e em lugar nenhum mais. */
  const RECURSOS = {
    sincronizar: 'conta',
    uglez: 'conta',
    multiaparelho: 'conta'
  };

  let assinatura = null;      // cache da sessão
  let perfil = null;

  function sb() {
    try {
      return (global.SupabaseBackend && SupabaseBackend.cliente && SupabaseBackend.cliente()) || null;
    } catch (e) { return null; }
  }
  const logado = () => !!(global.Sync && Sync.currentUser());

  /* ============================================================
     1 · ASSINATURA E ACESSO
     ============================================================ */

  Conta.carregarAssinatura = async function () {
    assinatura = null;
    const c = sb();
    const u = global.Sync && Sync.currentUser();
    if (!c || !u) return null;
    try {
      const { data } = await c.from('subscriptions')
        .select('plan, status, current_period_end, canceled_at, trial_ends_at')
        .eq('user_id', u.uid).maybeSingle();
      assinatura = data || null;
    } catch (e) { /* offline: segue sem */ }
    return assinatura;
  };

  /** O plano efetivo. Sem linha ou sem status ativo, é 'free'. */
  Conta.plano = function () {
    if (!assinatura) return 'free';
    return ['active', 'trialing'].includes(assinatura.status) ? assinatura.plan : 'free';
  };

  Conta.assinatura = () => assinatura;

  /**
   * A assinatura está em situação que exige atenção? Devolve null
   * quando está tudo bem — assim quem chama não precisa conhecer
   * os nomes dos status.
   */
  Conta.pendencia = function () {
    if (!assinatura) return null;
    const s = assinatura.status;
    if (s === 'past_due') {
      return {
        titulo: 'Pagamento pendente',
        texto: 'Não conseguimos confirmar o último pagamento. Seus dados continuam aqui e nada foi apagado — regularize para voltar a usar os recursos do plano.',
        acao: 'Regularizar'
      };
    }
    if (s === 'canceled') {
      return {
        titulo: 'Assinatura encerrada',
        texto: 'Sua assinatura foi encerrada. O painel continua funcionando com seus dados; os recursos do plano ficam indisponíveis até você reativar.',
        acao: 'Reativar'
      };
    }
    if (s === 'incomplete') {
      return {
        titulo: 'Assinatura incompleta',
        texto: 'A confirmação do pagamento não chegou. Isso pode levar alguns minutos; se persistir, refaça a assinatura.',
        acao: 'Ver detalhes'
      };
    }
    return null;
  };

  /** Este recurso está disponível agora? */
  Conta.pode = function (recurso) {
    const exige = RECURSOS[recurso];
    if (!exige) return true;                       // não catalogado é livre
    if (exige === 'conta') return logado();
    return Conta.plano() === exige;
  };

  /**
   * Explica a falta em vez de simplesmente negar. Um recurso que
   * some sem dizer por quê é indistinguível de um recurso quebrado.
   */
  Conta.exigir = function (recurso, oQueEra) {
    if (Conta.pode(recurso)) return true;
    const exige = RECURSOS[recurso];
    if (exige === 'conta') {
      UI.openModal({
        title: 'Precisa de uma conta',
        body: el('div', { style: { fontSize: '13.5px', lineHeight: '1.65' } }, [
          el('p', { text: oQueEra + ' precisa de uma conta OAZE.' }),
          el('p', { style: { marginTop: '10px' }, text: 'Não é uma trava comercial: é assim que seus dados sabem para onde ir. O painel continua funcionando neste aparelho sem conta nenhuma.' })
        ]),
        buttons: [
          { label: 'Agora não', class: 'btn-outline', onClick: UI.closeModal },
          { label: 'Entrar', class: 'btn-primary', onClick: () => { UI.closeModal(); Sync.signIn(); } }
        ]
      });
    }
    return false;
  };

  /* ============================================================
     2 · RECUPERAÇÃO DE SENHA
     ============================================================
     O link do e-mail traz o app de volta com um token de
     recuperação. Sem uma tela para DEFINIR a senha nova, o usuário
     volta logado e sem entender o que aconteceu — e a senha antiga,
     que ele não lembra, continua valendo. */

  /**
   * Chamado no boot. O Supabase já consumiu o hash da URL e abriu
   * a sessão; o que sobra para nós é reconhecer que isto foi uma
   * recuperação e pedir a senha nova.
   */
  Conta.verificarRecuperacao = function () {
    const hash = String(location.hash || '');
    const busca = String(location.search || '');
    const eRecuperacao = hash.includes('type=recovery') || busca.includes('type=recovery');
    if (!eRecuperacao) return false;

    /* Limpa a URL antes de qualquer coisa: o token não deve ficar
       no histórico do navegador nem ser copiado junto num link. */
    try {
      history.replaceState(null, '', location.pathname + location.search.replace(/[?&]type=recovery/, ''));
    } catch (e) { /* segue */ }

    setTimeout(() => Conta.definirNovaSenha(), 400);
    return true;
  };

  Conta.definirNovaSenha = function () {
    const nova = el('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: 'nova senha' });
    const repetir = el('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: 'repita a senha' });
    const aviso = el('p', { class: 'hint', style: { minHeight: '18px' } });
    const diz = (t, erro) => { aviso.textContent = t || ''; aviso.style.color = erro ? 'var(--danger, #B3402F)' : ''; };

    UI.openModal({
      title: 'Definir nova senha',
      body: el('div', { class: 'login-box' }, [
        el('p', { class: 'login-sub', text: 'Você chegou aqui pelo link de recuperação. Escolha uma senha nova para esta conta.' }),
        el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Nova senha' }), nova]),
        el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Repita' }), repetir]),
        aviso
      ]),
      buttons: [{
        label: 'Salvar senha', class: 'btn-primary',
        onClick: async () => {
          const a = nova.value, b = repetir.value;
          if (a.length < 6) { diz('A senha precisa de pelo menos 6 caracteres.', true); nova.focus(); return; }
          if (a !== b) { diz('As duas senhas não são iguais.', true); repetir.focus(); return; }
          const c = sb();
          if (!c) { diz('Sem conexão com o servidor.', true); return; }
          try {
            const { error } = await c.auth.updateUser({ password: a });
            if (error) throw error;
            UI.closeModal();
            UI.toast('Senha alterada. Ela já vale no próximo login.', 'success', 7000);
          } catch (e) {
            diz(String(e.message || e), true);
          }
        }
      }]
    });
  };

  /* ============================================================
     3 · PERFIL
     ============================================================ */

  Conta.carregarPerfil = async function () {
    perfil = null;
    const c = sb();
    const u = global.Sync && Sync.currentUser();
    if (!c || !u) return null;
    try {
      const { data } = await c.from('profiles')
        .select('nome, moeda, pais, fuso').eq('user_id', u.uid).maybeSingle();
      perfil = data || null;
    } catch (e) { /* offline */ }
    return perfil;
  };

  Conta.editarPerfil = function () {
    const u = global.Sync && Sync.currentUser();
    if (!u) { Sync.signIn(); return; }
    const p = perfil || {};

    const nome = el('input', { class: 'input', type: 'text', maxlength: '40', value: p.nome || Store.ownerName() || '' });
    const moeda = el('select', { class: 'input' });
    const pais = el('select', { class: 'input' });
    UI.fillSelect(moeda, [
      { value: 'BRL', label: 'Real (R$)' },
      { value: 'USD', label: 'Dólar (US$)' },
      { value: 'EUR', label: 'Euro (€)' }
    ], p.moeda || 'BRL');
    UI.fillSelect(pais, [
      { value: 'BR', label: 'Brasil' }, { value: 'PT', label: 'Portugal' },
      { value: 'US', label: 'Estados Unidos' }, { value: 'OUTRO', label: 'Outro' }
    ], p.pais || 'BR');

    UI.openModal({
      title: 'Seu perfil',
      body: el('div', { class: 'ob-corpo' }, [
        el('p', { class: 'hint', text: 'Conta: ' + (u.email || '—') }),
        el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Nome' }), nome]),
        el('div', { class: 'ob-dupla' }, [
          el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Moeda' }), moeda]),
          el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'País' }), pais])
        ]),
        el('p', { class: 'hint', text: 'O e-mail não muda por aqui: trocá-lo exige confirmar o novo endereço, e isso é assunto do provedor de login.' })
      ]),
      buttons: [
        { label: 'Cancelar', class: 'btn-outline', onClick: UI.closeModal },
        {
          label: 'Salvar', class: 'btn-primary',
          onClick: async () => {
            const c = sb();
            const dados = {
              user_id: u.uid, nome: nome.value.trim() || null,
              moeda: moeda.value, pais: pais.value,
              fuso: (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'America/Sao_Paulo'
            };
            if (nome.value.trim()) Store.setOwnerName(nome.value.trim());
            try {
              if (c) await c.from('profiles').upsert(dados, { onConflict: 'user_id' });
              perfil = dados;
              UI.closeModal();
              UI.toast('Perfil salvo.', 'success');
              if (App.page === 'settings') Cfg.render();
            } catch (e) {
              UI.toast('Não foi possível salvar agora: ' + e.message, 'error');
            }
          }
        }
      ]
    });
  };

  /* ============================================================
     4 · EXCLUSÃO DA CONTA
     ============================================================ */

  Conta.excluir = function () {
    const u = global.Sync && Sync.currentUser();
    if (!u) { UI.toast('Entre na sua conta primeiro.', 'error'); return; }

    const campo = el('input', {
      class: 'input', type: 'email', autocomplete: 'off',
      placeholder: u.email || 'seu e-mail'
    });
    const aviso = el('p', { class: 'hint', style: { minHeight: '18px' } });
    const diz = (t, erro) => { aviso.textContent = t || ''; aviso.style.color = erro ? 'var(--danger, #B3402F)' : ''; };

    UI.openModal({
      title: 'Excluir a conta',
      wide: true,
      body: el('div', { style: { fontSize: '13.5px', lineHeight: '1.65' } }, [
        el('div', { class: 'parse-info is-warn' }, el('div', {}, [
          el('strong', { text: 'Isto apaga tudo, e não tem volta.' }),
          el('p', { style: { marginTop: '6px' }, text: 'Espaços, contas, cartões, categorias, lançamentos, investimentos, faturas, orçamentos, metas e a assinatura. Em todos os aparelhos.' })
        ])),
        el('p', { style: { marginTop: '12px' } }, [
          el('strong', { text: 'Baixe o backup antes. ' }),
          el('span', { text: 'Depois de excluir, não existe de onde recuperar — nem para nós.' })
        ]),
        el('button', {
          class: 'btn btn-outline btn-sm', type: 'button', style: { marginTop: '8px' },
          text: '↓ Baixar backup agora',
          onclick: () => {
            U.download('oaze-backup-' + U.todayISO() + '.json', Store.exportJSON());
            diz('Backup baixado. Confira o arquivo antes de continuar.');
          }
        }),
        el('label', { class: 'field', style: { marginTop: '14px' } }, [
          el('span', { class: 'field-label', text: 'Digite ' + (u.email || 'seu e-mail') + ' para confirmar' }),
          campo
        ]),
        aviso
      ]),
      buttons: [
        { label: 'Cancelar', class: 'btn-outline', onClick: UI.closeModal },
        {
          label: 'Excluir para sempre', class: 'btn-danger',
          onClick: async () => {
            const digitado = campo.value.trim().toLowerCase();
            if (digitado !== String(u.email || '').toLowerCase()) {
              diz('O e-mail não confere.', true); campo.focus(); return;
            }
            diz('Excluindo…');
            try {
              const r = await Conta.chamarFuncao('oaze-conta', {
                acao: 'excluir', confirmacao: digitado
              });
              /* Exige ok:true EXPLÍCITO, não a ausência de erro.
                 Uma resposta inesperada — função ainda não publicada,
                 versão antiga, proxy no caminho — não traz campo
                 'erro', e tratar isso como sucesso apagaria o
                 localStorage de alguém cuja conta continua existindo.
                 Em operação irreversível, o silêncio é "não". */
              if (r.ok !== true) {
                diz(r.mensagem || 'O servidor não confirmou a exclusão. Nada foi apagado.', true);
                return;
              }

              /* Só agora o local sai — e só porque o servidor
                 confirmou. Apagar antes trocaria uma perda de dados
                 por outra. */
              try {
                localStorage.removeItem('financas.v1');
                localStorage.removeItem('oaze.onboarding.v1');
                localStorage.removeItem('oaze.fila.v1');
              } catch (e) { /* segue */ }

              const n = (r.resumo && r.resumo.lancamentos) || 0;
              UI.closeModal();
              UI.openModal({
                title: 'Conta excluída',
                body: el('div', { style: { fontSize: '13.5px', lineHeight: '1.65' } }, [
                  el('p', { text: 'Apagamos ' + n + ' lançamento(s) e tudo mais ligado à conta.' }),
                  el('p', { style: { marginTop: '10px' }, text: 'Obrigado por ter usado o OAZE. Se um dia voltar, é só criar outra conta.' })
                ]),
                buttons: [{
                  label: 'Fechar', class: 'btn-primary',
                  onClick: () => { location.reload(); }
                }]
              });
            } catch (e) {
              diz('Falha ao falar com o servidor: ' + e.message, true);
            }
          }
        }
      ]
    });
  };

  /* ============================================================
     5 · CHAMADA ÀS FUNÇÕES
     ============================================================ */

  Conta.chamarFuncao = async function (nome, corpo) {
    const cfg = global.SupabaseConfig || {};
    const base = String(cfg.url || '').replace(/\/+$/, '');
    const chave = String(cfg.publishableKey || cfg.anonKey || '');
    if (!base || !chave) return { erro: 'indisponivel', mensagem: 'Servidor não configurado.' };

    const c = sb();
    if (!c) return { erro: 'sem_sessao' };
    const { data } = await c.auth.getSession();
    const token = data && data.session && data.session.access_token;
    if (!token) return { erro: 'sem_sessao', mensagem: 'Sua sessão expirou.' };

    const r = await fetch(base + '/functions/v1/' + nome, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: chave,
        authorization: 'Bearer ' + token
      },
      body: JSON.stringify(corpo)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok && !j.erro) j.erro = r.status === 401 ? 'sem_sessao' : 'indisponivel';
    return j;
  };

  /* ============================================================
     6 · AVISO DE PENDÊNCIA
     ============================================================ */

  /** Faixa no topo quando a assinatura precisa de atenção. */
  Conta.pintarAviso = function () {
    const alvo = document.getElementById('avisoConta');
    if (!alvo) return;
    const p = Conta.pendencia();
    U.clear(alvo);
    alvo.hidden = !p;
    if (!p) return;

    alvo.setAttribute('role', 'status');
    alvo.appendChild(el('div', { class: 'aviso-conta' }, [
      el('div', {}, [
        el('strong', { text: p.titulo }),
        el('p', { text: p.texto })
      ]),
      el('button', {
        class: 'btn btn-primary btn-sm', type: 'button', text: p.acao,
        onclick: () => App.goTo('settings')
      })
    ]));
  };

  /* ============================================================
     7 · CICLO
     ============================================================ */

  Conta.aoEntrar = async function () {
    await Conta.carregarPerfil();
    await Conta.carregarAssinatura();
    Conta.pintarAviso();
    if (App.page === 'settings') Cfg.render();
  };

  Conta.aoSair = function () {
    assinatura = null; perfil = null;
    Conta.pintarAviso();
  };

  Conta.init = function () {
    Conta.verificarRecuperacao();
  };

  global.Conta = Conta;
})(window);
