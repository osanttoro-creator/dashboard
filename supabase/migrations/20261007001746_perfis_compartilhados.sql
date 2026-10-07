-- Convites de uso unico: apenas a Edge Function autenticada acessa esta tabela.
-- A conta convidada nunca recebe a linha public.dados inteira.
create table if not exists public.oaze_profile_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  profile_id text not null check (profile_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  recipient_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  constraint oaze_share_not_self check (recipient_id is null or recipient_id <> owner_id)
);
create index if not exists oaze_profile_shares_owner_idx on public.oaze_profile_shares (owner_id, profile_id);
create index if not exists oaze_profile_shares_recipient_idx on public.oaze_profile_shares (recipient_id) where recipient_id is not null and revoked_at is null;
alter table public.oaze_profile_shares enable row level security;
revoke all on public.oaze_profile_shares from public, anon, authenticated;

-- Excluir com trava e revisao; a ultima area financeira nao pode ser apagada.
create or replace function public.v3_excluir_perfil(p_id text, p_expected_updated_at bigint)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_profiles jsonb;
  v_removed jsonb;
begin
  if v_user is null then raise exception 'sem_sessao' using errcode = '42501'; end if;
  if p_id is null or p_id !~ '^[A-Za-z0-9_-]{1,100}$' or p_expected_updated_at is null or p_expected_updated_at < 1 then
    raise exception 'perfil_invalido' using errcode = '22023';
  end if;
  select d.profiles, d.removidos into v_profiles, v_removed
    from public.dados d where d.user_id = v_user for update;
  if v_profiles is null or not (v_profiles ? p_id) then
    raise exception 'perfil_nao_encontrado' using errcode = '22023';
  end if;
  if (select count(*) from pg_catalog.jsonb_object_keys(v_profiles)) <= 1 then
    raise exception 'ultimo_perfil' using errcode = '22023';
  end if;
  if public.carimbo_perfil(v_profiles -> p_id) <> p_expected_updated_at then
    raise exception 'perfil_alterado_em_outro_aparelho' using errcode = '40001';
  end if;
  update public.dados d set profiles = v_profiles - p_id,
    removidos = jsonb_set(coalesce(v_removed, '{}'::jsonb), array[p_id],
      to_jsonb(floor(extract(epoch from clock_timestamp()) * 1000)::bigint), true),
    updated_at = now() where d.user_id = v_user;
  -- Convites para um perfil apagado nao podem ser lidos ou aceitos: a funcao
  -- de compartilhamento verifica a existencia do perfil em toda operacao.
  return true;
end;
$$;
revoke all on function public.v3_excluir_perfil(text, bigint) from public, anon;
grant execute on function public.v3_excluir_perfil(text, bigint) to authenticated;
