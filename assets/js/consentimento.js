/* =============================================================
   consentimento.js — aceite obrigatório antes do primeiro uso
   -------------------------------------------------------------
   A tela pública bloqueia a criação da conta sem aceite. Esta
   segunda camada cobre OAuth, contas antigas e acesso direto ao
   app. Para quem está autenticado, o registro fica no Supabase e
   é protegido por RLS; sem conta, vale apenas neste navegador.
   ============================================================= */
(function (global) {
  'use strict';

  const Consentimento = {};
  const VERSAO = '2026-09-15';
  const CHAVE_PENDENTE = 'oaze.privacidade.aceite-pendente';
  const CHAVE_LOCAL = 'oaze.privacidade.local.' + VERSAO;
  const FONTES = new Set([
    'cadastro_email', 'oauth_google', 'oauth_apple',
    'metadata_email', 'app_bloqueio', 'app_local'
  ]);
  let promessa = null;
  let aceiteLocalSessao = false;

  function cliente() {
    return global.SupabaseBackend && SupabaseBackend.cliente && SupabaseBackend.cliente();
  }

  function aceiteValido(a) {
    return !!(a && a.policy_version === VERSAO &&
      typeof a.accepted_at === 'string' && !isNaN(Date.parse(a.accepted_at)));
  }

  function lerPendente() {
    try {
      const a = JSON.parse(sessionStorage.getItem(CHAVE_PENDENTE) || 'null');
      return aceiteValido(a) ? a : null;
    } catch (e) { return null; }
  }

  function limparPendente() {
    try { sessionStorage.removeItem(CHAVE_PENDENTE); } catch (e) { /* segue */ }
  }

  function temAceiteLocal() {
    if (aceiteLocalSessao) return true;
    try { return localStorage.getItem(CHAVE_LOCAL) === 'aceito'; } catch (e) { return false; }
  }

  function salvarAceiteLocal() {
    aceiteLocalSessao = true;
    try { localStorage.setItem(CHAVE_LOCAL, 'aceito'); } catch (e) { /* vale nesta sessão */ }
  }

  function esperarSessao() {
    if (!global.Sync || Sync.sessaoResolvida()) return Promise.resolve();
    return new Promise((resolve) => Sync.aoResolverSessao(resolve));
  }

  async function jaRegistrado(c, userId) {
    const r = await c.from('privacy_acceptances')
      .select('policy_version')
      .eq('user_id', userId)
      .eq('policy_version', VERSAO)
      .maybeSingle();
    if (r.error) throw r.error;
    return !!r.data;
  }

  async function registrar(c, userId, aceite) {
    const fonte = FONTES.has(aceite && aceite.source) ? aceite.source : 'app_bloqueio';
    const data = aceiteValido(aceite) ? aceite.accepted_at : new Date().toISOString();
    const r = await c.from('privacy_acceptances').insert({
      user_id: userId,
      policy_version: VERSAO,
      accepted_at: data,
      source: fonte
    });
    if (!r.error || r.error.code === '23505') return true;
    throw r.error;
  }

  async function aceiteDoMetadata(c) {
    const r = await c.auth.getUser();
    if (r.error || !r.data || !r.data.user) return null;
    const m = r.data.user.user_metadata || {};
    const a = {
      policy_version: m.privacy_policy_version,
      accepted_at: m.privacy_accepted_at,
      source: 'metadata_email'
    };
    return aceiteValido(a) ? a : null;
  }

  function pedirAceite(c, user) {
    return new Promise((resolve) => {
      const marcado = U.el('input', { type: 'checkbox', id: 'consentimentoPrivacidadeApp' });
      const status = U.el('p', { class: 'consentimento-status', role: 'alert', hidden: true });
      const corpo = U.el('div', { class: 'consentimento-app' }, [
        U.el('p', { text: 'Antes de continuar, leia como o OAZE trata seus dados financeiros e seus direitos.' }),
        U.el('label', { class: 'consentimento-opcao', for: 'consentimentoPrivacidadeApp' }, [
          marcado,
          U.el('span', {}, [
            document.createTextNode('Li e aceito a '),
            U.el('a', { href: '/privacidade', target: '_blank', rel: 'noopener', text: 'Política de privacidade' }),
            document.createTextNode('.')
          ])
        ]),
        U.el('p', { class: 'hint', text: user
          ? 'O aceite será vinculado à sua conta. Você pode consultar a política a qualquer momento.'
          : 'Sem conta, este aceite vale apenas neste navegador.' }),
        status
      ]);

      UI.openModal({
        title: 'Privacidade antes de começar',
        body: corpo,
        locked: true,
        noAutofocus: true,
        buttons: [
          {
            label: user ? 'Sair' : 'Voltar ao site', class: 'btn-outline',
            onClick: async () => {
              try { if (user && c) await c.auth.signOut(); } catch (e) { /* encerra localmente */ }
              UI.closeModal(true);
              location.replace(user ? '/entrar' : '/');
              resolve(false);
            }
          },
          {
            label: 'Aceitar e continuar', class: 'btn-primary',
            onClick: async () => {
              const botao = document.querySelector('#modalFoot .btn-primary');
              if (!marcado.checked) {
                status.textContent = 'Marque o aceite para continuar.';
                status.hidden = false;
                marcado.focus();
                return;
              }
              if (botao) { botao.disabled = true; botao.setAttribute('aria-busy', 'true'); }
              status.hidden = true;
              try {
                if (user && c) {
                  await registrar(c, user.uid, {
                    policy_version: VERSAO,
                    accepted_at: new Date().toISOString(),
                    source: 'app_bloqueio'
                  });
                } else {
                  salvarAceiteLocal();
                }
                limparPendente();
                UI.closeModal(true);
                resolve(true);
              } catch (e) {
                console.error('Consentimento:', e);
                status.textContent = 'Não foi possível registrar o aceite. Verifique a conexão e tente novamente.';
                status.hidden = false;
                if (botao) { botao.disabled = false; botao.removeAttribute('aria-busy'); }
              }
            }
          }
        ]
      });

      const botao = document.querySelector('#modalFoot .btn-primary');
      if (botao) botao.disabled = true;
      marcado.addEventListener('change', () => {
        if (botao) botao.disabled = !marcado.checked;
        if (marcado.checked) status.hidden = true;
      });
    });
  }

  async function garantirInterno() {
    await esperarSessao();
    const user = global.Sync && Sync.currentUser ? Sync.currentUser() : null;
    const c = cliente();

    if (!user || !c) {
      if (temAceiteLocal()) return true;
      return pedirAceite(null, null);
    }

    try {
      if (await jaRegistrado(c, user.uid)) { limparPendente(); return true; }

      const pendente = lerPendente();
      const metadata = pendente ? null : await aceiteDoMetadata(c);
      const aceite = pendente || metadata;
      if (aceite) {
        await registrar(c, user.uid, aceite);
        limparPendente();
        return true;
      }
    } catch (e) {
      /* Falha fechada: sem conseguir verificar o registro, o app não
         presume consentimento. O modal permite tentar novamente. */
      console.error('Consentimento/verificação:', e);
    }

    return pedirAceite(c, user);
  }

  Consentimento.garantir = function () {
    if (!promessa) promessa = garantirInterno().finally(() => { promessa = null; });
    return promessa;
  };

  global.Consentimento = Consentimento;
})(window);
