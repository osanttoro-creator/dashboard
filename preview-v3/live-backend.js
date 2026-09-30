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

  const loginUrl = '/entrar?destino=' + encodeURIComponent('/app-v3.html');
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
