-- =============================================================
-- OAZE — planos, preços, direitos e consumo
-- -------------------------------------------------------------
-- O BANCO É A AUTORIDADE. A configuração em assets/js/planos.js
-- existe para a interface orientar o usuário; ela não decide nada.
-- Quem decide é aqui, porque é aqui que o navegador não alcança.
--
-- DINHEIRO EM CENTAVOS, INTEIRO
-- 14,90 em ponto flutuante é 14.9000000000000003552713678800501.
-- Some isso doze vezes e a conta do plano anual não fecha. Preço é
-- inteiro em centavos, sempre, e a divisão só acontece na hora de
-- escrever na tela.
--
-- UMA ASSINATURA POR PESSOA
-- user_id é UNIQUE. "Evitar duas assinaturas simultâneas" deixa de
-- ser cuidado do código e passa a ser impossível — mudar de plano
-- altera a linha, e o histórico vive em subscription_events.
-- =============================================================

-- -------------------------------------------------------------
-- 1 · catálogo
-- -------------------------------------------------------------
create table if not exists public.plans (
  id          text primary key,
  nome        text        not null,
  descricao   text        not null default '',
  ordem       int         not null default 0,
  destaque    boolean     not null default false,
  ativo       boolean     not null default true,
  created_at  timestamptz not null default now(),
  constraint plans_id_ck check (id in ('free', 'basic', 'pro'))
);

comment on column public.plans.id is
  'Identificador técnico IMUTÁVEL. O nome visível pode mudar; isto não.';

insert into public.plans (id, nome, descricao, ordem, destaque) values
  ('free',  'Grátis', 'Para organizar o essencial e entender para onde vai o dinheiro.', 1, false),
  ('basic', 'Basic',  'Para quem já tem mais de uma conta e quer o histórico inteiro.',   2, true),
  ('pro',   'Pro',    'Para quem separa finanças por espaço e quer análise a fundo.',     3, false)
on conflict (id) do update
  set nome = excluded.nome, descricao = excluded.descricao,
      ordem = excluded.ordem, destaque = excluded.destaque;

-- -------------------------------------------------------------
-- 2 · preços, com versão
-- -------------------------------------------------------------
-- A versão existe para que uma alteração de preço não alcance quem
-- já assinou. A assinatura guarda a versão que contratou; o preço
-- novo vale para quem vier depois.
create table if not exists public.plan_prices (
  id                text primary key,
  plan_id           text        not null references public.plans (id) on delete cascade,
  ciclo             text        not null,
  centavos          int         not null,
  moeda             text        not null default 'BRL',
  versao            int         not null default 1,
  vigente           boolean     not null default true,
  external_price_id text,
  created_at        timestamptz not null default now(),
  constraint plan_prices_ciclo_ck check (ciclo in ('monthly', 'annual')),
  constraint plan_prices_centavos_ck check (centavos >= 0),
  constraint plan_prices_moeda_ck check (moeda = 'BRL')
);

comment on column public.plan_prices.external_price_id is
  'Id do preço no provedor de pagamento. Configurado por ambiente, NUNCA inventado: sem ele o checkout para antes de cobrar.';

create unique index if not exists plan_prices_vigente_idx
  on public.plan_prices (plan_id, ciclo) where vigente;

insert into public.plan_prices (id, plan_id, ciclo, centavos, versao) values
  ('free_monthly',  'free',  'monthly',     0, 1),
  ('free_annual',   'free',  'annual',      0, 1),
  ('basic_monthly', 'basic', 'monthly',  1490, 1),
  ('basic_annual',  'basic', 'annual',  14990, 1),
  ('pro_monthly',   'pro',   'monthly',  2990, 1),
  ('pro_annual',    'pro',   'annual',  29990, 1)
on conflict (id) do update set centavos = excluded.centavos;

-- -------------------------------------------------------------
-- 3 · direitos
-- -------------------------------------------------------------
-- Duas naturezas na mesma tabela, distinguidas por `tipo`:
--   limite  → um teto numérico; NULL significa ILIMITADO
--   recurso → tem ou não tem
--
-- NULL como "ilimitado" é deliberado. O outro caminho seria um
-- número enorme, e número enorme vaza para a interface: alguém
-- acabaria vendo "0 de 999999 contas".
create table if not exists public.plan_entitlements (
  plan_id text not null references public.plans (id) on delete cascade,
  chave   text not null,
  tipo    text not null,
  limite  int,
  ativo   boolean,
  primary key (plan_id, chave),
  constraint plan_entitlements_tipo_ck check (tipo in ('limite', 'recurso')),
  constraint plan_entitlements_coerente_ck check (
    (tipo = 'limite'  and ativo is null) or
    (tipo = 'recurso' and limite is null and ativo is not null)
  )
);

