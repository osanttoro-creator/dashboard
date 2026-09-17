-- Aceite explícito da Política de privacidade (versão 2026-09-15).
-- O registro é imutável para o usuário: SELECT e INSERT próprios,
-- sem UPDATE/DELETE. Ao excluir a conta, o FK remove o aceite junto.

create table if not exists public.privacy_acceptances (
  user_id uuid not null references auth.users(id) on delete cascade,
  policy_version text not null,
  accepted_at timestamptz not null,
  source text not null,
  recorded_at timestamptz not null default now(),
  primary key (user_id, policy_version),
  constraint privacy_acceptances_version_check
    check (policy_version ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'),
  constraint privacy_acceptances_source_check
    check (source in (
      'cadastro_email', 'oauth_google', 'oauth_apple',
      'metadata_email', 'app_bloqueio', 'app_local'
    )),
  constraint privacy_acceptances_date_check
    check (accepted_at <= now() + interval '5 minutes')
);

comment on table public.privacy_acceptances is
  'Registro imutável do aceite da Política de privacidade por versão.';

alter table public.privacy_acceptances enable row level security;

revoke all on table public.privacy_acceptances from anon, authenticated;
grant select, insert on table public.privacy_acceptances to authenticated;

drop policy if exists "privacy_acceptances_select_own" on public.privacy_acceptances;
create policy "privacy_acceptances_select_own"
on public.privacy_acceptances
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "privacy_acceptances_insert_own" on public.privacy_acceptances;
create policy "privacy_acceptances_insert_own"
on public.privacy_acceptances
for insert
to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

-- E-mail/senha carrega o aceite como metadata durante o signUp.
-- O gatilho transforma essa evidência inicial num registro durável.
create or replace function public.registrar_aceite_privacidade_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_versao text := new.raw_user_meta_data ->> 'privacy_policy_version';
  v_data_texto text := new.raw_user_meta_data ->> 'privacy_accepted_at';
  v_data timestamptz;
begin
  if v_versao <> '2026-09-15' or coalesce(v_data_texto, '') = '' then
    return new;
  end if;

  begin
    v_data := v_data_texto::timestamptz;
  exception when others then
    return new;
  end;

  if v_data > now() + interval '5 minutes' then return new; end if;

  insert into public.privacy_acceptances (
    user_id, policy_version, accepted_at, source
  ) values (
    new.id, v_versao, v_data, 'metadata_email'
  ) on conflict (user_id, policy_version) do nothing;
  return new;
end;
$$;

revoke all on function public.registrar_aceite_privacidade_auth() from public, anon, authenticated;

drop trigger if exists on_auth_user_privacy_acceptance on auth.users;
create trigger on_auth_user_privacy_acceptance
after insert on auth.users
for each row execute function public.registrar_aceite_privacidade_auth();

-- O hook impede cadastro por e-mail sem a versão vigente. OAuth é
-- validado no retorno pelo bloqueio do app, porque o provedor não
-- transporta metadata personalizada no momento em que cria o usuário.
create or replace function public.validar_aceite_privacidade(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider text := coalesce(
    event -> 'user' -> 'app_metadata' ->> 'provider',
    event -> 'user' -> 'identities' -> 0 ->> 'provider',
    'email'
  );
  v_metadata jsonb := coalesce(event -> 'user' -> 'user_metadata', '{}'::jsonb);
  v_data timestamptz;
begin
  if v_provider <> 'email' then return event; end if;

  if coalesce(v_metadata ->> 'privacy_policy_version', '') <> '2026-09-15'
     or coalesce(v_metadata ->> 'privacy_accepted_at', '') = '' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 400,
        'message', 'privacy_policy_required'
      )
    );
  end if;

  begin
    v_data := (v_metadata ->> 'privacy_accepted_at')::timestamptz;
  exception when others then
    return jsonb_build_object(
      'error', jsonb_build_object('http_code', 400, 'message', 'privacy_policy_required')
    );
  end;

  if v_data > now() + interval '5 minutes' then
    return jsonb_build_object(
      'error', jsonb_build_object('http_code', 400, 'message', 'privacy_policy_required')
    );
  end if;

  return event;
end;
$$;

revoke all on function public.validar_aceite_privacidade(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.validar_aceite_privacidade(jsonb) to supabase_auth_admin;
