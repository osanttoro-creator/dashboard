-- Fase de transição: aceita a versão anterior e a nova enquanto a Hostinger
-- publica o frontend. A migração seguinte fecha a versão antiga após o deploy.
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
  if v_versao not in ('2026-09-15', '2026-10-01') or coalesce(v_data_texto, '') = '' then
    return new;
  end if;
  begin
    v_data := v_data_texto::timestamptz;
  exception when others then
    return new;
  end;
  if v_data > now() + interval '5 minutes' then return new; end if;
  insert into public.privacy_acceptances (user_id, policy_version, accepted_at, source)
  values (new.id, v_versao, v_data, 'metadata_email')
  on conflict (user_id, policy_version) do nothing;
  return new;
end;
$$;

revoke all on function public.registrar_aceite_privacidade_auth() from public, anon, authenticated;

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
  if coalesce(v_metadata ->> 'privacy_policy_version', '') not in ('2026-09-15', '2026-10-01')
     or coalesce(v_metadata ->> 'privacy_accepted_at', '') = '' then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 400, 'message', 'privacy_policy_required'));
  end if;
  begin
    v_data := (v_metadata ->> 'privacy_accepted_at')::timestamptz;
  exception when others then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 400, 'message', 'privacy_policy_required'));
  end;
  if v_data > now() + interval '5 minutes' then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 400, 'message', 'privacy_policy_required'));
  end if;
  return event;
end;
$$;

revoke all on function public.validar_aceite_privacidade(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.validar_aceite_privacidade(jsonb) to supabase_auth_admin;
