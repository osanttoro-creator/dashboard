-- =============================================================
-- 31/10/2026 — Coco em porcentagem (janelas diária e semanal) e
-- anúncios premiados que liberam lançamentos no Semente.
--
-- Decisões de Jonatham (30/10/2026):
--   · Semente: 50 lançamentos/mês + 10 por anúncio assistido,
--     até 5 anúncios por dia (anúncio premiado só no Android).
--   · Coco: em vez de "N conversas por mês", barras de uso do dia
--     (renova à meia-noite de Brasília) e da semana (renova na segunda).
--     Cada pedido custa unidades: conversa 1, leitura de arquivo 3.
--     Os números ficam em plan_entitlements e podem ser ajustados sem
--     mexer em código.
--
-- Nada é apagado. ai_queries_per_month continua na tabela, mas as
-- funções da Coco passam a usar reservar_coco().
-- =============================================================

-- ---------- limites dos planos ----------
insert into public.plan_entitlements (plan_id, chave, tipo, limite, ativo) values
  ('free',  'coco_unidades_dia',      'limite', 3,   null),
  ('free',  'coco_unidades_semana',   'limite', 10,  null),
  ('basic', 'coco_unidades_dia',      'limite', 10,  null),
  ('basic', 'coco_unidades_semana',   'limite', 40,  null),
  ('pro',   'coco_unidades_dia',      'limite', 30,  null),
  ('pro',   'coco_unidades_semana',   'limite', 120, null),
  ('free',  'anuncios_por_dia',       'limite', 5,   null),
  ('free',  'lancamentos_por_anuncio','limite', 10,  null),
  ('basic', 'anuncios_por_dia',       'limite', 0,   null),
  ('basic', 'lancamentos_por_anuncio','limite', 0,   null),
  ('pro',   'anuncios_por_dia',       'limite', 0,   null),
  ('pro',   'lancamentos_por_anuncio','limite', 0,   null)
on conflict (plan_id, chave) do update set limite = excluded.limite, tipo = excluded.tipo, ativo = null;

update public.plan_entitlements set limite = 50
 where plan_id = 'free' and chave = 'transactions_per_month';

-- ---------- plano efetivo de um usuário (mesma regra de meus_direitos) ----------
create or replace function private.plano_efetivo(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case when s.status in ('active', 'past_due', 'canceled')
                 and (s.current_period_end is null or s.current_period_end > now())
           then s.plan_id else 'free' end
      from public.subscriptions s where s.user_id = p_user limit 1), 'free');
$$;

-- null = ilimitado; chave ausente também é tratada como ilimitada só
-- para planos pagos, nunca para o grátis.
create or replace function private.limite_do_plano(p_plano text, p_chave text)
returns int language sql stable security definer set search_path = '' as $$
  select e.limite from public.plan_entitlements e
   where e.plan_id = p_plano and e.chave = p_chave and e.tipo = 'limite';
$$;

create or replace function private.pct_uso(p_usado int, p_limite int)
returns int language sql immutable set search_path = '' as $$
  select case when p_limite is null then 0
              when p_limite <= 0 then 100
              else least(100, round(p_usado * 100.0 / p_limite)::int) end;
$$;

-- ---------- Coco: reservar e estornar unidades ----------
create or replace function private.reservar_coco(p_user uuid, p_custo int)
returns table(out_permitido boolean, out_pct_dia int, out_pct_semana int,
              out_renova_dia timestamptz, out_renova_semana timestamptz, out_janela text)
language plpgsql security definer set search_path = '' as $$
declare
  v_local timestamp := now() at time zone 'America/Sao_Paulo';
  v_dia text := to_char(v_local, 'YYYY-MM-DD');
  v_sem text := to_char(v_local, 'IYYY-"S"IW');
  v_renova_dia timestamptz := (date_trunc('day', v_local) + interval '1 day') at time zone 'America/Sao_Paulo';
  v_renova_sem timestamptz := (date_trunc('week', v_local) + interval '7 days') at time zone 'America/Sao_Paulo';
  v_plano text := private.plano_efetivo(p_user);
  v_lim_dia int := private.limite_do_plano(v_plano, 'coco_unidades_dia');
  v_lim_sem int := private.limite_do_plano(v_plano, 'coco_unidades_semana');
  v_custo int := greatest(1, least(coalesce(p_custo, 1), 10));
  v_u_dia int;
  v_u_sem int;
