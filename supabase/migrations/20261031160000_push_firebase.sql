-- =============================================================
-- 31/10/2026 — push pelo Firebase (projeto oaze-finance).
-- O aparelho registra o token e os tópicos que a pessoa ligou.
-- O servidor só envia dado público (cotação do dólar); avisos com
-- dados pessoais continuam sendo criados no próprio aparelho.
-- =============================================================

alter table public.oaze2_push_tokens
  add column if not exists topicos text[] not null default '{}';

-- Um token pertence a um aparelho e a uma conta por vez: ao trocar de
-- conta no mesmo celular, a conta anterior deixa de receber nele.
create or replace function public.registrar_push(p_device text, p_token text, p_topicos text[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'sem_sessao'; end if;
  if p_device !~ '^[A-Za-z0-9_-]{8,80}$' or length(p_token) not between 20 and 4096 then
    raise exception 'dados_invalidos';
  end if;
  delete from public.oaze2_push_tokens
   where (token = p_token or device_id = p_device) and user_id <> v_user;
  insert into public.oaze2_push_tokens (device_id, user_id, platform, token, updated_at, topicos)
    values (p_device, v_user, 'android', p_token, now(),
            array(select distinct t from unnest(coalesce(p_topicos, '{}')) t where t in ('dolar')))
    on conflict (user_id, device_id) do update
      set token = excluded.token, updated_at = now(), topicos = excluded.topicos;
end;
$$;
revoke all on function public.registrar_push(text, text, text[]) from public, anon;
grant execute on function public.registrar_push(text, text, text[]) to authenticated;

-- Controle de envio diário: o mesmo aviso não sai duas vezes no dia.
create table if not exists public.push_envios (
  dia date not null,
  tipo text not null,
  enviados int not null default 0,
  falhas int not null default 0,
  criado_em timestamptz not null default now(),
  primary key (dia, tipo)
);
alter table public.push_envios enable row level security;
revoke all on public.push_envios from anon, authenticated;
