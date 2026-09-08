-- =============================================================
-- Checkout e assinaturas — fase 8
-- -------------------------------------------------------------
-- Aplicado em três migrações, nesta ordem:
--   20260908002141  checkout_intencoes_e_agendamento
--   20260908002227  aplicar_evento_de_pagamento
--   20260908002652  plano_efetivo_pending_nao_libera
--
-- O QUE JÁ EXISTIA E NÃO PRECISOU MUDAR
--   · índice único em (provider, external_event_id) — impede
--     processar o mesmo webhook duas vezes
--   · índice único em subscriptions(user_id) — impede duas
--     assinaturas ativas para a mesma conta
--   · CHECK de status com os seis estados
--     (free, pending, active, past_due, canceled, expired)
-- =============================================================


-- =============================================================
-- 1 · A INTENÇÃO DE COMPRA
-- -------------------------------------------------------------
-- O webhook chega dizendo "o pagamento X foi aprovado". Sozinho,
-- isso não diz de quem é nem do que é. Sem uma intenção registrada
-- ANTES, o servidor teria de acreditar no que o webhook conta.
--
-- A intenção congela o preço no momento do clique. Se o preço mudar
-- entre o clique e o pagamento, vale o que foi mostrado à pessoa; e
-- o webhook pode CONFERIR se o valor pago é o valor cobrado, em vez
-- de aceitar qualquer número.
-- =============================================================
create table if not exists public.checkout_intencoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  plan_id text not null references public.plans(id),
  billing_cycle text not null check (billing_cycle in ('monthly','annual')),

  -- congelados na criação: é contra estes que o webhook confere
  price_id text not null references public.plan_prices(id),
  centavos integer not null check (centavos > 0),
  price_version integer not null,
  moeda text not null default 'BRL',

  provider text not null default 'mercadopago',
  external_preference_id text,

  status text not null default 'aberta'
    check (status in ('aberta','paga','expirada','cancelada','recusada')),

  -- Sem prazo, um link de checkout de seis meses atrás continuaria
  -- valendo o preço de seis meses atrás.
  expira_em timestamptz not null default (now() + interval '2 hours'),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.checkout_intencoes is
  'Uma linha por tentativa de compra. Congela plano, ciclo e preço no momento do clique — é contra ela que o webhook confere o valor pago. O frontend nunca envia preço.';

create index if not exists checkout_intencoes_user_idx
  on public.checkout_intencoes (user_id, created_at desc);

-- O external_reference mandado ao Mercado Pago é o id desta linha.
create unique index if not exists checkout_intencoes_pref_idx
  on public.checkout_intencoes (provider, external_preference_id)
  where external_preference_id is not null;

alter table public.checkout_intencoes enable row level security;
alter table public.checkout_intencoes force row level security;

-- O dono LÊ, e só. Quem cria é a Edge Function, com service_role.
-- Se o navegador pudesse inserir, poderia inserir centavos = 1.
create policy "dono lê a própria intenção" on public.checkout_intencoes
  for select to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.checkout_intencoes to authenticated;


-- =============================================================
-- 2 · O DOWNGRADE AGENDADO
-- -------------------------------------------------------------
-- Descer de plano vale no fim do período já pago. Sem um lugar para
-- guardar "vira Grátis em 3 de outubro", só haveria duas saídas
-- ruins: aplicar na hora (a pessoa perde o que pagou) ou esquecer
-- (a pessoa nunca desce).
-- =============================================================
alter table public.subscriptions
  add column if not exists plano_agendado text references public.plans(id),
  add column if not exists ciclo_agendado text check (ciclo_agendado in ('monthly','annual')),
  add column if not exists agendado_para timestamptz;

comment on column public.subscriptions.plano_agendado is
  'Plano que passa a valer no fim do período pago. Usado no downgrade, que nunca é imediato. NULL = nenhuma mudança agendada.';

drop trigger if exists checkout_intencoes_updated on public.checkout_intencoes;
create trigger checkout_intencoes_updated
  before update on public.checkout_intencoes
  for each row execute function public.subscriptions_toca_updated_at();


