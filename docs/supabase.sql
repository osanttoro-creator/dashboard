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
--   • RLS ligado e forçado, com quatro políticas que amarram cada
--     linha ao seu dono, e o papel anônimo sem privilégio nenhum;
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
  removidos  jsonb       not null default '{}'::jsonb,
  meta       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Também atualiza projetos criados por uma versão anterior deste arquivo.
alter table public.dados
  add column if not exists removidos jsonb not null default '{}'::jsonb;

comment on table  public.dados            is 'Perfis do OAZE, um documento por usuário. Espelho do localStorage.';
comment on column public.dados.profiles   is 'Mapa id → perfil: contas, cartões, categorias, lançamentos, investimentos, faturas.';
comment on column public.dados.removidos  is 'Mapa id → data da exclusão, para propagá-la entre aparelhos.';
comment on column public.dados.meta       is 'Carimbo do último envio: quando e de qual aparelho.';

-- -------------------------------------------------------------
-- 2 · acesso pela Data API
-- -------------------------------------------------------------
-- Dependendo das configurações de Data API do projeto, uma tabela
-- criada por SQL NÃO fica automaticamente acessível pela API REST:
-- é preciso conceder acesso ao papel explicitamente. Sem isto o
-- app leva "permission denied" e o RLS nem chega a ser avaliado.
--
-- Só `authenticated` recebe acesso. `anon` fica de fora de
-- propósito: ninguém deslogado tem o que fazer nesta tabela.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.dados to authenticated;

-- O schema `public` do Supabase concede tudo a anon e authenticated por
-- padrão, então a tabela nasce acessível ao papel anônimo mesmo sem o
-- grant acima. O RLS já barra — as políticas são todas `to
-- authenticated`, e sem política aplicável o anônimo lê zero linhas.
-- Ainda assim tiramos: privilégio que não deveria existir é privilégio
-- esperando uma política distraída no futuro.
revoke all on public.dados from anon;

-- -------------------------------------------------------------
-- 3 · RLS — a proteção de verdade
-- -------------------------------------------------------------
-- A chave anon fica pública no front-end; é assim que o Supabase
-- foi desenhado. Quem impede um usuário de ler os dados de outro
-- é exclusivamente o que vem abaixo. Sem isto, a tabela é aberta.
alter table public.dados enable row level security;

-- Também vale para o dono da tabela, que por padrão escapa do RLS.
alter table public.dados force row level security;

drop policy if exists "dono lê a própria linha"       on public.dados;
drop policy if exists "dono cria a própria linha"     on public.dados;
drop policy if exists "dono atualiza a própria linha" on public.dados;
drop policy if exists "dono apaga a própria linha"    on public.dados;

-- Três detalhes em cada política, e cada um evita uma falha real:
--
--   TO authenticated — restringe o papel. Sem isso a política é
--     avaliada também para `anon`. (Não use auth.role() no lugar:
--     está descontinuado e quebra em silêncio com logins anônimos,
--     porque usuário anônimo também carrega o papel authenticated.)
--
--   (select auth.uid()) — o subselect faz o Postgres resolver a
--     função UMA vez, como initPlan, em vez de uma vez por linha.
--     Escrita solta, ela é reavaliada para cada linha varrida.
--
--   TO authenticated sozinho seria autenticação sem autorização —
--     todo mundo logado veria tudo. É o predicado de posse em
--     USING que amarra a linha ao dono.

create policy "dono lê a própria linha"
  on public.dados for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "dono cria a própria linha"
  on public.dados for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- `using` decide quais linhas ele pode alterar; `with check` impede
-- que a alteração transfira a linha para outro user_id. Sem o
-- `with check`, um usuário reatribui a própria linha a outra conta.
--
-- E a política de SELECT acima não serve só para ler: um UPDATE
-- precisa enxergar a linha antes de alterá-la. Sem ela, o update
-- volta com zero linhas afetadas e nenhum erro — falha silenciosa.
create policy "dono atualiza a própria linha"
  on public.dados for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "dono apaga a própria linha"
  on public.dados for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- -------------------------------------------------------------
