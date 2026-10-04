-- O cofre não é acessível pelo cliente. Apenas a Edge Function autenticada
-- usa a service role para testar o PIN e ler/gravar o texto cifrado.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.oaze_cofre (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pin_hash text not null,
  cipher_text text,
  nonce text,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.oaze_cofre enable row level security;
revoke all on public.oaze_cofre from anon, authenticated;

create or replace function public.oaze_cofre_configurar(p_user_id uuid, p_pin text)
returns boolean
language plpgsql security definer set search_path = pg_catalog, public, extensions
as $$
begin
  if p_user_id is null or p_pin !~ '^[0-9]{6}$' then return false; end if;
  insert into public.oaze_cofre (user_id, pin_hash)
  values (p_user_id, crypt(p_pin, gen_salt('bf', 12)))
  on conflict (user_id) do nothing;
  return found;
end;
$$;

create or replace function public.oaze_cofre_verificar(p_user_id uuid, p_pin text)
returns boolean
language plpgsql security definer set search_path = pg_catalog, public, extensions
as $$
declare
  v public.oaze_cofre%rowtype;
  failures integer;
begin
  if p_user_id is null or p_pin !~ '^[0-9]{6}$' then return false; end if;
  select * into v from public.oaze_cofre where user_id = p_user_id for update;
  if not found then return false; end if;
  if v.locked_until is not null and v.locked_until > clock_timestamp() then return false; end if;
  failures := case when v.locked_until is not null then 0 else v.failed_attempts end;
  if crypt(p_pin, v.pin_hash) = v.pin_hash then
    update public.oaze_cofre set failed_attempts = 0, locked_until = null where user_id = p_user_id;
    return true;
  end if;
  failures := failures + 1;
  update public.oaze_cofre
  set failed_attempts = failures,
      locked_until = case when failures >= 5 then clock_timestamp() + interval '15 minutes' else null end
  where user_id = p_user_id;
  return false;
end;
$$;

revoke all on function public.oaze_cofre_configurar(uuid, text) from public, anon, authenticated;
revoke all on function public.oaze_cofre_verificar(uuid, text) from public, anon, authenticated;
grant execute on function public.oaze_cofre_configurar(uuid, text) to service_role;
grant execute on function public.oaze_cofre_verificar(uuid, text) to service_role;