-- =============================================================
-- 3 · APLICAR O PAGAMENTO, ATOMICAMENTE
-- -------------------------------------------------------------
-- Registra o evento E muda a assinatura na MESMA transação.
--
-- A ordem natural seria: grava o evento (o índice único é o portão
-- de idempotência), depois ativa o plano. Mas se a função morrer
-- entre as duas — timeout, deploy no meio, rede — o evento fica
-- registrado e o plano não. A retentativa do Mercado Pago seria
-- então RECUSADA como duplicada, e a pessoa teria pagado sem
-- receber. Raro, silencioso e caro.
-- =============================================================
create or replace function private.aplicar_evento_pagamento(
  p_intencao uuid,
  p_provider text,
  p_evento_id text,
  p_status_pagamento text,     -- approved | pending | rejected | refunded | charged_back
  p_centavos_pagos integer,
  p_assinatura_externa text,
  p_cliente_externo text,
  p_dados jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_int   public.checkout_intencoes;
  v_ass   public.subscriptions;
  v_novo_status text;
  v_inseriu int;
  v_fim   timestamptz;
begin
  -- ---- o portão de idempotência ----
  insert into public.subscription_events
    (user_id, tipo, provider, external_event_id, dados)
  select i.user_id, 'pagamento:'||p_status_pagamento, p_provider, p_evento_id, p_dados
  from public.checkout_intencoes i where i.id = p_intencao
  on conflict (provider, external_event_id) where external_event_id is not null
  do nothing;

  get diagnostics v_inseriu = row_count;
  if v_inseriu = 0 then
    return jsonb_build_object('ok', true, 'acao', 'ja_processado');
  end if;

  select * into v_int from public.checkout_intencoes where id = p_intencao;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'intencao_desconhecida');
  end if;

  -- ---- o valor pago tem de ser o valor cobrado ----
  -- O preço veio do BANCO quando a intenção foi criada; aqui só se
  -- confere. Aceitar valor menor seria deixar o preço ser decidido
  -- fora daqui, que é exatamente o que não pode.
  if p_status_pagamento = 'approved'
     and p_centavos_pagos is distinct from v_int.centavos then
    update public.checkout_intencoes
       set status = 'recusada', updated_at = now()
     where id = p_intencao;
    return jsonb_build_object('ok', false, 'erro', 'valor_divergente',
      'esperado', v_int.centavos, 'recebido', p_centavos_pagos);
  end if;

  v_novo_status := case p_status_pagamento
    when 'approved'     then 'active'
    when 'pending'      then 'pending'
    when 'rejected'     then 'free'
    when 'refunded'     then 'canceled'
    when 'charged_back' then 'canceled'
    else 'pending' end;

  v_fim := case v_int.billing_cycle
    when 'annual' then now() + interval '1 year'
    else now() + interval '1 month' end;

  select * into v_ass from public.subscriptions where user_id = v_int.user_id;

  if p_status_pagamento = 'approved' then
    update public.subscriptions set
      plan_id = v_int.plan_id,
      billing_cycle = v_int.billing_cycle,
      status = 'active',
      provider = p_provider,
      external_subscription_id = coalesce(p_assinatura_externa, external_subscription_id),
      external_customer_id = coalesce(p_cliente_externo, external_customer_id),
      current_period_start = now(),
      current_period_end = v_fim,
      price_version = v_int.price_version,
      -- Pagou: cancelamento ou downgrade agendado deixam de fazer
      -- sentido. Não limpar aqui faria a assinatura recém-paga cair
      -- para o plano antigo na virada.
      cancel_at_period_end = false,
      canceled_at = null,
      plano_agendado = null,
      ciclo_agendado = null,
      agendado_para = null,
      updated_at = now()
    where user_id = v_int.user_id;

    update public.checkout_intencoes
       set status = 'paga', updated_at = now() where id = p_intencao;

  elsif p_status_pagamento = 'pending' then
    -- NÃO libera o plano. 'pending' é o boleto que ainda não
    -- compensou; liberar seria entregar antes de receber.
    update public.subscriptions set
      status = 'pending', provider = p_provider, updated_at = now()
    where user_id = v_int.user_id and status in ('free','pending');

  else
    update public.checkout_intencoes
       set status = case p_status_pagamento when 'rejected' then 'recusada' else 'cancelada' end,
           updated_at = now()
     where id = p_intencao;

    -- Recusa NÃO derruba quem já tinha plano ativo: pode ser a
    -- tentativa de trocar de plano que falhou, e derrubar puniria
    -- por uma compra que nem aconteceu.
    update public.subscriptions set
      status = case when status = 'pending' then 'free' else status end,
      updated_at = now()
    where user_id = v_int.user_id;
  end if;

  insert into public.subscription_events
    (user_id, tipo, de_plano, para_plano, de_status, para_status, provider, dados)
  values (v_int.user_id, 'transicao', v_ass.plan_id, v_int.plan_id,
          v_ass.status, v_novo_status, p_provider,
          jsonb_build_object('intencao', p_intencao));

  return jsonb_build_object('ok', true, 'acao', 'aplicado',
    'status', v_novo_status, 'plano', v_int.plan_id);
