'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const { webcrypto } = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '../../supabase/functions/oaze-conta/index.ts'), 'utf8');
const helpersSource = source.match(/\/\/ Início das rotinas de comprovantes testadas isoladamente\.([\s\S]*?)\/\/ Fim das rotinas de comprovantes testadas isoladamente\./)?.[1];
assert.ok(helpersSource, 'rotinas de comprovantes não encontradas');
const sandbox = {};
vm.runInNewContext(stripTypeScriptTypes(helpersSource) +
  '\nglobalThis.receiptHelpers = { listarLoteComprovantes, apagarComprovantes };', sandbox);
const { listarLoteComprovantes, apagarComprovantes } = sandbox.receiptHelpers;

const lockAt = source.indexOf(".from('account_deletion_locks')");
const cleanAt = source.indexOf('await apagarComprovantes(admin.storage, usuario.id)');
const deleteAt = source.indexOf('await admin.auth.admin.deleteUser(usuario.id)');
assert.ok(lockAt > 0 && cleanAt > lockAt && deleteAt > cleanAt,
  'trava, limpeza e exclusão do usuário precisam estar nesta ordem');
assert.match(source, /if \(lockError\)[\s\S]*?return json\([\s\S]*?503/);
assert.match(source, /catch \(e\) \{[\s\S]*?evento: 'comprovantes_falhou'[\s\S]*?return json/);
assert.doesNotMatch(source, /Nada foi apagado\./);

const own = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';

function fakeStorage(initialPaths, options = {}) {
  const objects = new Set(initialPaths);
  const listCalls = [];
  const removeCalls = [];
  let failed = false;
  return {
    objects, listCalls, removeCalls,
    from(bucket) {
      assert.equal(bucket, 'oaze-receipts');
      return {
        async list(prefix, args) {
          listCalls.push({ prefix, ...args });
          if (options.listError) return { data: null, error: new Error('list offline') };
          const entries = new Map();
          for (const objectPath of objects) {
            if (!objectPath.startsWith(prefix + '/')) continue;
            const remaining = objectPath.slice(prefix.length + 1);
            const name = remaining.split('/')[0];
            if (!name) continue;
            entries.set(name, { name, id: remaining.includes('/') ? null : objectPath });
          }
          const ordered = [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
          return { data: ordered.slice(args.offset, args.offset + args.limit), error: null };
        },
        async remove(paths) {
          removeCalls.push([...paths]);
          if (options.noProgress) return { data: [], error: null };
          if (options.failOnce && !failed) {
            failed = true;
            objects.delete(paths[0]);
            return { data: null, error: new Error('remove offline') };
          }
          paths.forEach((objectPath) => objects.delete(objectPath));
          return { data: paths.map((name) => ({ name })), error: null };
        }
      };
    }
  };
}

function accountHarness(options = {}) {
  const events = [];
  const storage = fakeStorage(options.paths || [], options.storageOptions);
  const userClient = { auth: { async getUser() {
    return { data: { user: { id: own, email: 'dono@example.test' } }, error: null };
  } } };
  const admin = {
    storage: {
      from(bucket) {
        const api = storage.from(bucket);
        return {
          list: async (...args) => { events.push('list'); return api.list(...args); },
          remove: async (...args) => { events.push('remove'); return api.remove(...args); }
        };
      }
    },
    from(table) {
      if (table === 'account_deletion_locks') return {
        async upsert(row) {
          events.push('lock');
          assert.equal(row.user_id, own);
          return { error: options.lockError ? new Error('lock offline') : null };
        }
      };
      const query = {
        select() { return this; },
        eq() { return this; },
        in() { return this; },
        async maybeSingle() { return { data: null, error: null }; },
        then(resolve, reject) {
          return Promise.resolve({ data: [], count: 0, error: null }).then(resolve, reject);
        }
      };
      return query;
    },
    auth: { admin: {
      async deleteUser(userId) {
        events.push('deleteUser');
        assert.equal(userId, own);
        if (options.throwDelete) throw new Error('auth timeout');
        return { error: options.deleteError ? { status: 500 } : null };
      },
      async getUserById(userId) {
        events.push('verifyUser');
        assert.equal(userId, own);
        return options.verify404
          ? { data: { user: null }, error: { status: 404, code: 'user_not_found' } }
          : { data: { user: { id: own } }, error: null };
      }
    } }
  };
  let handler = null;
  const env = {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    SUPABASE_ANON_KEY: 'anon-key',
    OAZE_ALLOWED_ORIGINS: 'https://oaze.site'
  };
  const sandbox = {
    Deno: { env: { get: (key) => env[key] || '' }, serve: (fn) => { handler = fn; } },
    Response, Request, crypto: webcrypto,
    createClient: (_url, key) => key === 'service-key' ? admin : userClient,
    reservarRateLimit: async () => ({ permitido: true }),
    corpoCabeNoLimite: () => true,
    stripe: async () => { throw new Error('não deveria cobrar'); },
    asaas: async () => { throw new Error('não deveria cobrar'); },
    StripeErro: class extends Error {},
    AsaasErro: class extends Error {},
    console: { error() {} }
  };
  vm.runInNewContext(stripTypeScriptTypes(source.replace(/^import [^\n]+\r?\n/gm, '')), sandbox);
  assert.equal(typeof handler, 'function');
  return {
    events, storage,
    async invoke() {
      const response = await handler(new Request('https://example.supabase.co/functions/v1/oaze-conta', {
        method: 'POST',
        headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
        body: JSON.stringify({ acao: 'excluir', confirmacao: 'dono@example.test' })
      }));
      return { status: response.status, body: await response.json() };
    }
  };
}

(async () => {
  const nested = [own + '/pessoal/t1/nota.pdf', own + '/trabalho/t2/foto.png'];
  const mass = Array.from({ length: 1001 }, (_, i) =>
    own + '/mass/t1/' + String(i).padStart(4, '0') + '.jpg');
  const otherPath = other + '/pessoal/t1/privado.pdf';
  const storage = fakeStorage([...nested, ...mass, otherPath]);
  const count = await apagarComprovantes(storage, own);
  assert.equal(count, nested.length + mass.length);
  assert.deepEqual([...storage.objects], [otherPath], 'outra conta não pode ser tocada');
  assert.ok(storage.listCalls.some((call) => call.offset >= 100), 'lista deve percorrer várias páginas');
  assert.ok(storage.removeCalls.length >= 2, 'mais de 1000 arquivos exigem mais de um lote');
  assert.ok(storage.removeCalls.every((batch) => batch.length <= 1000));
  assert.ok(storage.removeCalls.flat().every((objectPath) => objectPath.startsWith(own + '/')));
  assert.equal(await apagarComprovantes(storage, own), 0, 'repetir a operação vazia deve ser seguro');

  const partial = fakeStorage(nested, { failOnce: true });
  await assert.rejects(apagarComprovantes(partial, own), /remove offline/);
  assert.equal(partial.objects.size, 1, 'falha parcial não deve ser mascarada');
  assert.equal(await apagarComprovantes(partial, own), 1, 'retry deve remover o restante');
  assert.equal(partial.objects.size, 0);

  const failedList = fakeStorage(nested, { listError: true });
  await assert.rejects(listarLoteComprovantes(failedList, own), /list offline/);
  const stalled = fakeStorage(nested, { noProgress: true });
  await assert.rejects(apagarComprovantes(stalled, own), /não avançou/);
  await assert.rejects(apagarComprovantes(fakeStorage(nested), '../outro'), /inválido/);

  const success = accountHarness({ paths: nested });
  assert.equal((await success.invoke()).status, 200);
  assert.deepEqual([...success.storage.objects], []);
  assert.ok(success.events.indexOf('lock') < success.events.indexOf('list'));
  assert.ok(success.events.indexOf('remove') < success.events.indexOf('deleteUser'));

  const lockFailure = accountHarness({ paths: nested, lockError: true });
  assert.equal((await lockFailure.invoke()).status, 503);
  assert.ok(!lockFailure.events.includes('list') && !lockFailure.events.includes('deleteUser'));

  const storageFailure = accountHarness({ paths: nested, storageOptions: { failOnce: true } });
  const firstAttempt = await storageFailure.invoke();
  assert.equal(firstAttempt.status, 502);
  assert.match(firstAttempt.body.mensagem, /podem já ter sido removidos/);
  assert.ok(!storageFailure.events.includes('deleteUser'));
  assert.equal((await storageFailure.invoke()).status, 200, 'retry deve concluir com o lock já existente');

  const authFailure = accountHarness({ paths: nested, deleteError: true });
  const failedAuth = await authFailure.invoke();
  assert.equal(failedAuth.status, 502);
  assert.ok(authFailure.events.includes('verifyUser'));
  assert.doesNotMatch(failedAuth.body.mensagem, /Nada foi apagado/);
  assert.deepEqual([...authFailure.storage.objects], []);

  const ambiguous = accountHarness({ paths: nested, throwDelete: true, verify404: true });
  assert.equal((await ambiguous.invoke()).status, 200, '404 administrativo confirma exclusão após timeout');

  console.log('oaze-conta-comprovantes: paginação, pastas, lotes, isolamento e falhas OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
