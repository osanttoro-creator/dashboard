-- =============================================================
-- OAZE — RLS do esquema normalizado
-- -------------------------------------------------------------
-- Um padrão, repetido sem exceção em todas as tabelas do espaço:
--
--   TO authenticated            restringe o papel
--   private.eh_membro(ws_id)    restringe a QUEM
--   USING + WITH CHECK no UPDATE  impede transferir a linha
--
-- `TO authenticated` sozinho seria autenticação sem autorização:
-- todo mundo logado veria tudo. É a segunda linha que amarra.
--
-- O `with check` no UPDATE existe por um motivo concreto: sem ele
-- um membro moveria a própria linha para o workspace de outra
-- pessoa, e o dado apareceria lá dentro. E a política de SELECT
-- não é só leitura — um UPDATE precisa enxergar a linha antes de
-- alterá-la; sem SELECT, o update volta com zero linhas e nenhum
-- erro. Falha silenciosa é a pior categoria.
-- =============================================================

-- -------------------------------------------------------------
-- 1 · privilégios: revogar antes de conceder
-- -------------------------------------------------------------
-- O schema public do Supabase concede tudo aos dois papéis por
-- padrão. Zeramos e devolvemos só o necessário — e `anon` não
-- recebe nada: nenhuma destas tabelas tem o que fazer deslogado.
do $$
declare t text;
begin
  foreach t in array array[
    'workspaces','workspace_members','accounts','credit_cards','categories',
    'transactions','investments','card_invoices','budgets','goals',
    'profiles','user_settings','onboarding_progress','data_migrations'
  ] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end;
$$;

-- -------------------------------------------------------------
-- 2 · workspaces
-- -------------------------------------------------------------
drop policy if exists "membro lê o espaço"      on public.workspaces;
drop policy if exists "dono cria o espaço"      on public.workspaces;
drop policy if exists "membro altera o espaço"  on public.workspaces;
drop policy if exists "dono apaga o espaço"     on public.workspaces;

create policy "membro lê o espaço"
  on public.workspaces for select to authenticated
  using (private.eh_membro(id));

-- Criar exige ser o dono declarado: ninguém cria espaço em nome
-- de outra pessoa.
create policy "dono cria o espaço"
  on public.workspaces for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "membro altera o espaço"
  on public.workspaces for update to authenticated
  using (private.eh_membro(id))
  with check (private.eh_membro(id) and (select auth.uid()) = owner_id);

create policy "dono apaga o espaço"
  on public.workspaces for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- -------------------------------------------------------------
-- 3 · participação
-- -------------------------------------------------------------
-- Ler a própria participação não passa por eh_membro, senão a
-- função consultaria a tabela cuja política estamos definindo.
drop policy if exists "vê a própria participação"  on public.workspace_members;
drop policy if exists "dono convida"               on public.workspace_members;
drop policy if exists "dono remove"                on public.workspace_members;

create policy "vê a própria participação"
  on public.workspace_members for select to authenticated
  using ((select auth.uid()) = user_id);

-- Só o dono do espaço adiciona membros — e a checagem vai direto
-- na tabela workspaces, não em eh_membro, para não recursar.
create policy "dono convida"
  on public.workspace_members for insert to authenticated
  with check (exists (
    select 1 from public.workspaces w
    where w.id = workspace_id and w.owner_id = (select auth.uid())
  ));

create policy "dono remove"
  on public.workspace_members for delete to authenticated
  using (exists (
    select 1 from public.workspaces w
    where w.id = workspace_id and w.owner_id = (select auth.uid())
  ));

-- -------------------------------------------------------------
-- 4 · as tabelas do espaço, todas com o mesmo padrão
-- -------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'accounts','credit_cards','categories','transactions',
    'investments','card_invoices','budgets','goals'
  ] loop
    execute format('drop policy if exists "membro lê" on public.%I', t);
    execute format('drop policy if exists "membro cria" on public.%I', t);
    execute format('drop policy if exists "membro altera" on public.%I', t);
    execute format('drop policy if exists "membro apaga" on public.%I', t);

    execute format($p$
      create policy "membro lê" on public.%I for select to authenticated
        using (private.eh_membro(workspace_id))$p$, t);

    execute format($p$
      create policy "membro cria" on public.%I for insert to authenticated
        with check (private.eh_membro(workspace_id))$p$, t);

    -- using diz quais linhas pode alterar; with check impede que a
    -- alteração empurre a linha para outro espaço.
    execute format($p$
      create policy "membro altera" on public.%I for update to authenticated
        using (private.eh_membro(workspace_id))
        with check (private.eh_membro(workspace_id))$p$, t);

    execute format($p$
      create policy "membro apaga" on public.%I for delete to authenticated
        using (private.eh_membro(workspace_id))$p$, t);
  end loop;
end;
$$;

-- -------------------------------------------------------------
-- 5 · as tabelas do USUÁRIO
-- -------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles','user_settings','onboarding_progress','data_migrations'] loop
    execute format('drop policy if exists "dono lê" on public.%I', t);
    execute format('drop policy if exists "dono cria" on public.%I', t);
    execute format('drop policy if exists "dono altera" on public.%I', t);
    execute format('drop policy if exists "dono apaga" on public.%I', t);

    execute format($p$
      create policy "dono lê" on public.%I for select to authenticated
        using ((select auth.uid()) = user_id)$p$, t);

    execute format($p$
      create policy "dono cria" on public.%I for insert to authenticated
        with check ((select auth.uid()) = user_id)$p$, t);

    execute format($p$
      create policy "dono altera" on public.%I for update to authenticated
        using ((select auth.uid()) = user_id)
        with check ((select auth.uid()) = user_id)$p$, t);
  end loop;
end;
$$;

-- data_migrations não ganha DELETE de propósito: apagar o diário
-- da migração é apagar a idempotência, e a importação inteira
-- rodaria de novo em cima dos dados já importados.
drop policy if exists "dono apaga" on public.profiles;
create policy "dono apaga" on public.profiles for delete to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "dono apaga" on public.user_settings;
create policy "dono apaga" on public.user_settings for delete to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "dono apaga" on public.onboarding_progress;
create policy "dono apaga" on public.onboarding_progress for delete to authenticated
  using ((select auth.uid()) = user_id);
