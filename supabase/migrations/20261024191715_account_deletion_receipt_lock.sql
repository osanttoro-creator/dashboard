-- A trava impede novos comprovantes entre o início da exclusão da conta
-- e a limpeza do Storage. Ela não referencia auth.users: tokens emitidos antes
-- da exclusão ainda podem ser válidos depois de deleteUser, por isso o
-- tombstone precisa sobreviver à remoção do usuário.
create table public.account_deletion_locks (
  user_id uuid primary key,
  started_at timestamptz not null default now()
);

alter table public.account_deletion_locks enable row level security;

revoke all on table public.account_deletion_locks from public, anon, authenticated;
grant select on table public.account_deletion_locks to authenticated;
grant select, insert, update, delete on table public.account_deletion_locks to service_role;

create policy "account_deletion_locks_read_own" on public.account_deletion_locks
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Políticas permissivas de outros buckets não podem contornar a trava.
-- O ramo do bucket mantém a restrição neutra fora de oaze-receipts.
create policy "oaze_receipts_upload_unlocked" on storage.objects
  as restrictive for insert to authenticated
  with check (
    bucket_id <> 'oaze-receipts'
    or not exists (
      select 1 from public.account_deletion_locks as account_lock
      where account_lock.user_id = (select auth.uid())
    )
  );
