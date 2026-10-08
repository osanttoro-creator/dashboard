-- Convites antigos continuam somente leitura. A permissão de edição só vale
-- para o perfil escolhido e é reavaliada no banco a cada gravação.
alter table public.oaze_profile_shares
  add column if not exists permission text not null default 'read';
alter table public.oaze_profile_shares
  add constraint oaze_profile_share_permission check (permission in ('read', 'edit'));
alter table public.oaze_profile_shares
  add column if not exists label text not null default '';
alter table public.oaze_profile_shares
  add constraint oaze_profile_share_label check (char_length(label) <= 60);

create or replace function public.v3_salvar_perfil_compartilhado(
  p_share_id uuid,
  p_profile jsonb,
  p_expected_updated_at bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_share public.oaze_profile_shares%rowtype;
  v_profiles jsonb;
  v_current jsonb;
  v_saved jsonb;
  v_visible jsonb;
  v_key text;
  v_type text;
  v_new_stamp bigint;
begin
  if v_user is null then raise exception 'sem_sessao' using errcode = '42501'; end if;
  if p_share_id is null or jsonb_typeof(p_profile) <> 'object'
     or p_expected_updated_at is null or p_expected_updated_at < 0
     or octet_length(p_profile::text) > 1048576 then
    raise exception 'perfil_invalido' using errcode = '22023';
  end if;

  select * into v_share from public.oaze_profile_shares s
    where s.id = p_share_id and s.recipient_id = v_user
      and s.accepted_at is not null and s.revoked_at is null
    for update;
  if not found or v_share.permission <> 'edit' then
    raise exception 'sem_permissao_de_edicao' using errcode = '42501';
  end if;
  if p_profile ->> 'id' is distinct from v_share.profile_id then
    raise exception 'perfil_diferente_do_convite' using errcode = '22023';
  end if;

  select coalesce(d.profiles, '{}'::jsonb) into v_profiles
    from public.dados d where d.user_id = v_share.owner_id for update;
  v_current := v_profiles -> v_share.profile_id;
  if jsonb_typeof(v_current) is distinct from 'object' then
    raise exception 'perfil_removido' using errcode = '40001';
  end if;
  if public.carimbo_perfil(v_current) <> p_expected_updated_at then
    raise exception 'perfil_alterado_em_outro_aparelho' using errcode = '40001';
  end if;

  v_saved := v_current;
  foreach v_key in array array['accounts','cards','categories','transactions',
    'investments','goals','invoices','automation','budgets'] loop
    if p_profile ? v_key then
      v_type := case when v_key in ('invoices','automation','budgets') then 'object' else 'array' end;
      if jsonb_typeof(p_profile -> v_key) <> v_type then
        raise exception 'campo_financeiro_invalido' using errcode = '22023';
      end if;
      v_saved := jsonb_set(v_saved, array[v_key], p_profile -> v_key, true);
    end if;
  end loop;
  v_new_stamp := greatest(p_expected_updated_at + 1,
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint);
  v_saved := jsonb_set(v_saved, '{updatedAt}', to_jsonb(v_new_stamp), true);
  update public.dados d
    set profiles = jsonb_set(v_profiles, array[v_share.profile_id], v_saved, true),
        updated_at = now()
    where d.user_id = v_share.owner_id;

  -- Não devolver ao convidado campos futuros ou privados do documento do dono.
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_visible
    from jsonb_each(v_saved)
    where key = any(array['id','name','updatedAt','accounts','cards','categories',
      'transactions','investments','invoices','automation','budgets','goals']);
  return v_visible;
end;
$$;
revoke all on function public.v3_salvar_perfil_compartilhado(uuid, jsonb, bigint) from public, anon;
grant execute on function public.v3_salvar_perfil_compartilhado(uuid, jsonb, bigint) to authenticated;
