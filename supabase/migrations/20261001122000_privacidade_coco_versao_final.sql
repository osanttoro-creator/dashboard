-- Aplicar somente depois da publicação da interface de 2026-10-01.
-- Aceites antigos continuam registrados, mas não autorizam cadastros novos.
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
  if coalesce(v_metadata ->> 'privacy_policy_version', '') <> '2026-10-01'
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