begin
  if v_plano = 'free' then
    v_lim_dia := coalesce(v_lim_dia, 0);
    v_lim_sem := coalesce(v_lim_sem, 0);
  end if;

  insert into public.usage_counters (user_id, tipo, periodo, usado, limite)
    values (p_user, 'coco_dia', v_dia, 0, coalesce(v_lim_dia, 2147483647))
    on conflict (user_id, tipo, periodo) do nothing;
  insert into public.usage_counters (user_id, tipo, periodo, usado, limite)
    values (p_user, 'coco_semana', v_sem, 0, coalesce(v_lim_sem, 2147483647))
    on conflict (user_id, tipo, periodo) do nothing;

  -- trava as duas linhas na mesma ordem: dois pedidos simultâneos não
  -- passam do teto e não se travam um ao outro
  select uc.usado into v_u_dia from public.usage_counters uc
   where uc.user_id = p_user and uc.tipo = 'coco_dia' and uc.periodo = v_dia for update;
  select uc.usado into v_u_sem from public.usage_counters uc
   where uc.user_id = p_user and uc.tipo = 'coco_semana' and uc.periodo = v_sem for update;

  if v_lim_dia is not null and v_u_dia + v_custo > v_lim_dia then
    return query select false, private.pct_uso(v_u_dia, v_lim_dia), private.pct_uso(v_u_sem, v_lim_sem),
      v_renova_dia, v_renova_sem, 'dia'::text;
    return;
  end if;
  if v_lim_sem is not null and v_u_sem + v_custo > v_lim_sem then
    return query select false, private.pct_uso(v_u_dia, v_lim_dia), private.pct_uso(v_u_sem, v_lim_sem),
      v_renova_dia, v_renova_sem, 'semana'::text;
    return;
  end if;

  update public.usage_counters set usado = usado + v_custo, limite = coalesce(v_lim_dia, 2147483647), updated_at = now()
   where user_id = p_user and tipo = 'coco_dia' and periodo = v_dia;
  update public.usage_counters set usado = usado + v_custo, limite = coalesce(v_lim_sem, 2147483647), updated_at = now()
   where user_id = p_user and tipo = 'coco_semana' and periodo = v_sem;

  return query select true, private.pct_uso(v_u_dia + v_custo, v_lim_dia), private.pct_uso(v_u_sem + v_custo, v_lim_sem),
    v_renova_dia, v_renova_sem, null::text;
end;
$$;

