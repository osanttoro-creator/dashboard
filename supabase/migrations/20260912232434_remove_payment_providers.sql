-- Remove o modelo antigo de cobrança sem apagar o catálogo de
-- planos, seus limites ou a linha que registra o plano efetivo.

drop function if exists public.aplicar_evento_pagamento(
  uuid, text, text, text, integer, text, text, jsonb
);
drop function if exists private.aplicar_evento_pagamento(
  uuid, text, text, text, integer, text, text, jsonb
);

drop table if exists public.checkout_intencoes;
drop table if exists public.subscription_events;

drop index if exists public.subscriptions_externo_idx;
alter table if exists public.plan_prices
  drop column if exists external_price_id;
alter table if exists public.subscriptions
  drop column if exists provider,
  drop column if exists external_customer_id,
  drop column if exists external_subscription_id,
  drop column if exists plano_agendado,
  drop column if exists ciclo_agendado,
  drop column if exists agendado_para;

create or replace function public.meus_direitos()
returns jsonb
language sql
security invoker
stable
set search_path = ''
as $$
  with assinatura as (
    select
      case
        when s.status in ('active', 'past_due', 'canceled')
         and (s.current_period_end is null or s.current_period_end > now())
        then s.plan_id else 'free'
      end as plano,
      s.plan_id as plano_contratado,
      s.status,
      s.billing_cycle,
      s.current_period_end,
      s.cancel_at_period_end
    from public.subscriptions s
    where s.user_id = (select auth.uid())
  )
  select jsonb_build_object(
    'plano',            coalesce((select plano from assinatura), 'free'),
    'plano_contratado', (select plano_contratado from assinatura),
    'status',           coalesce((select status from assinatura), 'free'),
    'ciclo',            (select billing_cycle from assinatura),
    'fim_periodo',      (select current_period_end from assinatura),
    'cancela_no_fim',   coalesce((select cancel_at_period_end from assinatura), false),
    'limites', coalesce((
      select jsonb_object_agg(e.chave, e.limite)
      from public.plan_entitlements e
      where e.tipo = 'limite'
        and e.plan_id = coalesce((select plano from assinatura), 'free')
    ), '{}'::jsonb),
    'recursos', coalesce((
      select jsonb_object_agg(e.chave, e.ativo)
      from public.plan_entitlements e
      where e.tipo = 'recurso'
        and e.plan_id = coalesce((select plano from assinatura), 'free')
    ), '{}'::jsonb)
  );
$$;

revoke execute on function public.meus_direitos() from public, anon;
grant execute on function public.meus_direitos() to authenticated;
