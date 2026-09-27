-- OAZE — automações assistidas, sem movimentação automática.
-- As políticas das tabelas existentes já restringem por workspace_id;
-- nenhuma chave privilegiada ou nova superfície pública é criada.

alter table public.workspaces
  add column if not exists automation_data jsonb not null default
    '{"categoryRules":[],"merchantAliases":[],"recurrenceDecisions":{}}'::jsonb;

alter table public.transactions
  add column if not exists merchant_key text,
  add column if not exists classificacao jsonb,
  add column if not exists evidencia_recorrencia jsonb;

alter table public.goals
  add column if not exists category_id uuid references public.categories(id) on delete set null,
  add column if not exists contribuicao jsonb,
  add column if not exists depositos jsonb not null default '[]'::jsonb,
  add column if not exists automacao jsonb,
  add column if not exists propostas jsonb not null default '[]'::jsonb;

create index if not exists transactions_ws_merchant_data_idx
  on public.transactions (workspace_id, merchant_key, data desc)
  where deleted_at is null and merchant_key is not null;

comment on column public.workspaces.automation_data is
  'Regras confirmadas e decisões de sugestão do espaço. Não contém lançamentos financeiros.';
comment on column public.transactions.classificacao is
  'Origem, confiança e evidência legível da categoria inferida ou escolhida.';
comment on column public.transactions.evidencia_recorrencia is
  'Identifica o candidato e os lançamentos históricos usados para criar uma recorrência futura.';
comment on column public.goals.propostas is
  'Propostas mensais idempotentes. Só uma confirmação explícita vira depósito.';

-- Defesa em profundidade: mantém as mesmas garantias das tabelas financeiras.
alter table public.workspaces enable row level security;
alter table public.workspaces force row level security;
alter table public.transactions enable row level security;
alter table public.transactions force row level security;
alter table public.goals enable row level security;
alter table public.goals force row level security;
