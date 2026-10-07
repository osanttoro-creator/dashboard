'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const sql = read('supabase/migrations/20261007001746_perfis_compartilhados.sql');
const edge = read('supabase/functions/oaze-perfis/index.ts');
const app = read('preview-v3/app.js');
const backend = read('preview-v3/live-backend.js');

assert.match(sql, /enable row level security/i);
assert.match(sql, /revoke all on public\.oaze_profile_shares from public, anon, authenticated/i);
assert.match(sql, /security invoker/i);
assert.match(sql, /for update/i);
assert.match(sql, /v3_excluir_perfil/);
assert.match(edge, /auth\.auth\.getUser\(\)/);
assert.match(edge, /email_confirmed_at/);
assert.match(edge, /sha256\(token\)/);
assert.match(edge, /recipient_id: user\.id/);
assert.match(edge, /\.eq\('recipient_id', user\.id\)/);
assert.match(edge, /readOnly: true/);
assert.match(edge, /7 \* 86400000/);
assert.match(app, /state\.sharedId \? '<div class="v3-shared-banner"/);
assert.match(app, /if\(state\.sharedId && formId!=='v3-form-period'\)/);
assert.match(backend, /if \(activeShareId\) throw new Error\('Este perfil compartilhado é somente leitura/);

(async () => {
  let server = {
    a: { id: 'a', name: 'Casa', updatedAt: 7 },
    b: { id: 'b', name: 'Trabalho', updatedAt: 9 }
  };
  const local = { profiles: [], activeProfileId: 'a' };
  const Store = {
    state: () => local,
    profile: () => local.profiles.find((p) => p.id === local.activeProfileId),
    normalizeProfile: (p) => ({ ...p }),
    loadRemoteMap(map, _owner, active) {
      local.profiles = Object.values(map).map((p) => ({ ...p }));
      local.activeProfileId = map[active] ? active : local.profiles[0]?.id;
    },
    commit() {},
    deleteProfile(id) { local.profiles = local.profiles.filter((p) => p.id !== id); return true; }
  };
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
  V3.setActiveShare('shared-1');
  await assert.rejects(V3.renameProfile('b', 'Tentativa'), /gravação anterior|perfil seu|leitura/);
  await assert.rejects(V3.deleteProfile('b'), /não é possível|Não é possível/);
  V3.setActiveShare(null);
  await V3.deleteProfile('b');
  assert.equal(server.b, undefined);
  assert.deepEqual(local.profiles.map((p) => p.id), ['a']);
  await assert.rejects(V3.deleteProfile('a'), /pelo menos um perfil/);
  console.log('OK — perfis editáveis, exclusão protegida e compartilhado somente leitura.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