create or replace function private.estornar_coco(p_user uuid, p_custo int)
returns void language sql security definer set search_path = '' as $$
  update public.usage_counters
     set usado = greatest(0, usado - greatest(1, least(coalesce(p_custo, 1), 10))), updated_at = now()
   where user_id = p_user
     and ((tipo = 'coco_dia' and periodo = to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'))
       or (tipo = 'coco_semana' and periodo = to_char(now() at time zone 'America/Sao_Paulo', 'IYYY-"S"IW')));
$$;

create or replace function public.reservar_coco(p_user uuid, p_custo int)
returns table(out_permitido boolean, out_pct_dia int, out_pct_semana int,
              out_renova_dia timestamptz, out_renova_semana timestamptz, out_janela text)
language sql security definer set search_path = '' as $$
  select * from private.reservar_coco(p_user, p_custo);
$$;

create or replace function public.estornar_coco(p_user uuid, p_custo int)
returns void language sql security definer set search_path = '' as $$
  select private.estornar_coco(p_user, p_custo);
$$;

revoke all on function public.reservar_coco(uuid, int) from public, anon, authenticated;
revoke all on function public.estornar_coco(uuid, int) from public, anon, authenticated;
grant execute on function public.reservar_coco(uuid, int) to service_role;
grant execute on function public.estornar_coco(uuid, int) to service_role;

-- O próprio usuário lê a sua porcentagem (barra da Coco no app).
create or replace function public.meu_consumo_coco()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_local timestamp := now() at time zone 'America/Sao_Paulo';
  v_plano text;
  v_lim_dia int; v_lim_sem int; v_u_dia int; v_u_sem int;
begin
  if v_user is null then return null; end if;
  v_plano := private.plano_efetivo(v_user);
  v_lim_dia := private.limite_do_plano(v_plano, 'coco_unidades_dia');
  v_lim_sem := private.limite_do_plano(v_plano, 'coco_unidades_semana');
  if v_plano = 'free' then v_lim_dia := coalesce(v_lim_dia, 0); v_lim_sem := coalesce(v_lim_sem, 0); end if;
  select coalesce(max(usado) filter (where tipo = 'coco_dia'), 0),
         coalesce(max(usado) filter (where tipo = 'coco_semana'), 0)
    into v_u_dia, v_u_sem
    from public.usage_counters
   where user_id = v_user
     and ((tipo = 'coco_dia' and periodo = to_char(v_local, 'YYYY-MM-DD'))
       or (tipo = 'coco_semana' and periodo = to_char(v_local, 'IYYY-"S"IW')));
  return jsonb_build_object(
    'plano', v_plano,
    'pct_dia', private.pct_uso(v_u_dia, v_lim_dia),
    'pct_semana', private.pct_uso(v_u_sem, v_lim_sem),
    'ilimitado', v_lim_dia is null and v_lim_sem is null,
    'renova_dia', (date_trunc('day', v_local) + interval '1 day') at time zone 'America/Sao_Paulo',
    'renova_semana', (date_trunc('week', v_local) + interval '7 days') at time zone 'America/Sao_Paulo');
end;
$$;
revoke all on function public.meu_consumo_coco() from public, anon;
grant execute on function public.meu_consumo_coco() to authenticated;

-- ---------- anúncios premiados ----------
create table if not exists public.anuncio_recompensas (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  transacao_id text not null unique,
  origem text not null check (origem in ('admob', 'teste')),
  dia date not null,
  mes text not null check (mes ~ '^\d{4}-\d{2}$'),
  lancamentos int not null check (lancamentos between 1 and 50),
  criado_em timestamptz not null default now()
);
create index if not exists anuncio_recompensas_user_mes_idx on public.anuncio_recompensas (user_id, mes);
alter table public.anuncio_recompensas enable row level security;
drop policy if exists "dono lê as recompensas" on public.anuncio_recompensas;
create policy "dono lê as recompensas" on public.anuncio_recompensas
  for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.anuncio_recompensas from anon, authenticated;

-- Crédito idempotente: o mesmo transaction_id da AdMob nunca vale duas vezes.
create or replace function private.creditar_anuncio(p_user uuid, p_transacao text, p_origem text)
returns table(out_ok boolean, out_motivo text, out_hoje int, out_liberados_mes int)
language plpgsql security definer set search_path = '' as $$
declare
  v_local timestamp := now() at time zone 'America/Sao_Paulo';
  v_dia date := v_local::date;
  v_mes text := to_char(v_local, 'YYYY-MM');
  v_plano text := private.plano_efetivo(p_user);
  v_max int := coalesce(private.limite_do_plano(v_plano, 'anuncios_por_dia'), 0);
  v_por int := coalesce(private.limite_do_plano(v_plano, 'lancamentos_por_anuncio'), 0);
  v_hoje int;
  v_inserido bigint;
begin
  if p_transacao is null or length(p_transacao) not between 4 and 200 or p_origem not in ('admob', 'teste') then
    return query select false, 'invalido'::text, 0, 0; return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('anuncio:' || p_user::text, 0));
  select count(*) into v_hoje from public.anuncio_recompensas where user_id = p_user and dia = v_dia;
  if v_max <= 0 or v_por <= 0 then
    return query select false, 'plano_sem_anuncio'::text, v_hoje,
      (select coalesce(sum(lancamentos), 0)::int from public.anuncio_recompensas where user_id = p_user and mes = v_mes);
    return;
  end if;
  if v_hoje >= v_max then
    return query select false, 'limite_dia'::text, v_hoje,
      (select coalesce(sum(lancamentos), 0)::int from public.anuncio_recompensas where user_id = p_user and mes = v_mes);
    return;
  end if;
  insert into public.anuncio_recompensas (user_id, transacao_id, origem, dia, mes, lancamentos)
    values (p_user, p_transacao, p_origem, v_dia, v_mes, v_por)
    on conflict (transacao_id) do nothing returning id into v_inserido;
  return query select v_inserido is not null, case when v_inserido is null then 'repetido' else null end::text,
    v_hoje + (case when v_inserido is null then 0 else 1 end),
    (select coalesce(sum(lancamentos), 0)::int from public.anuncio_recompensas where user_id = p_user and mes = v_mes);
