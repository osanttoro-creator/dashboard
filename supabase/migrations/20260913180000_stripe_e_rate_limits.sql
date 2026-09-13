-- =============================================================
-- OAZE — Stripe e limite de requisições das Edge Functions
-- -------------------------------------------------------------
-- A chave secreta da Stripe nunca fica no banco nem no navegador.
-- As tabelas abaixo guardam apenas identificadores do provedor e o
-- preço que o servidor leu de plan_prices.
-- =============================================================

-- 1 · limite curto para endpoints de servidor
create table if not exists public.api_rate_limits (
  identificador_hash text        not null,
  escopo             text        not null,
  janela_inicio      timestamptz not null,
  janela_fim         timestamptz not null,
  usado              bigint      not null default 1,
  updated_at         timestamptz not null default now(),
  primary key (identificador_hash, escopo, janela_inicio),
  constraint api_rate_limits_hash_ck check (length(identificador_hash) between 32 and 128),
  constraint api_rate_limits_escopo_ck check (length(escopo) between 1 and 80),
  constraint api_rate_limits_usado_ck check (usado >= 0),
  constraint api_rate_limits_janela_ck check (janela_fim > janela_inicio)
);

alter table public.api_rate_limits enable row level security;
alter table public.api_rate_limits force row level security;
revoke all on public.api_rate_limits from public, anon, authenticated;

comment on table public.api_rate_limits is
  'Contadores efêmeros de Edge Functions. Identificador já chega com SHA-256; não guarda token, e-mail nem IP em claro.';

create or replace function public.reservar_rate_limit(
  p_identificador_hash text,
  p_escopo text,
  p_limite integer,
  p_janela_segundos integer
)
returns table (out_permitido boolean, out_restante integer, out_tentar_em integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agora timestamptz := clock_timestamp();
  v_inicio timestamptz;
  v_fim timestamptz;
  v_usado bigint;
begin
  if p_identificador_hash !~ '^[a-f0-9]{64}$'
     or p_escopo !~ '^[a-z0-9:_-]{1,80}$'
     or p_limite < 1 or p_limite > 100000
     or p_janela_segundos < 1 or p_janela_segundos > 2678400 then
    raise exception 'rate_limit_invalido';
  end if;

  v_inicio := to_timestamp(
    floor(extract(epoch from v_agora) / p_janela_segundos) * p_janela_segundos
  );
  v_fim := v_inicio + make_interval(secs => p_janela_segundos);

  insert into public.api_rate_limits
    (identificador_hash, escopo, janela_inicio, janela_fim, usado, updated_at)
  values
    (p_identificador_hash, p_escopo, v_inicio, v_fim, 1, v_agora)
  on conflict (identificador_hash, escopo, janela_inicio)
  do update set
    usado = least(public.api_rate_limits.usado + 1, 100001),
    updated_at = excluded.updated_at
  returning usado into v_usado;

  -- Limpeza oportunista e limitada ao mesmo identificador. Não
  -- transforma toda requisição numa varredura da tabela.
  delete from public.api_rate_limits
   where identificador_hash = p_identificador_hash
     and janela_fim < v_agora - interval '2 days';

  return query select
    v_usado <= p_limite,
    greatest(0, p_limite - least(v_usado, p_limite))::integer,
    greatest(1, ceil(extract(epoch from (v_fim - v_agora))))::integer;
end;
$$;

revoke execute on function public.reservar_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.reservar_rate_limit(text, text, integer, integer)
  to service_role;

-- O plano intermediário não existia quando ai_rate_limits nasceu.
insert into public.ai_rate_limits
  (plan, por_minuto, por_dia, por_mes, max_entrada_chars, max_saida_tokens)
values ('basic', 6, 100, 60, 8000, 900)
on conflict (plan) do nothing;

-- 2 · intenções e eventos da Stripe — somente servidor
create table if not exists public.stripe_intencoes (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  plan_id                text not null references public.plans(id),
  ciclo                  text not null check (ciclo in ('monthly', 'annual')),
  price_id               text not null references public.plan_prices(id),
  centavos               integer not null check (centavos > 0),
  versao                 integer not null,
  checkout_session_id    text unique,
  stripe_subscription_id text unique,
  status                 text not null default 'aguardando'
                         check (status in ('aguardando', 'ativa', 'cancelada', 'estornada', 'falhou', 'expirada')),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists stripe_intencoes_user_idx
  on public.stripe_intencoes (user_id, created_at desc);
create index if not exists stripe_intencoes_plan_idx
  on public.stripe_intencoes (plan_id);
create index if not exists stripe_intencoes_price_idx
  on public.stripe_intencoes (price_id);

create table if not exists public.stripe_eventos (
  id          text primary key,
  evento      text not null,
  processado  boolean not null default false,
  recebido_em timestamptz not null default now()
);

alter table public.stripe_intencoes enable row level security;
alter table public.stripe_intencoes force row level security;
alter table public.stripe_eventos enable row level security;
alter table public.stripe_eventos force row level security;
revoke all on public.stripe_intencoes, public.stripe_eventos
  from public, anon, authenticated;

comment on table public.stripe_intencoes is
  'Preço e plano combinados no servidor antes de abrir o Checkout da Stripe. Sem cartão e sem conteúdo financeiro.';
comment on table public.stripe_eventos is
  'Idempotência dos webhooks assinados da Stripe.';

alter table public.subscriptions
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

create unique index if not exists subscriptions_stripe_customer_uidx
  on public.subscriptions (stripe_customer_id)
  where stripe_customer_id is not null;
create unique index if not exists subscriptions_stripe_subscription_uidx
  on public.subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;

-- Índices que faltavam nas FKs quentes, apontados pelo advisor.
create index if not exists subscriptions_workspace_idx
  on public.subscriptions (workspace_id);
create index if not exists subscriptions_plan_idx
  on public.subscriptions (plan_id);
create index if not exists asaas_intencoes_plan_idx
  on public.asaas_intencoes (plan_id);
create index if not exists asaas_intencoes_price_idx
  on public.asaas_intencoes (price_id);
