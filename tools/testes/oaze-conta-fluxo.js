'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const { webcrypto } = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '../../supabase/functions/oaze-conta/index.ts'), 'utf8')
  .replace(/^import[^\n]+;\r?$/gm, '');
const code = stripTypeScriptTypes(source);
const uid = '11111111-1111-4111-8111-111111111111';
const receipt = uid + '/pessoal/tx-1/nota.pdf';

async function scenario({ lockError = false, listError = false, deleteError = false, userGone = false,
  initial = [receipt] } = {}) {
  const events = [];
  const files = new Set(initial);
  const storage = {
    from(bucket) {
      assert.equal(bucket, 'oaze-receipts');
      return {
        async list(prefix, options) {
          events.push('list');
          if (listError) return { data: null, error: new Error('storage offline') };
          const entries = new Map();
          for (const file of files) {
            if (!file.startsWith(prefix + '/')) continue;
            const tail = file.slice(prefix.length + 1);
            const name = tail.split('/')[0];
            entries.set(name, { name, id: tail.includes('/') ? null : file });
          }
          return { data: [...entries.values()].sort((a, b) => a.name.localeCompare(b.name))
            .slice(options.offset, options.offset + options.limit), error: null };
        },
        async remove(paths) {
          events.push('remove');
          for (const objectPath of paths) files.delete(objectPath);
          return { data: paths.map((name) => ({ name })), error: null };
        }
      };
    }
  };
  const admin = {
    storage,
    auth: { admin: {
      async deleteUser(id) {
        assert.equal(id, uid);
        events.push('deleteUser');
        return { error: deleteError ? Object.assign(new Error('auth offline'), { status: 503 }) : null };
      },
      async getUserById(id) {
        assert.equal(id, uid);
        events.push('getUserById');
        return userGone
          ? { data: null, error: { status: 404, code: 'user_not_found' } }
          : { data: { user: { id: uid } }, error: null };
      }
    } },
    from(table) {
      if (table === 'account_deletion_locks') return {
        async upsert(record) {
          assert.equal(record.user_id, uid);
          events.push('lock');
          return { error: lockError ? new Error('lock offline') : null };
        }
      };
      const query = {
        data: [], count: 0,
        select() { return this; },
        eq() { return this; },
        in() { return this; },
        async maybeSingle() { return { data: null, error: null }; }
      };
      return query;
    }
  };
  let handler;
  const sandbox = {
    Deno: {
      env: { get(name) {
        return { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-test',
          SUPABASE_ANON_KEY: 'anon-test', OAZE_ALLOWED_ORIGINS: '' }[name] || '';
      } },
      serve(fn) { handler = fn; }
    },
    createClient(_url, key) {
      return key === 'service-test' ? admin : {
        auth: { async getUser() { return { data: { user: { id: uid, email: 'u@example.test' } }, error: null }; } }
      };
    },
    reservarRateLimit: async () => ({ permitido: true }),
    corpoCabeNoLimite: () => true,
    asaas: async () => {},
    stripe: async () => {},
    AsaasErro: class AsaasErro extends Error {},
    StripeErro: class StripeErro extends Error {},
    DenoError: Error,
    Request, Response, URLSearchParams, crypto: webcrypto,
    console: { error() {} }
  };
  vm.runInNewContext(code, sandbox, { timeout: 5000 });
  assert.equal(typeof handler, 'function');
  const response = await handler(new Request('https://example.supabase.co/functions/v1/oaze-conta', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify({ acao: 'excluir', confirmacao: 'u@example.test' })
  }));
  return { status: response.status, body: await response.json(), events, files };
}

(async () => {
  const success = await scenario();
  assert.equal(success.status, 200);
  assert.deepEqual(success.events.filter((event) => ['lock', 'remove', 'deleteUser'].includes(event)),
    ['lock', 'remove', 'deleteUser']);
  assert.equal(success.files.size, 0);
  assert.equal(success.body.resumo.comprovantes, 1);

  const locked = await scenario({ lockError: true });
  assert.equal(locked.status, 503);
  assert.deepEqual(locked.events, ['lock']);

  const storageFailed = await scenario({ listError: true });
  assert.equal(storageFailed.status, 502);
  assert.equal(storageFailed.events[0], 'lock');
  assert.ok(!storageFailed.events.includes('deleteUser'));

  const authFailed = await scenario({ deleteError: true });
  assert.equal(authFailed.status, 502);
  assert.ok(authFailed.events.includes('getUserById'));
  assert.ok(!/Nada foi apagado/i.test(authFailed.body.mensagem));
  assert.equal(authFailed.files.size, 0);

  const deletedDespiteError = await scenario({ deleteError: true, userGone: true });
  assert.equal(deletedDespiteError.status, 200);
  assert.equal(deletedDespiteError.body.ok, true);

  console.log('oaze-conta-fluxo: trava, limpeza, falhas e confirmação Auth OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