end;
$$;

create or replace function public.creditar_anuncio(p_user uuid, p_transacao text, p_origem text)
returns table(out_ok boolean, out_motivo text, out_hoje int, out_liberados_mes int)
language sql security definer set search_path = '' as $$
  select * from private.creditar_anuncio(p_user, p_transacao, p_origem);
$$;
revoke all on function public.creditar_anuncio(uuid, text, text) from public, anon, authenticated;
grant execute on function public.creditar_anuncio(uuid, text, text) to service_role;

-- ---------- meus_direitos: soma os lançamentos liberados no mês ----------
create or replace function public.meus_direitos()
returns jsonb language sql stable set search_path = '' as $function$
  with assinatura as (
    select
      case when s.status in ('active', 'past_due', 'canceled')
         and (s.current_period_end is null or s.current_period_end > now())
        then s.plan_id else 'free' end as plano,
      s.plan_id as plano_contratado, s.status, s.billing_cycle,
      s.current_period_end, s.cancel_at_period_end
    from public.subscriptions s
    where s.user_id = (select auth.uid())
  ), efetivo as (
    select coalesce((select plano from assinatura), 'free') as plano
  ), anuncios as (
    select
      coalesce(sum(r.lancamentos) filter (where r.mes = to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM')), 0)::int as liberados_mes,
      count(*) filter (where r.dia = (now() at time zone 'America/Sao_Paulo')::date)::int as hoje
    from public.anuncio_recompensas r
    where r.user_id = (select auth.uid())
  ), base as (
    select coalesce((select jsonb_object_agg(e.chave, e.limite) from public.plan_entitlements e
      where e.tipo = 'limite' and e.plan_id = (select plano from efetivo)), '{}'::jsonb) as limites
  )
  select jsonb_build_object(
    'plano',            (select plano from efetivo),
    'plano_contratado', (select plano_contratado from assinatura),
    'status',           coalesce((select status from assinatura), 'free'),
    'ciclo',            (select billing_cycle from assinatura),
    'fim_periodo',      (select current_period_end from assinatura),
    'cancela_no_fim',   coalesce((select cancel_at_period_end from assinatura), false),
    'limites', case
      when (select limites from base) ? 'transactions_per_month'
       and (select limites from base)->>'transactions_per_month' is not null
      then jsonb_set((select limites from base), '{transactions_per_month}',
        to_jsonb(((select limites from base)->>'transactions_per_month')::int + (select liberados_mes from anuncios)))
      else (select limites from base) end,
    'recursos', coalesce((select jsonb_object_agg(e.chave, e.ativo) from public.plan_entitlements e
      where e.tipo = 'recurso' and e.plan_id = (select plano from efetivo)), '{}'::jsonb),
    'anuncios', jsonb_build_object(
      'hoje', (select hoje from anuncios),
      'max_dia', coalesce((select (limites->>'anuncios_por_dia')::int from base), 0),
      'por_anuncio', coalesce((select (limites->>'lancamentos_por_anuncio')::int from base), 0),
      'liberados_mes', (select liberados_mes from anuncios))
  );
$function$;
