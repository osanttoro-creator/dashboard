'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const sql = read('supabase/migrations/20261007001746_perfis_compartilhados.sql');
const roles = read('supabase/migrations/20261008003700_perfis_compartilhados_permissoes.sql');
const edge = read('supabase/functions/oaze-perfis/index.ts');
const app = read('preview-v3/app.js');
const backend = read('preview-v3/live-backend.js');
const store = read('assets/js/store.js');

assert.match(sql, /enable row level security/i);
assert.match(sql, /revoke all on public\.oaze_profile_shares from public, anon, authenticated/i);
assert.match(sql, /security invoker/i);
assert.match(sql, /for update/i);
assert.match(sql, /v3_excluir_perfil/);
assert.match(roles, /permission in \('read', 'edit'\)/);
assert.match(roles, /char_length\(label\) <= 60/);
assert.match(roles, /security definer/i);
assert.match(roles, /s\.recipient_id = v_user/);
assert.match(roles, /v_share\.permission <> 'edit'/);
assert.match(roles, /v_share\.profile_id/);
assert.match(roles, /for update/i);
assert.match(roles, /p_expected_updated_at/);
assert.match(roles, /revoke all on function public\.v3_salvar_perfil_compartilhado/);
assert.match(edge, /auth\.auth\.getUser\(\)/);
assert.match(edge, /email_confirmed_at/);
assert.match(edge, /sha256\(token\)/);
assert.match(edge, /recipient_id: user\.id/);
assert.match(edge, /\.eq\('recipient_id', user\.id\)/);
assert.match(edge, /readOnly: share\.permission !== 'edit'/);
assert.match(edge, /7 \* 86400000/);
assert.match(edge, /action === 'set_permission'/);
assert.match(edge, /label\.length > 60/);
assert.match(edge, /\.eq\('owner_id', user\.id\)/);
assert.match(edge, /permission: share\.permission/);
assert.match(app, /data-action="shared-permission"/);
assert.match(app, /id="v3-share-permission"/);
assert.match(app, /function sharedCanEdit\(\)/);
assert.match(app, /if\(state\.sharedId && formId!=='v3-form-period'/);
assert.match(backend, /if \(activeShareId && activeSharePermission !== 'edit'\)/);
assert.match(backend, /v3_salvar_perfil_compartilhado/);
assert.match(store, /Store\.profile = \(\) => profileOverride \|\|/);
assert.match(store, /Store\.setProfileOverride = \(profile\)/);

(async () => {
  let server = {
    a: { id: 'a', name: 'Casa', updatedAt: 7 },
    b: { id: 'b', name: 'Trabalho', updatedAt: 9 }
  };
  const local = { profiles: [], activeProfileId: 'a' };
  let override = null;
  const Store = {
    state: () => local,
    profile: () => override || local.profiles.find((p) => p.id === local.activeProfileId),
    setProfileOverride: (profile) => { override = profile || null; },
    normalizeProfile: (p) => ({ ...p }),
    loadRemoteMap(map, _owner, active) {
      local.profiles = Object.values(map).map((p) => ({ ...p }));
      local.activeProfileId = map[active] ? active : local.profiles[0]?.id;
    },
    commit() {},
    deleteProfile(id) { local.profiles = local.profiles.filter((p) => p.id !== id); return true; }
  };
  let shared = { id: 'couple', name: 'Casal', updatedAt: 12, accounts: [] };
  let sharedError = null;
  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1', email: 'a@example.test', user_metadata: {} } } }),
      onAuthStateChange() {}
    },
    from(table) {
      if (table === 'privacy_acceptances') return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { policy_version: '2026-10-01' } }) }) }) }) };
      if (table === 'profiles') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: {} }) }) }) };
      assert.equal(table, 'dados');
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { profiles: server, removidos: {} } }) }) }) };
    },
    channel() { return { on() { return this; }, subscribe() {} }; },
    async rpc(name, args) {
      if (name === 'v3_salvar_perfil') {
        assert.equal(args.p_profile.id, 'b');
        assert.equal(args.p_expected_updated_at, 9);
        server.b = { ...args.p_profile, updatedAt: 10 };
        return { data: server.b };
      }
      if (name === 'v3_salvar_perfil_compartilhado') {
        assert.equal(args.p_share_id, 'shared-1');
        assert.ok(args.p_expected_updated_at >= 12);
        assert.equal(args.p_profile.id, 'couple');
        if (sharedError) return { error: { code: sharedError, message: 'denied' } };
        shared = { ...args.p_profile, updatedAt: 13 };
        return { data: shared };
      }
      assert.equal(name, 'v3_excluir_perfil');
      assert.equal(args.p_id, 'b');
      assert.equal(args.p_expected_updated_at, 10);
      delete server.b;
      return { data: true };
    }
  };
  const ctx = { console, Store, setTimeout, clearTimeout,
    SiteAuth: { cliente: () => client, quemEsta: async () => ({ id: 'user-1', email: 'a@example.test' }) },
    document: { addEventListener() {} },
    location: { pathname: '/app', search: '', replace() {} } };
  ctx.window = ctx;
  vm.runInNewContext(backend, ctx, { filename: 'live-backend.js' });
  const V3 = ctx.V3Backend;
  assert.equal(await V3.start(), true);
  assert.equal(Store.profile().id, 'a');
  await V3.renameProfile('b', 'Empresa');
  assert.equal(server.b.name, 'Empresa');
  assert.equal(Store.profile().id, 'a', 'editar outro perfil não muda o perfil ativo');
  V3.setActiveShare('shared-1', shared, 'read');
  await assert.rejects(V3.mutate(() => shared.accounts.push({ id: 'blocked' })), /somente leitura/);
  assert.equal(shared.accounts.length, 0);
  V3.setActiveShare('shared-1', shared, 'edit');
  await V3.mutate(() => Store.profile().accounts.push({ id: 'joint' }));
  assert.equal(shared.accounts[0].id, 'joint');
  assert.equal(local.profiles.length, 2, 'o perfil convidado não entra nos perfis próprios');
  sharedError = '40001';
  V3.share = async () => ({ profile: { ...shared, updatedAt: 14, accounts: [{ id: 'remote' }] }, permission: 'edit' });
  await assert.rejects(V3.mutate(() => Store.profile().accounts.push({ id: 'stale' })), /outro aparelho/);
  assert.equal(JSON.stringify(override.accounts), '[{"id":"remote"}]', 'conflito troca o rascunho pela versão remota');
  sharedError = '42501';
  await assert.rejects(V3.mutate(() => Store.profile().accounts.push({ id: 'denied' })), (error) => error.code === '42501');
  assert.equal(V3.activeSharePermission(), 'read', 'mudança de permissão bloqueia a próxima gravação');
  assert.equal(JSON.stringify(override.accounts), '[{"id":"remote"}]', 'gravação negada não deixa mudança otimista');
  await assert.rejects(V3.renameProfile('b', 'Tentativa'), /gravação anterior|perfil seu|leitura/);
  await assert.rejects(V3.deleteProfile('b'), /não é possível|Não é possível/);
  V3.setActiveShare(null);
  await V3.deleteProfile('b');
  assert.equal(server.b, undefined);
  assert.deepEqual(local.profiles.map((p) => p.id), ['a']);
  await assert.rejects(V3.deleteProfile('a'), /pelo menos um perfil/);
  console.log('OK — perfil compartilhado isolado, leitura ou edição e exclusão protegida.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
