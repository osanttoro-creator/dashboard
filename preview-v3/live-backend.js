/* Ponte da V3 para a conta existente. Não lê nem grava o cache global
   financas.v1: em navegador compartilhado ele pode pertencer a outra conta. */
(function (global) {
  'use strict';

  const V3Backend = {};
  let client = null;
  let user = null;
  let revisions = {};
  let saving = false;
  let refreshPending = false;
  let channel = null;

  const loginUrl = '/entrar?destino=' + encodeURIComponent(
    global.location.pathname.startsWith('/app/') ? global.location.pathname : '/app'
  );
  const ownerName = () => String(user?.name || user?.email?.split('@')[0] || 'Seu OAZE').slice(0, 40);
  const stamp = (p) => Math.max(0, Number(p?.updatedAt) || 0);
  const bounded = (operation) => {
    let timer;
    return Promise.race([
      operation,
      new Promise((_, reject) => { timer = global.setTimeout(() => reject(new Error('Tempo esgotado ao conectar sua conta.')), 12000); })
    ]).finally(() => global.clearTimeout(timer));
  };

  V3Backend.user = () => user;
  V3Backend.client = () => client;
  V3Backend.saving = () => saving;
  V3Backend.withTimeout = bounded;
  V3Backend.subscription = async function () {
    if (!client || !user) throw new Error('Entre na sua conta para consultar a assinatura.');
    const { data, error } = await bounded(client.from('subscriptions')
      .select('plan_id,status,current_period_end,cancel_at_period_end,stripe_subscription_id,asaas_subscription_id')
      .eq('user_id', user.id).maybeSingle());
    if (error) throw error;
    return data || { plan_id: 'free', status: 'free', cancel_at_period_end: false };
  };
  V3Backend.payment = async function (body) {
    if (!client || !user) throw new Error('Entre na sua conta para gerenciar a assinatura.');
    const config = global.SupabaseConfig || {};
    const base = String(config.url || '').replace(/\/+$/, '');
    const publicKey = String(config.publishableKey || config.anonKey || '');
    if (!/^https:\/\//.test(base) || !publicKey) throw new Error('Pagamento indisponível: conexão não configurada.');
    const { data, error } = await bounded(client.auth.getSession());
    if (error || !data?.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente.');
    const response = await bounded(fetch(base + '/functions/v1/oaze-pagamento', {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: publicKey,
        authorization: 'Bearer ' + data.session.access_token },
      body: JSON.stringify(body)
    }));
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.erro) throw new Error(result.mensagem || 'Pagamento indisponível agora. Nada foi cobrado.');
    return result;
  };
  async function requirePrivacyAcceptance() {
    const { data, error } = await bounded(client.from('privacy_acceptances')
      .select('policy_version').eq('user_id', user.id)
      .eq('policy_version', '2026-09-15').maybeSingle());
    if (error) throw error;
    if (data) return;
    const view = document.getElementById('v3-view');
    view.innerHTML = '<section class="v3-panel v3-consent"><span class="v3-label">ANTES DE ENTRAR</span><h2>Seus dados, suas regras.</h2><p>Leia a Política de privacidade e os Termos de uso antes de continuar. Sem o aceite, o aplicativo não carrega seus dados financeiros.</p><p><a href="/privacidade" target="_blank" rel="noopener noreferrer">Política de privacidade</a> · <a href="/termos" target="_blank" rel="noopener noreferrer">Termos de uso</a></p><form id="v3-privacy-form"><label><input type="checkbox" name="accept" required> Li e aceito a Política de privacidade (versão 15/09/2026).</label><button type="submit" class="v3-primary">Aceitar e entrar</button><button type="button" class="v3-secondary" id="v3-privacy-decline">Não aceitar</button><p role="alert" id="v3-privacy-error" hidden></p></form></section>';
    await new Promise((resolve) => {
      document.getElementById('v3-privacy-decline').addEventListener('click', async () => {
        await client.auth.signOut().catch(() => {});
        global.location.replace('/');
      });
      document.getElementById('v3-privacy-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.elements.accept.checked) return;
        const button = form.querySelector('[type="submit"]');
        const status = document.getElementById('v3-privacy-error');
        button.disabled = true;
        try {
          const result = await bounded(client.from('privacy_acceptances').insert({
            user_id: user.id,
            policy_version: '2026-09-15',
            accepted_at: new Date().toISOString(),
            source: 'app_bloqueio'
          }));
          if (result.error && result.error.code !== '23505') throw result.error;
          resolve();
        } catch (error) {
          status.textContent = 'Não consegui registrar o aceite. Tente novamente; seus dados não foram carregados.';
          status.hidden = false;
          button.disabled = false;
        }
      });
    });
  }

  V3Backend.reload = async function () {
    if (saving) { refreshPending = true; return false; }
    const verified = await bounded(SiteAuth.quemEsta());
    if (!verified || verified.id !== user?.id) {
      global.location.replace(loginUrl);
      return false;
    }
    const { data, error } = await bounded(client.from('dados')
      .select('profiles,removidos').eq('user_id', user.id).maybeSingle());
    if (error) throw error;
    const map = data?.profiles && typeof data.profiles === 'object' ? data.profiles : {};
    const removed = data?.removidos && typeof data.removidos === 'object' ? data.removidos : {};
    const valid = Object.fromEntries(Object.entries(map).filter(([id, profile]) =>
      profile && typeof profile === 'object' && stamp(profile) > (Number(removed[id]) || 0)));
    const active = Store.state()?.activeProfileId;
    revisions = Object.fromEntries(Object.entries(valid).map(([id, profile]) => [id, stamp(profile)]));
    Store.loadRemoteMap(valid, ownerName(), active);
    return true;
  };

  V3Backend.mutate = async function (change) {
    if (saving) throw new Error('Espere a gravação anterior terminar.');
    if (!user || !client) throw new Error('Entre na sua conta antes de alterar dados.');
    const profile = Store.profile();
    const id = profile.id;
    const expected = revisions[id] || 0;
    const before = JSON.parse(JSON.stringify(profile));
    saving = true;
    try {
      change();
      const payload = JSON.parse(JSON.stringify(Store.profile()));
      const { data, error } = await client.rpc('v3_salvar_perfil', {
        p_profile: payload,
        p_expected_updated_at: expected
      });
      if (error) throw error;
      const saved = Store.normalizeProfile(data);
      const index = Store.state().profiles.findIndex((p) => p.id === id);
      if (index >= 0) Store.state().profiles[index] = saved;
      revisions[id] = stamp(saved);
      Store.commit('sync-apply');
      return saved;
    } catch (error) {
      const index = Store.state().profiles.findIndex((p) => p.id === id);
      if (index >= 0) Store.state().profiles[index] = Store.normalizeProfile(before);
      Store.commit('sync-apply');
      if (error.code === '40001') {
        refreshPending = true;
        throw new Error('Este espaço mudou em outro aparelho. Atualizei a tela; confira e tente novamente.');
      }
      throw error;
    } finally {
      saving = false;
      if (refreshPending) {
        refreshPending = false;
        await V3Backend.reload().catch((e) => console.error('V3/atualização remota:', e));
      }
    }
  };

  V3Backend.createProfile = async function (name) {
    if (saving) throw new Error('Espere a gravação anterior terminar.');
    if (!user || !client) throw new Error('Entre na sua conta antes de criar um espaço.');
    const cleanName = String(name || '').trim().slice(0, 60);
    if (!cleanName) throw new Error('Dê um nome ao novo espaço.');
    const profile = Store.normalizeProfile({ id: U.uid('profile'), name: cleanName });
    saving = true;
    try {
      const { data, error } = await bounded(client.rpc('v3_salvar_perfil', {
        p_profile: profile,
        p_expected_updated_at: 0
      }));
      if (error) throw error;
      const saved = Store.normalizeProfile(data);
      revisions[saved.id] = stamp(saved);
      Store.state().profiles.push(saved);
      Store.setActiveProfile(saved.id);
      return saved;
    } finally {
      saving = false;
      if (refreshPending) {
        refreshPending = false;
        await V3Backend.reload().catch((error) => console.error('V3/atualização remota:', error));
      }
    }
  };

  V3Backend.start = async function () {
    client = SiteAuth.cliente();
    if (!client) throw new Error('A conexão com o Supabase não está configurada.');
    const verified = await bounded(SiteAuth.quemEsta());
    if (!verified) { global.location.replace(loginUrl); return false; }
    const { data: authData, error: authError } = await bounded(client.auth.getUser());
    if (authError) throw authError;
    if (!authData?.user || authData.user.id !== verified.id) {
      global.location.replace(loginUrl);
      return false;
    }
    const authUser = authData.user;
    user = {
      id: verified.id,
      email: verified.email || authUser.email || '',
      name: authUser.user_metadata?.full_name || authUser.user_metadata?.name || ''
    };
    // Nenhum documento financeiro é lido antes do aceite obrigatório.
    await requirePrivacyAcceptance();
    /* Compatibilidade somente de leitura para Limites e Coco. A V3 não
       inicializa o Sync antigo nem sua cópia local compartilhada. */
    global.Sync = { currentUser: () => ({ uid: user.id, email: user.email, displayName: ownerName() }) };
    global.SupabaseBackend = { cliente: () => client };
    await V3Backend.reload();
    channel = client.channel('oaze-v3-dados-' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dados', filter: 'user_id=eq.' + user.id },
        () => V3Backend.reload().catch((e) => console.error('V3/tempo real:', e)))
      .subscribe();
    client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') global.location.replace(loginUrl);
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) V3Backend.reload().catch((e) => console.error('V3/retomada:', e));
    });
    return true;
  };

  global.V3Backend = V3Backend;
})(window);
