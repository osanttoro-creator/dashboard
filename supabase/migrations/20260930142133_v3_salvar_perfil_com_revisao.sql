-- A V3 edita um espaço por vez. O carimbo esperado impede que uma aba
-- desatualizada substitua silenciosamente uma edição feita em outro aparelho.
-- Os documentos atuais em dados permanecem intactos; o /app antigo continua
-- usando mesclar_dados. A função é SECURITY INVOKER e obedece ao RLS.
create or replace function public.v3_salvar_perfil(
  p_profile jsonb,
  p_expected_updated_at bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id text;
  v_profiles jsonb;
  v_removed jsonb;
  v_current jsonb;
  v_current_stamp bigint;
  v_new_stamp bigint;
  v_saved jsonb;
begin
  if v_user is null then
    raise exception 'sem_sessao' using errcode = '42501';
  end if;
  if jsonb_typeof(p_profile) <> 'object'
     or p_expected_updated_at is null or p_expected_updated_at < 0
     or octet_length(p_profile::text) > 1048576 then
    raise exception 'perfil_invalido' using errcode = '22023';
  end if;
  v_id := p_profile ->> 'id';
  if v_id is null or length(v_id) < 1 or length(v_id) > 100
     or v_id !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'id_de_perfil_invalido' using errcode = '22023';
  end if;

  insert into public.dados (user_id, profiles, meta, removidos)
  values (v_user, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)
  on conflict (user_id) do nothing;

  select coalesce(d.profiles, '{}'::jsonb), coalesce(d.removidos, '{}'::jsonb)
    into v_profiles, v_removed
    from public.dados d
   where d.user_id = v_user
     for update;

  if public.carimbo_perfil(v_removed -> v_id) > 0 then
    raise exception 'perfil_removido_em_outro_aparelho' using errcode = '40001';
  end if;
  v_current := v_profiles -> v_id;
  v_current_stamp := public.carimbo_perfil(v_current);
  if v_current_stamp <> p_expected_updated_at
     or (v_current is not null and p_expected_updated_at = 0) then
    raise exception 'perfil_alterado_em_outro_aparelho' using errcode = '40001';
  end if;

  v_new_stamp := greatest(
    p_expected_updated_at + 1,
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  );
  v_saved := jsonb_set(p_profile, '{updatedAt}', to_jsonb(v_new_stamp), true);
  update public.dados d
     set profiles = jsonb_set(v_profiles, array[v_id], v_saved, true),
         updated_at = now()
   where d.user_id = v_user;
  return v_saved;
end;
$$;

revoke all on function public.v3_salvar_perfil(jsonb, bigint) from public, anon;
grant execute on function public.v3_salvar_perfil(jsonb, bigint) to authenticated;
