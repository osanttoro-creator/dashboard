-- =============================================================
-- OAZE — esquema do Supabase
-- -------------------------------------------------------------
-- Rode este arquivo INTEIRO uma vez, no SQL Editor do seu projeto
-- (supabase.com/dashboard → seu projeto → SQL Editor → New query
-- → cole → Run).
--
-- Ele é idempotente: rodar de novo não quebra nada nem apaga dados.
--
-- O QUE ELE CRIA
--   • a tabela public.dados — uma linha por usuário, com todos os
--     perfis num campo jsonb;
--   • RLS ligado, com quatro políticas que amarram cada linha ao
--     seu dono;
--   • um gatilho que mantém updated_at honesto, mesmo que o
--     cliente minta;
--   • a publicação de Realtime, para um aparelho avisar o outro.
--
-- POR QUE jsonb E NÃO TABELAS NORMALIZADAS
-- O app nasceu em cima do localStorage e continua funcionando sem
-- nuvem nenhuma. A fonte da verdade é o navegador; o Supabase é
-- uma cópia sincronizada. Normalizar aqui obrigaria a manter duas
-- modelagens em sincronia e a migrar o banco a cada campo novo,
-- sem ganho nenhum: não existe consulta relacional do lado do
-- servidor. Um documento por usuário é a forma honesta disso.
-- =============================================================

create extension if not exists "pgcrypto";

-- -------------------------------------------------------------
-- 1 · a tabela
-- -------------------------------------------------------------
create table if not exists public.dados (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  profiles   jsonb       not null default '{}'::jsonb,
  meta       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table  public.dados            is 'Perfis do OAZE, um documento por usuário. Espelho do localStorage.';
comment on column public.dados.profiles   is 'Mapa id → perfil: contas, cartões, categorias, lançamentos, investimentos, faturas.';
comment on column public.dados.meta       is 'Carimbo do último envio: quando e de qual aparelho.';

-- -------------------------------------------------------------
-- 2 · RLS — a proteção de verdade
-- -------------------------------------------------------------
-- A chave anon fica pública no front-end; é assim que o Supabase
-- foi desenhado. Quem impede um usuário de ler os dados de outro
-- é exclusivamente o que vem abaixo. Sem isto, a tabela é aberta.
alter table public.dados enable row level security;

-- Também vale para o dono da tabela, que por padrão escapa do RLS.
alter table public.dados force row level security;

drop policy if exists "dono lê a própria linha"      on public.dados;
drop policy if exists "dono cria a própria linha"    on public.dados;
drop policy if exists "dono atualiza a própria linha" on public.dados;
drop policy if exists "dono apaga a própria linha"   on public.dados;

create policy "dono lê a própria linha"
  on public.dados for select
  using (auth.uid() = user_id);

create policy "dono cria a própria linha"
  on public.dados for insert
  with check (auth.uid() = user_id);

-- `using` decide quais linhas ele pode alterar; `with check` impede
-- que a alteração transfira a linha para outro user_id.
create policy "dono atualiza a própria linha"
  on public.dados for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "dono apaga a própria linha"
  on public.dados for delete
  using (auth.uid() = user_id);

-- -------------------------------------------------------------
-- 3 · updated_at confiável
-- -------------------------------------------------------------
-- O cliente manda updated_at no upsert, mas um relógio errado no
-- celular bagunçaria a ordem. O gatilho reescreve com a hora do
-- servidor, que é a única em que dá para confiar.
create or replace function public.dados_toca_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists dados_updated_at on public.dados;
create trigger dados_updated_at
  before insert or update on public.dados
  for each row execute function public.dados_toca_updated_at();

-- -------------------------------------------------------------
-- 4 · Realtime — um aparelho avisando o outro
-- -------------------------------------------------------------
-- Opcional. Sem isto tudo funciona; só não chega atualização
-- automática enquanto os dois aparelhos estão abertos.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dados'
  ) then
    alter publication supabase_realtime add table public.dados;
  end if;
end;
$$;

-- As mensagens de Realtime respeitam o RLS acima, então cada
-- sessão só recebe as mudanças da própria linha.

-- -------------------------------------------------------------
-- 5 · conferência
-- -------------------------------------------------------------
-- Deve devolver rowsecurity = true e as quatro políticas.
select relname, relrowsecurity as rls_ligado, relforcerowsecurity as rls_forcado
  from pg_class where oid = 'public.dados'::regclass;

select policyname, cmd from pg_policies
  where schemaname = 'public' and tablename = 'dados'
  order by cmd, policyname;
