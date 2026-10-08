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
  let accountProfile = null;
  let activeShareId = null;

  const loginUrl = '/entrar?destino=' + encodeURIComponent(
    (global.location.pathname.startsWith('/app/') ? global.location.pathname : '/app') +
    (/(?:^|[?&])convite=/.test(String(global.location.search || '')) ? global.location.search : '')
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
  V3Backend.accountProfile = () => accountProfile;
  V3Backend.withTimeout = bounded;
  V3Backend.setActiveShare = (id) => { activeShareId = id || null; };
  V3Backend.share = async function (body) {
    if (!client || !user) throw new Error('Entre na conta para compartilhar um perfil.');
    const config = global.SupabaseConfig || {};
    const base = String(config.url || '').replace(/\/+$/, '');
    const publicKey = String(config.publishableKey || config.anonKey || '');
    if (!/^https:\/\//.test(base) || !publicKey) throw new Error('Compartilhamento indisponível.');
    const { data, error } = await bounded(client.auth.getSession());
    if (error || !data?.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente.');
    const response = await bounded(fetch(base + '/functions/v1/oaze-perfis', {
      method: 'POST', cache: 'no-store',
      headers: { 'content-type': 'application/json', apikey: publicKey,
        authorization: 'Bearer ' + data.session.access_token },
      body: JSON.stringify(body)
    }));
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.erro) throw new Error(result.erro || 'Compartilhamento indisponível.');
    return result;
  };
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
  V3Backend.vault = async function (body) {
    if (!client || !user) throw new Error('Entre na conta para acessar o cofre.');
    const config = global.SupabaseConfig || {};
    const base = String(config.url || '').replace(/\/+$/, '');
    const publicKey = String(config.publishableKey || config.anonKey || '');
    if (!/^https:\/\//.test(base) || !publicKey) throw new Error('Cofre indisponível.');
    const { data, error } = await bounded(client.auth.getSession());
    if (error || !data?.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente.');
    const response = await bounded(fetch(base + '/functions/v1/oaze-cofre', {
      method: 'POST', cache: 'no-store',
      headers: { 'content-type': 'application/json', apikey: publicKey,
        authorization: 'Bearer ' + data.session.access_token },
      body: JSON.stringify(body)
    }));
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.erro) throw new Error(result.erro || 'Cofre indisponível.');
    return result;
  };
  V3Backend.saveAccountProfile = async function (values) {
    if (!client || !user) throw new Error('Entre na sua conta para editar o perfil.');
    const name = String(values.name || '').trim().slice(0, 40);
    if (!name) throw new Error('Escreva seu nome.');
    const record = { user_id: user.id, nome: name, moeda: values.currency, pais: values.country,
      fuso: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo' };
    const { error } = await bounded(client.from('profiles').upsert(record, { onConflict: 'user_id' }));
    if (error) throw error;
    accountProfile = record;
    user.name = name;
    Store.setOwnerName(name);
    return record;
  };
  V3Backend.signOut = async function () {
    if (!client) throw new Error('Sessão indisponível.');
    const { error } = await bounded(client.auth.signOut());
    if (error) throw error;
    global.location.replace(loginUrl);
  };
  V3Backend.deleteAccount = async function (confirmation) {
    if (!client || !user || String(confirmation || '').toLowerCase() !== user.email.toLowerCase())
      throw new Error('O e-mail não confere.');
    const config = global.SupabaseConfig || {};
    const base = String(config.url || '').replace(/\/+$/, '');
    const publicKey = String(config.publishableKey || config.anonKey || '');
    const { data, error } = await bounded(client.auth.getSession());
    if (error || !data?.session?.access_token || !/^https:\/\//.test(base) || !publicKey)
      throw new Error('Sua sessão expirou. Nada foi apagado.');
    const response = await fetch(base + '/functions/v1/oaze-conta', {
      method: 'POST', headers: { 'content-type': 'application/json', apikey: publicKey,
        authorization: 'Bearer ' + data.session.access_token },
      body: JSON.stringify({ acao: 'excluir', confirmacao: confirmation })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok !== true) throw new Error(result.mensagem || 'O servidor não confirmou a exclusão. Confira sua conta antes de tentar novamente.');
    await client.auth.signOut().catch(() => {});
    global.location.replace('/');
  };
  V3Backend.cocoSettings = async function () {
    if (!client || !user) throw new Error('Entre na sua conta para usar a Coco.');
    const { data, error } = await bounded(client.from('coco_settings')
      .select('consented_at,analysis_consented_at,revoked_at,learning_paused').eq('user_id', user.id).maybeSingle());
    if (error) throw error;
    return data || { consented_at: null, analysis_consented_at: null, revoked_at: null, learning_paused: false };
  };
  V3Backend.cocoConsent = async function (accepted) {
    if (!client || !user) throw new Error('Entre na sua conta para configurar a Coco.');
    const now = new Date().toISOString();
    const current = await V3Backend.cocoSettings();
    const { error } = await bounded(client.from('coco_settings').upsert({
      user_id: user.id,
      consented_at: accepted ? now : current.consented_at,
      analysis_consented_at: accepted ? now : current.analysis_consented_at,
      revoked_at: accepted ? null : now,
      learning_paused: accepted ? !!current.learning_paused : true,
      updated_at: now
    }, { onConflict: 'user_id' }));
    if (error) throw error;
  };
  V3Backend.cocoPauseLearning = async function (paused) {
    const settings = await V3Backend.cocoSettings();
    if (!settings.consented_at || settings.revoked_at) throw new Error('Autorize a Coco antes de configurar a memória.');
    const { error } = await bounded(client.from('coco_settings')
      .update({ learning_paused: !!paused, updated_at: new Date().toISOString() }).eq('user_id', user.id));
    if (error) throw error;
  };
  V3Backend.cocoMemories = async function (profileId) {
    if (!client || !user) throw new Error('Entre na sua conta para consultar a memória.');
    const { data, error } = await bounded(client.from('coco_memories')
      .select('id,kind,label,value,source,created_at').eq('user_id', user.id)
      .eq('profile_id', profileId).order('created_at', { ascending: false }).limit(50));
    if (error) throw error;
    return data || [];
  };
  V3Backend.cocoRemember = async function (profileId, memory) {
    if (!client || !user) throw new Error('Entre na sua conta para salvar a memória.');
    const settings = await V3Backend.cocoSettings();
    if (!settings.consented_at || settings.revoked_at || settings.learning_paused) throw new Error('O aprendizado da Coco está desligado.');
    const { data, error } = await bounded(client.from('coco_memories').insert({
      user_id: user.id, profile_id: profileId,
      kind: memory.kind, label: memory.label, value: memory.value,
      source: 'confirmado_pelo_usuario'
    }).select('id,kind,label,value,source,created_at').single());
    if (error) throw error;
    return data;
  };
  V3Backend.cocoForget = async function (id) {
    if (!client || !user) throw new Error('Entre na sua conta para apagar a memória.');
    const { error } = await bounded(client.from('coco_memories').delete()
      .eq('id', id).eq('user_id', user.id));
    if (error) throw error;
  };
  V3Backend.cocoAnalyses = async function (profileId) {
    if (!client || !user) throw new Error('Entre na sua conta para consultar as análises.');
    const { data, error } = await bounded(client.from('coco_analyses')
      .select('period,summary,forgotten_hash,updated_at').eq('user_id', user.id).eq('profile_id', profileId)
      .order('period', { ascending: false }).limit(12));
    if (error) throw error;
    return data || [];
  };
  V3Backend.cocoSaveAnalysis = async function (profileId, period, summary) {
    if (!client || !user) throw new Error('Entre na sua conta para guardar a análise.');
    const settings = await V3Backend.cocoSettings();
    if (!settings.consented_at || !settings.analysis_consented_at || settings.revoked_at || settings.learning_paused)
      throw new Error('A memória da Coco está desligada.');
    const { error } = await bounded(client.from('coco_analyses').upsert({
      user_id: user.id, profile_id: profileId, period, summary, forgotten_hash: null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,profile_id,period' }));
    if (error) throw error;
  };
  V3Backend.cocoForgetAnalysis = async function (profileId, period, hash) {
    if (!client || !user) throw new Error('Entre na sua conta para apagar a análise.');
    const { error } = await bounded(client.from('coco_analyses').update({
      summary: null, forgotten_hash: hash, updated_at: new Date().toISOString()
    })
      .eq('user_id', user.id).eq('profile_id', profileId).eq('period', period));
    if (error) throw error;
  };
  V3Backend.cocoReadMedia = async function (file, profileId) {
    if (!client || !user) throw new Error('Entre na sua conta para enviar mídia.');
    const config = global.SupabaseConfig || {};
    const base = String(config.url || '').replace(/\/+$/, '');
    const publicKey = String(config.publishableKey || config.anonKey || '');
    const { data, error } = await bounded(client.auth.getSession());
    if (error || !data?.session?.access_token || !/^https:\/\//.test(base) || !publicKey) throw new Error('Sessão ou conexão indisponível.');
    const body = new FormData();
    body.append('file', file, file.name || 'captura');
    body.append('profile_id', profileId);
    body.append('media_consent', 'true');
    const controller = new AbortController();
    const timer = global.setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(base + '/functions/v1/oaze-coco-media', {
        method: 'POST', signal: controller.signal,
        headers: { apikey: publicKey, authorization: 'Bearer ' + data.session.access_token },
        body
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.erro) throw new Error(result.mensagem || 'Não consegui ler o arquivo.');
      return result;
    } finally { global.clearTimeout(timer); }
  };
  V3Backend.cocoSpeak = async function (text) {
    if (!client || !user) throw new Error('Entre na sua conta para ouvir a Coco.');
    const config = global.SupabaseConfig || {};
    const base = String(config.url || '').replace(/\/+$/, '');
    const publicKey = String(config.publishableKey || config.anonKey || '');
    const { data, error } = await bounded(client.auth.getSession());
    if (error || !data?.session?.access_token || !/^https:\/\//.test(base) || !publicKey) throw new Error('Sessão ou conexão indisponível.');
    const controller = new AbortController();
    const timer = global.setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(base + '/functions/v1/oaze-coco-voz', {
        method: 'POST', signal: controller.signal,
        headers: { apikey: publicKey, authorization: 'Bearer ' + data.session.access_token,
          'content-type': 'application/json' },
        body: JSON.stringify({ text: String(text || '').slice(0, 1200) })
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.mensagem || 'Não consegui reproduzir a resposta.');
      }
      return response.blob();
    } finally { global.clearTimeout(timer); }
  };
  V3Backend.cocoRealtimeToken = async function () {
    if (!client || !user) throw new Error('Entre na sua conta para falar com a Coco.');
    const config = global.SupabaseConfig || {};
    const base = String(config.url || '').replace(/\/+$/, '');
    const publicKey = String(config.publishableKey || config.anonKey || '');
    const { data, error } = await bounded(client.auth.getSession());
    if (error || !data?.session?.access_token || !/^https:\/\//.test(base) || !publicKey)
      throw new Error('Sua sessão expirou. Entre novamente.');
    const response = await bounded(fetch(base + '/functions/v1/oaze-coco-realtime', {
      method: 'POST', cache: 'no-store',
      headers: { apikey: publicKey, authorization: 'Bearer ' + data.session.access_token,
        'content-type': 'application/json' }, body: '{}'
    }));
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.value) throw new Error(result.mensagem || 'Voz em tempo real indisponível.');
    return result.value;
  };
  async function requirePrivacyAcceptance() {
    const { data, error } = await bounded(client.from('privacy_acceptances')
      .select('policy_version').eq('user_id', user.id)
      .eq('policy_version', '2026-10-01').maybeSingle());
    if (error) throw error;
    if (data) return;
    const view = document.getElementById('v3-view');
    view.innerHTML = '<section class="v3-panel v3-consent"><span class="v3-label">ANTES DE ENTRAR</span><h2>Seus dados, suas regras.</h2><p>Leia a Política de privacidade e os Termos de uso antes de continuar. Sem o aceite, o aplicativo não carrega seus dados financeiros.</p><p><a href="/privacidade" target="_blank" rel="noopener noreferrer">Política de privacidade</a> · <a href="/termos" target="_blank" rel="noopener noreferrer">Termos de uso</a></p><form id="v3-privacy-form"><label><input type="checkbox" name="accept" required> Li e aceito a Política de privacidade (versão 01/10/2026).</label><button type="submit" class="v3-primary">Aceitar e entrar</button><button type="button" class="v3-secondary" id="v3-privacy-decline">Não aceitar</button><p role="alert" id="v3-privacy-error" hidden></p></form></section>';
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
            policy_version: '2026-10-01',
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

  async function requirePinSetup() {
    const status = await V3Backend.vault({ action: 'status' });
    if (status.configured) return;
    const view = document.getElementById('v3-view');
    view.innerHTML = '<section class="v3-panel v3-consent"><span class="v3-label">PROTEÇÃO EXTRA</span><h2>Crie seu PIN de seis dígitos.</h2><p>Você já confirmou o e-mail. Agora escolha o PIN que desbloqueia os dados sensíveis da sua conta. Evite datas, sequências e números iguais. O PIN sozinho não dá acesso ao OAZE.</p><form id="v3-pin-first-form" class="v3-form"><label>PIN<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="off" required></label><label>CONFIRME O PIN<input name="confirm" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="off" required></label><button type="submit" class="v3-primary">Criar PIN e continuar</button><p role="alert" id="v3-pin-first-error" hidden></p></form></section>';
    await new Promise((resolve) => {
      document.getElementById('v3-pin-first-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const pin = String(form.elements.pin.value || '');
        const status = document.getElementById('v3-pin-first-error');
        if (pin !== form.elements.confirm.value) {
          status.textContent = 'Os PINs não são iguais.'; status.hidden = false; return;
        }
        const button = form.querySelector('[type="submit"]');
        button.disabled = true;
        try {
          await V3Backend.vault({ action: 'setup', pin });
          form.elements.pin.value = '';
          form.elements.confirm.value = '';
          resolve();
        } catch (error) {
          status.textContent = error.message || 'Não foi possível criar o PIN.';
          status.hidden = false;
          form.elements.pin.value = '';
          form.elements.confirm.value = '';
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
    if (activeShareId) throw new Error('Este perfil compartilhado é somente leitura.');
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
    if (activeShareId) throw new Error('Volte a um perfil seu antes de criar outro.');
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

  V3Backend.renameProfile = async function (id, name) {
    if (activeShareId || saving) throw new Error('Espere a gravação anterior terminar.');
    const current = Store.state().profiles.find((p) => p.id === id);
    if (!current) throw new Error('Perfil não encontrado.');
    const clean = String(name || '').trim();
    if (!clean || clean.length > 60) throw new Error('Nome inválido.');
    saving = true;
    try {
      const payload = JSON.parse(JSON.stringify({ ...current, name: clean }));
      const { data, error } = await bounded(client.rpc('v3_salvar_perfil', {
        p_profile: payload, p_expected_updated_at: revisions[id] || 0
      }));
      if (error) throw error;
      const saved = Store.normalizeProfile(data);
      const index = Store.state().profiles.findIndex((p) => p.id === id);
      if (index >= 0) Store.state().profiles[index] = saved;
      revisions[id] = stamp(saved);
      Store.commit('sync-apply');
      return saved;
    } finally {
      saving = false;
      if (refreshPending) { refreshPending = false; await V3Backend.reload().catch((error) => console.error('V3/atualização remota:', error)); }
    }
  };

  V3Backend.deleteProfile = async function (id) {
    if (saving || activeShareId) throw new Error('Não é possível excluir este perfil agora.');
    if (Store.state().profiles.length <= 1) throw new Error('Mantenha pelo menos um perfil na conta.');
    const found = Store.state().profiles.find((p) => p.id === id);
    if (!found) throw new Error('Perfil não encontrado.');
    saving = true;
    try {
      const { data, error } = await bounded(client.rpc('v3_excluir_perfil', {
        p_id: id, p_expected_updated_at: revisions[id] || 0
      }));
      if (error) throw error;
      if (!data) throw new Error('Não foi possível excluir o perfil.');
      delete revisions[id];
      Store.deleteProfile(id);
    } finally { saving = false; }
    await V3Backend.reload().catch((error) => console.error('V3/atualização remota:', error));
    return true;
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
      name: authUser.user_metadata?.full_name || authUser.user_metadata?.name || '',
      photo: authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture || ''
    };
    // Nenhum documento financeiro é lido antes do aceite obrigatório.
    await requirePrivacyAcceptance();
    if (authUser.user_metadata?.oaze_pin_required === true) await requirePinSetup();
    const { data: profileRow, error: profileError } = await bounded(client.from('profiles')
      .select('nome,moeda,pais,fuso').eq('user_id', user.id).maybeSingle());
    if (profileError) throw profileError;
    accountProfile = profileRow || {};
    if (accountProfile.nome) user.name = accountProfile.nome;
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
