'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..', '..');
const backend = fs.readFileSync(path.join(root, 'assets/app/live-backend.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261024153732_comprovantes_privados.sql'), 'utf8');

assert.match(migration, /'oaze-receipts'.*false, 5242880/s);
assert.match(migration, /for select to authenticated[\s\S]*storage\.foldername\(name\)/i);
assert.match(migration, /for insert to authenticated[\s\S]*storage\.foldername\(name\)/i);
assert.match(migration, /for delete to authenticated[\s\S]*storage\.foldername\(name\)/i);

(async () => {
  const receiptA = 'user-1/a/tx-1/prova.jpg';
  const receiptB = 'user-1/b/tx-2/prova.pdf';
  let server = {
    a: { id: 'a', name: 'Pessoal', updatedAt: 7, transactions: [{ id: 'tx-1', receiptPath: receiptA }] },
    b: { id: 'b', name: 'Trabalho', updatedAt: 8, transactions: [{ id: 'tx-2', receiptPath: receiptB }] }
  };
  const local = { profiles: [], activeProfileId: 'a' };
  let override = null;
  let failSave = false;
  let failCleanupSave = false;
  let failRemove = false;
  let removeGate = null;
  let saveCalls = 0;
  const removed = [];
  const uploaded = [];
  const Store = {
    state: () => local,
    profile: () => override || local.profiles.find((profile) => profile.id === local.activeProfileId),
    setProfileOverride(profile) { override = profile || null; },
    normalizeProfile: (profile) => JSON.parse(JSON.stringify(profile)),
    loadRemoteMap(map, _name, active) {
      local.profiles = Object.values(map).map((profile) => JSON.parse(JSON.stringify(profile)));
      local.activeProfileId = map[active] ? active : local.profiles[0]?.id;
    },
    deleteProfile(id) { local.profiles = local.profiles.filter((profile) => profile.id !== id); },
    commit() {}
  };
  const storage = {
    from(bucket) {
      assert.equal(bucket, 'oaze-receipts');
      return {
        async upload(objectPath, file, options) {
          uploaded.push({ objectPath, file, options });
          return { error: null };
        },
        async remove(paths) {
          removed.push(paths[0]);
          if (removeGate) await removeGate;
          return { error: failRemove ? new Error('storage offline') : null };
        },
        async createSignedUrl(objectPath, seconds) {
          assert.equal(objectPath, receiptA);
          assert.equal(seconds, 60);
          return { data: { signedUrl: 'https://example.test/signed' }, error: null };
        }
      };
    }
  };
  const client = {
    storage,
    auth: {
      async getUser() { return { data: { user: { id: 'user-1', email: 'u@example.test', user_metadata: {} } } }; },
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
        saveCalls++;
        if (failSave) return { error: { code: '500', message: 'rpc offline' } };
        if (failCleanupSave && !args.p_profile.pendingReceiptDeletes?.length
          && server[args.p_profile.id]?.pendingReceiptDeletes?.length)
          return { error: { code: '500', message: 'cleanup rpc offline' } };
        const saved = { ...args.p_profile, updatedAt: (server[args.p_profile.id]?.updatedAt || 0) + 1 };
        server[saved.id] = saved;
        return { data: saved };
      }
      assert.equal(name, 'v3_excluir_perfil');
      delete server[args.p_id];
      return { data: true };
    }
  };
  const context = {
    console: { ...console, warn() {} }, Store, setTimeout, clearTimeout,
    crypto: { randomUUID: () => 'file-id' },
    SiteAuth: { cliente: () => client, quemEsta: async () => ({ id: 'user-1', email: 'u@example.test' }) },
    document: { addEventListener() {} },
    location: { pathname: '/app', search: '', replace() {} }
  };
  context.window = context;
  vm.runInNewContext(backend, context, { filename: 'live-backend.js' });
  const V3 = context.V3Backend;
  assert.equal(await V3.start(), true);

  failRemove = true;
  const first = await V3.mutate(() => { Store.profile().transactions = []; });
  assert.equal(server.a.transactions.length, 0, 'a gravação financeira termina mesmo se Storage falhar');
  assert.equal(server.a.pendingReceiptDeletes[0], receiptA, 'a fila fica persistida no perfil remoto');
  assert.equal(first.receiptCleanupPending, 1, 'a UI recebe aviso explícito de exclusão pendente');
  assert.equal(Object.getOwnPropertyDescriptor(first, 'receiptCleanupPending').configurable, true,
    'o indicador pode mudar em uma mutação posterior sem quebrar a gravação');
  assert.equal(V3.receiptCleanupStatus().pending, 1);
  assert.deepEqual(removed, [receiptA]);
  // Um outro fluxo pode recolocar a referência antes da tentativa seguinte.
  server.a.transactions = [{ id: 'tx-1', receiptPath: receiptA }];
  await V3.reload();
  failRemove = false;
  const retried = await V3.retryReceiptCleanup();
  assert.equal(retried.removed, 0, 'não apaga comprovante novamente referenciado');
  assert.equal(retried.pending, 0);
  assert.equal(removed.length, 1);
  const second = await V3.mutate(() => { Store.profile().transactions = []; });
  assert.equal(removed.length, 2, 'nova exclusão limpa o arquivo depois da gravação');
  assert.equal(second.receiptCleanupPending, 0, 'segunda mutação atualiza o indicador após limpar a fila');

  const nextReceipt = 'user-1/a/tx-3/prova.png';
  server.a.transactions.push({ id: 'tx-3', receiptPath: nextReceipt });
  await V3.reload();
  failSave = true;
  await assert.rejects(V3.mutate(() => { Store.profile().transactions = []; }), (error) => error.code === '500');
  assert.equal(Store.profile().transactions[0].receiptPath, nextReceipt, 'falha de RPC restaura o anexo referenciado');
  assert.equal(removed.length, 2, 'falha de RPC não exclui o arquivo do Storage');
  failSave = false;

  const retryReceipt = 'user-1/a/tx-7/prova.webp';
  server.a.transactions.push({ id: 'tx-7', receiptPath: retryReceipt });
  await V3.reload();
  failCleanupSave = true;
  const withFailedAck = await V3.mutate(() => { Store.profile().transactions = []; });
  assert.equal(withFailedAck.receiptCleanupPending, 2, 'confirmação da fila falha sem negar o salvamento');
  assert.ok(server.a.pendingReceiptDeletes.includes(retryReceipt), 'fila continua no servidor após segundo RPC falhar');
  failCleanupSave = false;
  assert.equal(await V3.start(), true, 'nova abertura lê o perfil remoto e retenta automaticamente');
  assert.equal(V3.receiptCleanupStatus().pending, 0, 'tentativa posterior confirma fila persistida');
  assert.equal(server.a.pendingReceiptDeletes.length, 0);

  const foreign = 'another-user/shared/tx-4/prova.pdf';
  const shared = { id: 'shared', updatedAt: 3, transactions: [{ id: 'tx-4', receiptPath: foreign }] };
  V3.setActiveShare('shared-1', shared, 'edit');
  const beforeBlocked = saveCalls;
  await assert.rejects(V3.mutate(() => { Store.profile().transactions = []; }), /titular/);
  assert.equal(saveCalls, beforeBlocked, 'não remove referência que o convidado não pode limpar');
  V3.setActiveShare(null);

  await assert.rejects(V3.deleteProfile('b'), /Remova os comprovantes/);
  local.activeProfileId = 'b';
  let unblock;
  removeGate = new Promise((resolve) => { unblock = resolve; });
  let done = false;
  const deletingReceipt = V3.mutate(() => { Store.profile().transactions = []; }).then(() => { done = true; });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(done, false, 'mutação aguarda resposta do Storage');
  unblock();
  await deletingReceipt;
  local.activeProfileId = 'a';
  await V3.deleteProfile('b');
  assert.equal(server.b, undefined);
  assert.ok(removed.includes(receiptB));
  assert.equal(V3.receiptCleanupStatus().pending, 0);

  const file = { type: 'application/pdf', size: 100 };
  const { path: uploadedPath } = await V3.uploadReceipt(file, 'tx-5');
  assert.equal(uploadedPath, 'user-1/a/tx-5/file-id.pdf');
  assert.equal(uploaded[0].options.upsert, false);
  assert.equal(await V3.receiptUrl(receiptA), 'https://example.test/signed');
  await assert.rejects(V3.uploadReceipt({ type: 'text/html', size: 100 }, 'tx-6'), /JPG, PNG, WebP ou PDF/);
  await assert.rejects(V3.receiptUrl('another-user/a/tx-1/prova.jpg'), /indisponível/);
  console.log('OK — comprovantes privados aguardam cleanup e preservam gravação e RLS.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