-- 4 · updated_at confiável
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
-- 5 · mesclagem atômica entre aparelhos
-- -------------------------------------------------------------
create or replace function public.carimbo_perfil(p jsonb)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p) = 'number' and (p #>> '{}') ~ '^[0-9]{1,15}$' then (p #>> '{}')::bigint
    when jsonb_typeof(p) = 'string' and (p #>> '{}') ~ '^[0-9]{1,15}$' then (p #>> '{}')::bigint
    when jsonb_typeof(p) = 'object' and coalesce(p ->> 'updatedAt', '') ~ '^[0-9]{1,15}$' then (p ->> 'updatedAt')::bigint
    else 0
  end;
$$;

create or replace function public.mesclar_dados(
  p_profiles jsonb,
  p_removidos jsonb default '{}'::jsonb,
  p_meta jsonb default '{}'::jsonb
)
returns table (profiles jsonb, removidos jsonb, updated_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user uuid := auth.uid();
  v_perfis jsonb;
  v_rem jsonb;
  v_chave text;
  v_valor jsonb;
begin
  if v_user is null then
    raise exception 'sem_sessao' using errcode = '42501';
  end if;
  p_profiles := coalesce(p_profiles, '{}'::jsonb);
  p_removidos := coalesce(p_removidos, '{}'::jsonb);
  if jsonb_typeof(p_profiles) <> 'object' or jsonb_typeof(p_removidos) <> 'object' then
    raise exception 'corpo_invalido' using errcode = '22023';
  end if;
  if octet_length(p_profiles::text) > 5242880 then
    raise exception 'documento_grande' using errcode = '54000';
  end if;

  insert into public.dados (user_id, profiles, meta, removidos)
  values (v_user, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)
  on conflict (user_id) do nothing;

  select d.profiles, d.removidos into v_perfis, v_rem
    from public.dados d where d.user_id = v_user for update;
  v_perfis := coalesce(v_perfis, '{}'::jsonb);
  v_rem := coalesce(v_rem, '{}'::jsonb);

  for v_chave, v_valor in select e.key, e.value from jsonb_each(p_removidos) e loop
    if public.carimbo_perfil(v_valor) > public.carimbo_perfil(v_rem -> v_chave) then
      v_rem := jsonb_set(v_rem, array[v_chave], to_jsonb(public.carimbo_perfil(v_valor)));
    end if;
  end loop;
  for v_chave, v_valor in select e.key, e.value from jsonb_each(p_profiles) e loop
    continue when jsonb_typeof(v_valor) <> 'object';
    if not (v_perfis ? v_chave)
       or public.carimbo_perfil(v_valor) > public.carimbo_perfil(v_perfis -> v_chave) then
      v_perfis := jsonb_set(v_perfis, array[v_chave], v_valor);
    end if;
  end loop;
  for v_chave, v_valor in select e.key, e.value from jsonb_each(v_rem) e loop
    if (v_perfis ? v_chave)
       and public.carimbo_perfil(v_valor) >= public.carimbo_perfil(v_perfis -> v_chave) then
      v_perfis := v_perfis - v_chave;
    end if;
  end loop;

  update public.dados d
     set profiles = v_perfis, removidos = v_rem, meta = coalesce(p_meta, '{}'::jsonb)
   where d.user_id = v_user;
  return query select v_perfis, v_rem, now();
end;
$$;

revoke all on function public.mesclar_dados(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.mesclar_dados(jsonb, jsonb, jsonb) to authenticated;
revoke all on function public.carimbo_perfil(jsonb) from public, anon;
grant execute on function public.carimbo_perfil(jsonb) to authenticated;

-- -------------------------------------------------------------
-- 6 · Realtime — um aparelho avisando o outro
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
-- 7 · conferência
-- -------------------------------------------------------------
-- Deve devolver rowsecurity = true e as quatro políticas.
select relname, relrowsecurity as rls_ligado, relforcerowsecurity as rls_forcado
  from pg_class where oid = 'public.dados'::regclass;

select policyname, cmd from pg_policies
  where schemaname = 'public' and tablename = 'dados'
  order by cmd, policyname;
