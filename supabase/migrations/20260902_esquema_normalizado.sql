-- =============================================================
-- OAZE — esquema financeiro normalizado
-- -------------------------------------------------------------
-- Sai o documento único por usuário; entram tabelas por entidade.
-- A tabela `dados` NÃO é apagada: ela vira a origem da migração e
-- a rede de recuperação. Só depois de a migração ser conferida é
-- que ela deixa de ser lida.
--
-- O QUE MUDA DE NOME, E POR QUÊ
-- O que o app chama de "perfil" (Pessoal, Empresa) é um espaço
-- financeiro separado, com contas e lançamentos próprios. Isso é
-- um workspace, e chamá-lo assim abre a porta para compartilhar
-- depois sem remodelar nada. "Profile" fica reservado para o que
-- a palavra significa em todo lugar: os dados da PESSOA.
--
-- O QUE NÃO VIRA TABELA
-- `occ` (ajustes de uma ocorrência de recorrência) e `installment`
-- (parcelamento) continuam jsonb dentro da transação. Não são
-- entidades: são atributos que só existem para aquela linha e
-- nunca são consultados isoladamente. Normalizar isso criaria
-- duas tabelas para servir a zero consultas.
--
-- Recorrência também não vira tabela: no OAZE ela é uma transação
-- com `recurring = true` e um fim opcional. Separar quebraria a
-- edição em massa que o app já faz.
-- =============================================================

-- -------------------------------------------------------------
-- 0 · o schema privado
-- -------------------------------------------------------------
-- A checagem de participação precisa ler workspace_members de
-- dentro da política de workspaces — e a política de
-- workspace_members precisa ler workspaces. Isso é recursão
-- infinita no Postgres.
--
-- A saída é uma função SECURITY DEFINER, que roda com privilégio
-- do dono e não dispara RLS. Ela é perigosa por natureza, então
-- vem cercada: mora em schema NÃO exposto, tem o EXECUTE revogado
-- de PUBLIC (o Postgres concede a todos por padrão) e compara
-- internamente com auth.uid(). Não existe parâmetro que permita
-- perguntar pela participação de outra pessoa.
create schema if not exists private;
revoke all on schema private from anon, authenticated, public;

create or replace function private.eh_membro(ws uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws
      and m.user_id = (select auth.uid())
  );
$$;

revoke all on function private.eh_membro(uuid) from public, anon;
grant execute on function private.eh_membro(uuid) to authenticated;
grant usage on schema private to authenticated;

-- -------------------------------------------------------------
-- 1 · espaços financeiros
-- -------------------------------------------------------------
create table if not exists public.workspaces (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid        not null references auth.users (id) on delete cascade,
  name          text        not null,
  posicao       int         not null default 0,
  legacy_id     text,                       -- o id que este espaço tinha no localStorage
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  origem        text,                       -- aparelho que criou/alterou por último
  versao        int         not null default 1
);
create unique index if not exists workspaces_owner_legacy_idx
  on public.workspaces (owner_id, legacy_id) where legacy_id is not null;

comment on column public.workspaces.legacy_id is
  'Id do perfil no localStorage. É a chave da idempotência: reimportar o mesmo perfil não cria outro espaço.';
comment on column public.workspaces.versao is
  'Sobe a cada gravação. Serve para detectar conflito sem depender de relógio de aparelho.';

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  papel        text not null default 'owner',
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id),
  constraint workspace_members_papel_ck check (papel in ('owner', 'editor', 'viewer'))
);

-- -------------------------------------------------------------
-- 2 · as entidades financeiras
-- -------------------------------------------------------------
create table if not exists public.accounts (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid        not null references public.workspaces (id) on delete cascade,
  legacy_id       text,
  name            text        not null,
  bank            text        not null default '',
  tipo            text        not null default 'Conta corrente',
  cor             text        not null default '#8A7A62',
  gradiente       text,
  last4           text        not null default '',
  saldo_inicial   numeric(14,2) not null default 0,
  aberta_em       date        not null default current_date,
  arquivada       boolean     not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  origem          text,
  versao          int         not null default 1
);

