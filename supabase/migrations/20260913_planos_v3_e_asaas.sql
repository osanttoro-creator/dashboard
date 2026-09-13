-- =============================================================
-- OAZE — planos v3 (Semente, Coqueiro, Oásis) e cobrança pelo Asaas
-- -------------------------------------------------------------
-- Roda DEPOIS de 20260912232434_remove_payment_providers.sql.
--
-- NOMES
-- Os ids continuam free, basic e pro: eles estão em assinaturas,
-- direitos, Edge Functions e testes, e renomear id é migração de
-- dado sem ganho nenhum. Muda só o que a pessoa lê.
--
-- PREÇOS (versão 3), calculados pelo custo e não pela concorrência
--   Coqueiro  R$ 14,90/mês · R$ 149,90/ano
--   Oásis     R$ 29,90/mês · R$ 299,90/ano
-- A linha antiga é aposentada, não sobrescrita: quem assinou numa
-- versão continua nela (subscriptions.price_version).
--
-- LIMITES
-- Todo plano tem teto. Ilimitado ficou só onde o custo não cresce
-- com o uso: histórico e comparação no Oásis, e cartões e
-- movimentações no Oásis. Nada é apagado por um teto mais baixo:
-- quem estiver acima continua vendo e usando, só não cria novos.
-- =============================================================

-- -------------------------------------------------------------
-- 1 · nomes
-- -------------------------------------------------------------
update public.plans set nome = 'Semente',
  descricao = 'Plante o hábito de olhar o mês.' where id = 'free';
update public.plans set nome = 'Coqueiro',
  descricao = 'Raiz firme: contas, cartões e histórico.' where id = 'basic';
update public.plans set nome = 'Oásis',
  descricao = 'Tudo o que o OAZE faz, sem teto no dia a dia.' where id = 'pro';

-- -------------------------------------------------------------
-- 2 · preços — versão 3
-- -------------------------------------------------------------
update public.plan_prices set vigente = false
 where plan_id in ('basic', 'pro') and vigente;

insert into public.plan_prices (id, plan_id, ciclo, centavos, versao, vigente) values
  ('basic_monthly_v3', 'basic', 'monthly',  1490, 3, true),
  ('basic_annual_v3',  'basic', 'annual',  14990, 3, true),
  ('pro_monthly_v3',   'pro',   'monthly',  2990, 3, true),
  ('pro_annual_v3',    'pro',   'annual',  29990, 3, true)
on conflict (id) do update
  set centavos = excluded.centavos, versao = excluded.versao, vigente = excluded.vigente;

-- -------------------------------------------------------------
-- 3 · limites (NULL = sem teto)
-- -------------------------------------------------------------
insert into public.plan_entitlements (plan_id, chave, tipo, limite) values
  ('free', 'workspaces',             'limite', 1),
  ('free', 'accounts',               'limite', 2),
  ('free', 'credit_cards',           'limite', 3),
  ('free', 'transactions_per_month', 'limite', 100),
  ('free', 'custom_categories',      'limite', 10),
  ('free', 'budgets',                'limite', 1),
  ('free', 'goals',                  'limite', 1),
  ('free', 'recurring_items',        'limite', 3),
  ('free', 'ai_queries_per_month',   'limite', 10),
  ('free', 'history_months',         'limite', 3),
  ('free', 'comparison_months',      'limite', 1),
  ('free', 'collaborators',          'limite', 0),

  ('basic', 'workspaces',             'limite', 1),
  ('basic', 'accounts',               'limite', 10),
  ('basic', 'credit_cards',           'limite', 10),
  ('basic', 'transactions_per_month', 'limite', 1000),
  ('basic', 'custom_categories',      'limite', 50),
  ('basic', 'budgets',                'limite', 20),
  ('basic', 'goals',                  'limite', 10),
  ('basic', 'recurring_items',        'limite', 30),
  ('basic', 'ai_queries_per_month',   'limite', 60),
  ('basic', 'history_months',         'limite', 24),
  ('basic', 'comparison_months',      'limite', 24),
  ('basic', 'collaborators',          'limite', 0),

  ('pro', 'workspaces',             'limite', 5),
  ('pro', 'accounts',               'limite', 50),
  ('pro', 'credit_cards',           'limite', null),
  ('pro', 'transactions_per_month', 'limite', null),
  ('pro', 'custom_categories',      'limite', 200),
  ('pro', 'budgets',                'limite', 100),
  ('pro', 'goals',                  'limite', 50),
  ('pro', 'recurring_items',        'limite', 150),
  ('pro', 'ai_queries_per_month',   'limite', 200),
  ('pro', 'history_months',         'limite', null),
  ('pro', 'comparison_months',      'limite', null),
  ('pro', 'collaborators',          'limite', 3)
on conflict (plan_id, chave) do update set limite = excluded.limite;

-- -------------------------------------------------------------
-- 4 · Asaas
-- -------------------------------------------------------------
-- Três tabelas que só o servidor toca. RLS ligado e NENHUMA
-- política: o navegador (anon/authenticated) não lê nem escreve; a
-- Edge Function usa a chave de serviço. O CPF não é guardado em
-- lugar nenhum daqui — ele vai direto para o Asaas.

-- o cliente do Asaas de cada usuário (um por pessoa)
create table if not exists public.asaas_clientes (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  customer_id text not null unique,
  created_at  timestamptz not null default now()
);

-- cada tentativa de assinar: é o externalReference no Asaas, e é
-- por ela que o aviso de pagamento chega ao usuário, ao plano e ao
-- valor combinado — nunca pelo que vem no corpo do aviso
create table if not exists public.asaas_intencoes (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  plan_id               text not null references public.plans(id),
  ciclo                 text not null check (ciclo in ('monthly', 'annual')),
  price_id              text not null references public.plan_prices(id),
  centavos              integer not null check (centavos > 0),
  versao                integer not null,
  asaas_subscription_id text unique,
  status                text not null default 'aguardando'
                        check (status in ('aguardando', 'paga', 'cancelada', 'estornada', 'falhou')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists asaas_intencoes_user_idx on public.asaas_intencoes (user_id);

-- idempotência: o Asaas reenvia avisos; o mesmo evento não pode
-- ser aplicado duas vezes
create table if not exists public.asaas_eventos (
  id          text primary key,
  evento      text not null,
  processado  boolean not null default false,
  recebido_em timestamptz not null default now()
);

alter table public.asaas_clientes  enable row level security;
alter table public.asaas_intencoes enable row level security;
alter table public.asaas_eventos   enable row level security;
revoke all on public.asaas_clientes, public.asaas_intencoes, public.asaas_eventos
  from anon, authenticated;

-- a assinatura aponta para a do Asaas, para cancelar e conciliar
alter table public.subscriptions
  add column if not exists asaas_subscription_id text unique;