insert into public.plan_entitlements (plan_id, chave, tipo, limite) values
  -- ---- Grátis ----
  ('free', 'workspaces',           'limite', 1),
  ('free', 'accounts',             'limite', 2),
  ('free', 'credit_cards',         'limite', 1),
  ('free', 'custom_categories',    'limite', 10),
  ('free', 'budgets',              'limite', 2),
  ('free', 'goals',                'limite', 1),
  ('free', 'recurring_items',      'limite', 3),
  ('free', 'ai_queries_per_month', 'limite', 5),
  ('free', 'history_months',       'limite', 6),
  ('free', 'comparison_months',    'limite', 3),
  ('free', 'collaborators',        'limite', 0),
  -- ---- Basic ----  NULL = ilimitado
  ('basic', 'workspaces',           'limite', 2),
  ('basic', 'accounts',             'limite', 10),
  ('basic', 'credit_cards',         'limite', 5),
  ('basic', 'custom_categories',    'limite', null),
  ('basic', 'budgets',              'limite', null),
  ('basic', 'goals',                'limite', null),
  ('basic', 'recurring_items',      'limite', null),
  ('basic', 'ai_queries_per_month', 'limite', 50),
  ('basic', 'history_months',       'limite', null),
  ('basic', 'comparison_months',    'limite', 12),
  ('basic', 'collaborators',        'limite', 0),
  -- ---- Pro ----
  ('pro', 'workspaces',           'limite', 5),
  ('pro', 'accounts',             'limite', null),
  ('pro', 'credit_cards',         'limite', null),
  ('pro', 'custom_categories',    'limite', null),
  ('pro', 'budgets',              'limite', null),
  ('pro', 'goals',                'limite', null),
  ('pro', 'recurring_items',      'limite', null),
  ('pro', 'ai_queries_per_month', 'limite', 200),
  ('pro', 'history_months',       'limite', null),
  ('pro', 'comparison_months',    'limite', null),
  ('pro', 'collaborators',        'limite', 3)
on conflict (plan_id, chave) do update set limite = excluded.limite;

insert into public.plan_entitlements (plan_id, chave, tipo, ativo) values
  ('free',  'import_csv',        'recurso', false),
  ('free',  'import_ofx',        'recurso', false),
  ('free',  'export_csv',        'recurso', false),
  ('free',  'export_pdf',        'recurso', false),
  ('free',  'colaboracao',       'recurso', false),
  ('free',  'analises_avancadas','recurso', false),
  ('free',  'ia_simulacoes',     'recurso', false),
  ('free',  'relatorios_custom', 'recurso', false),
  ('free',  'suporte_prioritario','recurso', false),

  ('basic', 'import_csv',        'recurso', true),
  ('basic', 'import_ofx',        'recurso', false),
  ('basic', 'export_csv',        'recurso', true),
  ('basic', 'export_pdf',        'recurso', false),
  ('basic', 'colaboracao',       'recurso', false),
  ('basic', 'analises_avancadas','recurso', false),
  ('basic', 'ia_simulacoes',     'recurso', false),
  ('basic', 'relatorios_custom', 'recurso', false),
  ('basic', 'suporte_prioritario','recurso', false),

  ('pro',   'import_csv',        'recurso', true),
  ('pro',   'import_ofx',        'recurso', true),
  ('pro',   'export_csv',        'recurso', true),
  ('pro',   'export_pdf',        'recurso', true),
  ('pro',   'colaboracao',       'recurso', true),
  ('pro',   'analises_avancadas','recurso', true),
  ('pro',   'ia_simulacoes',     'recurso', true),
  ('pro',   'relatorios_custom', 'recurso', true),
  ('pro',   'suporte_prioritario','recurso', true)
on conflict (plan_id, chave) do update set ativo = excluded.ativo;

-- -------------------------------------------------------------
-- 4 · assinatura
-- -------------------------------------------------------------
drop table if exists public.subscriptions cascade;

create table public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid        not null unique references auth.users (id) on delete cascade,
  workspace_id             uuid        references public.workspaces (id) on delete set null,
  plan_id                  text        not null default 'free' references public.plans (id),
  billing_cycle            text        not null default 'monthly',
  status                   text        not null default 'free',
  provider                 text,
  external_customer_id     text,
  external_subscription_id text,
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  cancel_at_period_end     boolean     not null default false,
  canceled_at              timestamptz,
  price_version            int         not null default 1,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint subscriptions_status_ck
    check (status in ('free', 'pending', 'active', 'past_due', 'canceled', 'expired')),
  constraint subscriptions_ciclo_ck
    check (billing_cycle in ('monthly', 'annual'))
);

comment on table public.subscriptions is
  'Uma linha por usuário — user_id é UNIQUE. Duas assinaturas simultâneas não são evitadas por cuidado do código: são impossíveis.';

create index if not exists subscriptions_externo_idx
  on public.subscriptions (external_subscription_id) where external_subscription_id is not null;

-- -------------------------------------------------------------
-- 5 · consumo, contado de forma atômica
-- -------------------------------------------------------------
-- Contar linhas em ai_usage e depois inserir tem uma janela entre
-- as duas operações: dois pedidos simultâneos leem "4 de 5" e os
-- dois passam. Aqui o incremento e a checagem do teto acontecem na
-- MESMA instrução, e é o banco que serializa.
create table if not exists public.usage_counters (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  tipo       text        not null,
  periodo    text        not null,
  usado      int         not null default 0,
  limite     int         not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, tipo, periodo),
  constraint usage_counters_usado_ck check (usado >= 0)
);

comment on column public.usage_counters.periodo is
  'YYYY-MM no fuso do OAZE (America/Sao_Paulo), não em UTC: virar o mês às 21h do dia 30 seria surpresa.';

-- -------------------------------------------------------------
-- 6 · histórico de mudanças
-- -------------------------------------------------------------
-- É também a defesa contra webhook duplicado: o provedor reenvia o
-- mesmo evento quando não recebe confirmação, e sem esta chave
-- única o reenvio aplicaria a mudança duas vezes.
create table if not exists public.subscription_events (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users (id) on delete cascade,
  tipo              text        not null,
  de_plano          text,
  para_plano        text,
  de_status         text,
  para_status       text,
  provider          text,
  external_event_id text,
  dados             jsonb       not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create unique index if not exists subscription_events_externo_idx
  on public.subscription_events (provider, external_event_id)
  where external_event_id is not null;

create index if not exists subscription_events_user_idx
  on public.subscription_events (user_id, created_at desc);