end;
$$;

revoke execute on function private.aplicar_evento_pagamento(uuid,text,text,text,integer,text,text,jsonb) from public, anon, authenticated;

-- Invólucro público SÓ para service_role: o PostgREST não enxerga o
-- schema private, e a Edge Function precisa chamar por RPC.
create or replace function public.aplicar_evento_pagamento(
  p_intencao uuid, p_provider text, p_evento_id text, p_status_pagamento text,
  p_centavos_pagos integer, p_assinatura_externa text, p_cliente_externo text, p_dados jsonb
) returns jsonb language sql security definer set search_path = '' as $$
  select private.aplicar_evento_pagamento($1,$2,$3,$4,$5,$6,$7,$8);
$$;

revoke execute on function public.aplicar_evento_pagamento(uuid,text,text,text,integer,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.aplicar_evento_pagamento(uuid,text,text,text,integer,text,text,jsonb) to service_role;


-- =============================================================
-- 4 · O PLANO QUE VALE
-- -------------------------------------------------------------
-- DEFEITO DE SEGURANÇA CORRIGIDO AQUI. A versão anterior fazia
--
--   case when s.status in ('active','pending') then s.plan_id ...
--
-- 'pending' é o boleto emitido e ainda não compensado. Conceder ali
-- é entregar antes de receber: bastava iniciar um checkout para ter
-- Pro sem pagar nada, e nenhum erro apareceria.
--
-- A REGRA, EM UMA FRASE
-- Você tem o plano que pagou, enquanto durar o período que pagou.
--
-- E o downgrade agendado deixa de precisar de tarefa periódica: o
-- plano é CALCULADO na leitura, então vira no instante em que o
-- relógio passa. Um cron poderia atrasar; isto não pode.
--
-- Coberto por tools/testes/plano-efetivo.sql, nove casos.
-- =============================================================
create or replace function public.meus_direitos()
returns jsonb
language sql
stable
set search_path to ''
as $function$
  with s as (
    select * from public.subscriptions where user_id = (select auth.uid())
  ),
  calc as (
    select
      case
        when (select count(*) from s) = 0 then 'free'
        when (select status from s) in ('active', 'past_due', 'canceled') then
          case
            when (select current_period_end from s) is null
              or (select current_period_end from s) > now()
            then
              case
                when (select agendado_para from s) is not null
                 and (select agendado_para from s) <= now()
                then coalesce((select plano_agendado from s), 'free')
                else (select plan_id from s)
              end
            else coalesce((select plano_agendado from s), 'free')
          end
        else 'free'
      end as plano
  )
  select jsonb_build_object(
    'plano', (select plano from calc),
    'plano_contratado', (select plan_id from s),
    'status', coalesce((select status from s), 'free'),
    'ciclo', (select billing_cycle from s),
    'fim_periodo', (select current_period_end from s),
    'cancela_no_fim', coalesce((select cancel_at_period_end from s), false),
    'plano_agendado', (select plano_agendado from s),
    'agendado_para', (select agendado_para from s),
    'limites', coalesce((select jsonb_object_agg(e.chave, e.limite)
       from public.plan_entitlements e
       where e.tipo = 'limite' and e.plan_id = (select plano from calc)), '{}'::jsonb),
    'recursos', coalesce((select jsonb_object_agg(e.chave, e.ativo)
       from public.plan_entitlements e
       where e.tipo = 'recurso' and e.plan_id = (select plano from calc)), '{}'::jsonb)
  );
$function$;