create table if not exists public.credit_cards (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid        not null references public.workspaces (id) on delete cascade,
  legacy_id     text,
  name          text        not null,
  bank          text        not null default '',
  cor           text        not null default '#7B5A8E',
  gradiente     text,
  last4         text        not null default '',
  limite        numeric(14,2) not null default 0,
  dia_fechamento int        not null default 1,
  dia_vencimento int        not null default 10,
  account_id    uuid        references public.accounts (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  origem        text,
  versao        int         not null default 1,
  constraint credit_cards_dias_ck
    check (dia_fechamento between 1 and 31 and dia_vencimento between 1 and 31)
);

create table if not exists public.categories (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid        not null references public.workspaces (id) on delete cascade,
  legacy_id    text,
  name         text        not null,
  kind         text        not null,
  cor          text        not null default '#8A7A62',
  icone        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  origem       text,
  versao       int         not null default 1,
  constraint categories_kind_ck check (kind in ('income', 'expense'))
);

create table if not exists public.transactions (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid        not null references public.workspaces (id) on delete cascade,
  legacy_id       text,
  kind            text        not null,
  descricao       text        not null default '',
  valor           numeric(14,2) not null default 0,
  data            date        not null,
  category_id     uuid        references public.categories (id) on delete set null,
  metodo          text        not null default 'account',
  account_id      uuid        references public.accounts (id) on delete set null,
  to_account_id   uuid        references public.accounts (id) on delete set null,
  card_id         uuid        references public.credit_cards (id) on delete set null,
  recorrente      boolean     not null default false,
  recorrencia_fim text,
  confirmado      boolean     not null default true,
  -- Ajustes de uma ocorrência específica e dados de parcelamento.
  -- Atributos da linha, não entidades: ver o cabeçalho.
  ocorrencias     jsonb       not null default '{}'::jsonb,
  parcelamento    jsonb,
  notas           text        not null default '',
  origem_registro text        not null default 'manual',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  origem          text,
  versao          int         not null default 1,
  constraint transactions_kind_ck check (kind in ('income', 'expense', 'transfer')),
  constraint transactions_metodo_ck check (metodo in ('account', 'card')),
  constraint transactions_valor_ck check (valor >= 0)
);

-- A consulta quente é sempre "os lançamentos deste espaço neste mês".
create index if not exists transactions_ws_data_idx
  on public.transactions (workspace_id, data desc) where deleted_at is null;
create index if not exists transactions_ws_card_idx
  on public.transactions (workspace_id, card_id) where card_id is not null and deleted_at is null;

create table if not exists public.investments (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid        not null references public.workspaces (id) on delete cascade,
  legacy_id     text,
  name          text        not null,
  tipo          text        not null default 'Renda fixa',
  valor         numeric(14,2) not null default 0,
  data          date        not null,
  taxa          numeric(10,4) not null default 0,
  valor_atual   numeric(14,2),
  account_id    uuid        references public.accounts (id) on delete set null,
  notas         text        not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  origem        text,
  versao        int         not null default 1
);

-- Fatura paga: no localStorage era um mapa "cardId|YYYY-MM".
create table if not exists public.card_invoices (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid        not null references public.workspaces (id) on delete cascade,
  card_id      uuid        not null references public.credit_cards (id) on delete cascade,
  referencia   text        not null,
  paga         boolean     not null default true,
  paga_em      date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  origem       text,
  versao       int         not null default 1,
  unique (card_id, referencia)
);

-- Orçamento: um teto por categoria. Sem mês, como no app hoje.
create table if not exists public.budgets (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid        not null references public.workspaces (id) on delete cascade,
  category_id  uuid        not null references public.categories (id) on delete cascade,
  limite       numeric(14,2) not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  origem       text,
  versao       int         not null default 1,
  unique (workspace_id, category_id),
  constraint budgets_limite_ck check (limite > 0)
);

create table if not exists public.goals (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid        not null references public.workspaces (id) on delete cascade,
  legacy_id    text,
  name         text        not null,
  alvo         numeric(14,2) not null default 0,
  guardado     numeric(14,2) not null default 0,
  prazo        date,
  cor          text        not null default '#2E6E7E',
  icone        text        not null default 'target',
  account_id   uuid        references public.accounts (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  origem       text,
  versao       int         not null default 1
);

-- -------------------------------------------------------------
-- 3 · o que é do USUÁRIO, não do espaço
-- -------------------------------------------------------------
create table if not exists public.profiles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  nome        text,
  moeda       text        not null default 'BRL',
  pais        text        not null default 'BR',
  fuso        text        not null default 'America/Sao_Paulo',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Preferências que NÃO sincronizam entre aparelhos ficam no
-- localStorage. Aqui mora só o que faz sentido acompanhar a conta.
create table if not exists public.user_settings (
  user_id             uuid primary key references auth.users (id) on delete cascade,
  workspace_ativo_id  uuid references public.workspaces (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.onboarding_progress (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  etapa        text        not null default 'conta',
  dados        jsonb       not null default '{}'::jsonb,
  concluido_em timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- -------------------------------------------------------------
-- 4 · o diário da migração
-- -------------------------------------------------------------
-- É isto que torna a importação idempotente. Antes de migrar,
-- procura-se uma linha concluída com a mesma origem; se existe,
-- não migra de novo. Sem isso, um F5 no meio do processo duplicaria
-- um ano de lançamentos.
create table if not exists public.data_migrations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  origem      text        not null,
  status      text        not null default 'em_andamento',
  contagens   jsonb       not null default '{}'::jsonb,
  erro        text,
  created_at  timestamptz not null default now(),
  concluido_em timestamptz,
  constraint data_migrations_status_ck
    check (status in ('em_andamento', 'concluida', 'falhou'))
);
create unique index if not exists data_migrations_uma_por_origem_idx
  on public.data_migrations (user_id, origem) where status = 'concluida';

-- -------------------------------------------------------------
-- 5 · updated_at e versão, com a hora do servidor
-- -------------------------------------------------------------
-- O cliente manda os dois, mas relógio de celular erra e contador
-- de cliente pode repetir. Quem carimba é o servidor.
create or replace function public.toca_versao()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.versao := coalesce(old.versao, 0) + 1;
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'workspaces','accounts','credit_cards','categories','transactions',
    'investments','card_invoices','budgets','goals','profiles',
    'user_settings','onboarding_progress'
  ] loop
    execute format('drop trigger if exists %I_versao on public.%I', t, t);
    execute format(
      'create trigger %I_versao before insert or update on public.%I
         for each row execute function public.toca_versao()', t, t);
  end loop;
end;
$$;
