'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'migrations',
  '20261024191715_account_deletion_receipt_lock.sql'), 'utf8');

assert.match(migration, /create table public\.account_deletion_locks\s*\(\s*user_id uuid primary key,/i);
assert.doesNotMatch(migration, /references\s+auth\.users/i,
  'A trava precisa sobreviver à remoção de auth.users.');
assert.match(migration, /alter table public\.account_deletion_locks enable row level security/i);
assert.match(migration, /revoke all on table public\.account_deletion_locks from public, anon, authenticated/i);
assert.match(migration, /grant select on table public\.account_deletion_locks to authenticated/i);
assert.match(migration, /grant select, insert, update, delete on table public\.account_deletion_locks to service_role/i);
assert.match(migration, /create policy "account_deletion_locks_read_own"[\s\S]*?for select to authenticated[\s\S]*?user_id = \(select auth\.uid\(\)\)/i);
assert.match(migration, /create policy "oaze_receipts_upload_unlocked" on storage\.objects\s+as restrictive for insert to authenticated/i);
assert.match(migration, /bucket_id <> 'oaze-receipts'\s+or not exists\s*\([\s\S]*?account_lock\.user_id = \(select auth\.uid\(\)\)/i);

console.log('Trava de exclusão dos comprovantes: política restritiva e permissões verificadas.');
