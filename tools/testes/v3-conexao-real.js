'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('app-v3.html');
const script = read('preview-v3/live-backend.js');
const migration = read('supabase/migrations/20260930142133_v3_salvar_perfil_com_revisao.sql');
const packageScript = read('deploy/hostinger/montar-pacote.ps1');
const workflow = read('.github/workflows/deploy-hostinger.yml');
assert.match(html, /data-oaze-mode="live"/);
assert.match(packageScript, /'app\.html', 'app-v3\.html'/);
assert.match(workflow, /checar \/app-v3\.html\s+200/);
assert.match(html, /<script src="\/preview-v3\/live-backend\.js"><\/script>/);
assert.match(html, /<script src="\/assets\/js\/site-auth\.js"><\/script>/);
assert.doesNotMatch(html, /dados de exemplo/);
assert.doesNotMatch(script, /Store\.load\(|localStorage\.getItem\('financas\.v1'/);
assert.match(script, /SiteAuth\.quemEsta\(\)/);
assert.match(script, /\.from\('privacy_acceptances'\)/);
assert.match(script, /\.from\('dados'\)/);
assert.match(script, /\.rpc\('v3_salvar_perfil'/);
assert.match(migration, /security invoker/i);
assert.match(migration, /for update/i);
assert.match(migration, /v_current_stamp <> p_expected_updated_at/);
assert.match(migration, /grant execute on function public\.v3_salvar_perfil\(jsonb, bigint\) to authenticated/i);

(async () => {
  let server = { p1: { id: 'p1', name: 'Servidor', updatedAt: 7 } };
  let conflict = false;
  let rpcCalls = 0;
  let localCacheReads = 0;
  let accepted = true;
  let dataReads = 0;
  const redirects = [];
  let submitAcceptance;
  const privacyView = { innerHTML: '' };
  const privacyButton = { disabled: false };
  const privacyStatus = { textContent: '', hidden: true };
  const privacyForm = {
    elements: { accept: { checked: true } },
    querySelector: () => privacyButton,
    addEventListener(_event, callback) { submitAcceptance = callback; }
  };
  const state = { profiles: [], activeProfileId: null };
  const Store = {
    state: () => state,
    profile: () => state.profiles.find((p) => p.id === state.activeProfileId),
    normalizeProfile: (p) => ({ ...p }),
    loadRemoteMap(map, _owner, preferred) {
      state.profiles = Object.values(map).map((p) => ({ ...p }));
      state.activeProfileId = preferred && map[preferred] ? preferred : state.profiles[0]?.id;
    },
    commit(reason) { if (reason !== 'sync-apply') this.profile().updatedAt = Date.now(); }
  };
  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1', email: 'u@example.test', user_metadata: {} } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
    },
    from(name) {
      if (name === 'privacy_acceptances') return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: accepted ? { policy_version: '2026-09-15' } : null }) }) }) }),
        insert: async (row) => { assert.equal(row.source, 'app_bloqueio'); accepted = true; return { error: null }; }
      };
      assert.equal(name, 'dados');
      dataReads++;
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { profiles: { ...server }, removidos: {} } }) }) }) };
    },
    channel() { return { on() { return this; }, subscribe() { return this; } }; },
    async rpc(name, args) {
      rpcCalls++;
      assert.equal(name, 'v3_salvar_perfil');
      assert.equal(args.p_expected_updated_at, rpcCalls === 1 ? 7 : 8);
      if (conflict) return { error: { code: '40001', message: 'perfil_alterado_em_outro_aparelho' } };
      const saved = { ...args.p_profile, updatedAt: 8 };
      server = { p1: saved };
      return { data: saved };
    }
  };
  const context = {
    console, Store, setTimeout, clearTimeout,
    SiteAuth: { cliente: () => client, quemEsta: async () => ({ id: 'user-1', email: 'u@example.test' }) },
    document: { addEventListener() {}, getElementById(id) {
      return { 'v3-view': privacyView, 'v3-privacy-form': privacyForm,
        'v3-privacy-decline': { addEventListener() {} }, 'v3-privacy-error': privacyStatus }[id];
    } },
    location: { pathname: '/app', replace(url) { redirects.push(url); } },
    get localStorage() { localCacheReads++; throw new Error('Cache de outra conta'); }
  };
  context.window = context;
  vm.runInNewContext(script, context, { filename: 'live-backend.js' });
  assert.equal(await context.V3Backend.start(), true);
  assert.equal(Store.profile().name, 'Servidor');
  assert.equal(localCacheReads, 0);

  await context.V3Backend.mutate(() => { Store.profile().name = 'Minha edição'; Store.commit('profile'); });
  assert.equal(server.p1.name, 'Minha edição');
  assert.equal(Store.profile().updatedAt, 8);

  server = { p1: { id: 'p1', name: 'Outro aparelho', updatedAt: 9 } };
  conflict = true;
  await assert.rejects(
    context.V3Backend.mutate(() => { Store.profile().name = 'Edição antiga'; Store.commit('profile'); }),
    /mudou em outro aparelho/
  );
  assert.equal(Store.profile().name, 'Outro aparelho');
  assert.equal(localCacheReads, 0);
  accepted = false;
  const readsBeforeConsentGate = dataReads;
  const waiting = context.V3Backend.start();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(privacyView.innerHTML, /Li e aceito a Política de privacidade/);
  assert.equal(dataReads, readsBeforeConsentGate);
  await submitAcceptance({ preventDefault() {}, currentTarget: privacyForm });
  assert.equal(await waiting, true);
  assert.equal(dataReads, readsBeforeConsentGate + 1);
  assert.equal(redirects.length, 0);
})().catch((error) => { console.error(error); process.exitCode = 1; });
