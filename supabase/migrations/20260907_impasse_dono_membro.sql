-- =============================================================
-- O impasse do dono que não conseguia entrar no próprio espaço
-- -------------------------------------------------------------
-- SINTOMA: todas as tabelas do esquema normalizado com zero linhas,
-- em produção, semanas depois de criadas.
--
-- CAUSA: a política de INSERT em workspace_members ("dono convida")
-- lia workspaces para confirmar a posse. Mas workspaces também está
-- sob RLS, e o SELECT dela é private.eh_membro(id) -- que consulta
-- workspace_members. Para virar membro era preciso ler o espaço;
-- para ler o espaço era preciso já ser membro.
--
-- Criar o espaço funcionava. Entrar nele, nunca. E como toda tabela
-- financeira depende de eh_membro, TODAS ficaram inalcançáveis. O
-- esquema não estava sem uso: estava impossível de usar.
--
-- POR QUE PASSOU DESPERCEBIDO: a revisão de política olha cada
-- política isolada, e cada uma delas está correta. O defeito só
-- aparece quando duas se referenciam em ciclo -- e nenhum lint pega
-- isso. Só aparece executando, com um usuário de verdade.
-- =============================================================

-- ---- 1 · o dono entra por gatilho, não por política ----
-- Um espaço sem dono dentro dele não é estado que deva existir nem
-- por um instante. No gatilho, e não no cliente, não há como criar
-- um espaço órfão -- nem por bug do app, nem por chamada direta.
create or replace function private.dono_entra_no_espaco()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, papel)
  values (new.id, new.owner_id, 'owner')
  on conflict (workspace_id, user_id) do nothing;
  return new;
end;
$$;

revoke execute on function private.dono_entra_no_espaco() from public, anon, authenticated;

drop trigger if exists ao_criar_espaco on public.workspaces;
create trigger ao_criar_espaco
  after insert on public.workspaces
  for each row execute function private.dono_entra_no_espaco();

-- ---- 2 · a política de convite passa a enxergar o espaço ----
-- eh_dono é SECURITY DEFINER pelo mesmo motivo que eh_membro já era:
-- a política precisa consultar workspaces sem esbarrar no RLS de
-- workspaces. Fica em private, que o PostgREST não expõe, e sem
-- EXECUTE para anon -- só é alcançável de dentro da política.
create or replace function private.eh_dono(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspaces w
    where w.id = ws and w.owner_id = (select auth.uid()) and w.deleted_at is null
  );
$$;

revoke execute on function private.eh_dono(uuid) from public, anon;
grant execute on function private.eh_dono(uuid) to authenticated;

drop policy if exists "dono convida" on public.workspace_members;
create policy "dono convida" on public.workspace_members
  for insert to authenticated
  with check (private.eh_dono(workspace_id));

-- O dono nunca pode se remover: espaço sem dono é espaço que ninguém
-- administra nem apaga. Para sair de vez, apaga-se o espaço.
drop policy if exists "dono remove" on public.workspace_members;
create policy "dono remove" on public.workspace_members
  for delete to authenticated
  using (private.eh_dono(workspace_id) and user_id <> (select auth.uid()));

-- ---- 3 · o membro precisa ver os outros membros ----
-- A política de SELECT só deixava ver a própria linha. Com
-- colaboradores no Pro, a tela de participantes mostraria só quem
-- está olhando -- uma lista de um item, sempre.
drop policy if exists "vê a própria participação" on public.workspace_members;
drop policy if exists "vê os membros do espaço" on public.workspace_members;
create policy "vê os membros do espaço" on public.workspace_members
  for select to authenticated
  using (private.eh_membro(workspace_id));
