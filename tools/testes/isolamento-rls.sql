-- =============================================================
-- Teste de isolamento entre usuários (RLS)
-- -------------------------------------------------------------
-- Prova que o usuário B não alcança nada do usuário A -- nem para
-- ler, nem para alterar, nem para apagar, nem para se autoconvidar
-- ou se promover de plano.
--
-- COMO RODAR: cole inteiro no SQL Editor do Supabase, ou passe pelo
-- MCP. Tudo acontece dentro de uma transação; nenhuma linha
-- sobrevive. Os dois usuários de teste também não.
--
-- POR QUE O TESTE PRECISA DE DOIS CAMINHOS DE FALHA: o RLS bloqueia
-- de duas formas diferentes, e confundi-las esconde defeito.
--   · em SELECT/UPDATE/DELETE ele FILTRA -- a query roda e volta
--     zero linhas, sem erro nenhum;
--   · em INSERT ele RECUSA -- levanta 42501.
-- Um teste que só procurasse exceção passaria achando que o UPDATE
-- foi bloqueado quando na verdade ele alterou tudo.
-- =============================================================
begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','teste-a@oaze.local','x', now(), now(), now()),
       ('bbbbbbbb-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','teste-b@oaze.local','x', now(), now(), now());

create temp table resultado (teste text, obtido text, esperado text, passou boolean);
grant all on resultado to authenticated;

-- ---- A monta a casa dele ----
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';
insert into public.workspaces (id, owner_id, name) values ('11111111-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','Espaco do A');
insert into public.accounts (id, workspace_id, name) values ('33333333-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000001','Conta do A');
insert into public.transactions (id, workspace_id, kind, descricao, valor, data)
values ('22222222-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000001','expense','Segredo do A', 999, current_date);
insert into public.profiles (user_id, nome) values ('aaaaaaaa-0000-4000-8000-000000000001','Alice');

-- Confere que A consegue usar o próprio espaço. Sem isto, um RLS que
-- bloqueia TODO MUNDO passaria no teste de isolamento com louvor.
do $$
declare n int;
begin
  select count(*) into n from public.workspaces where id='11111111-0000-4000-8000-000000000001';
  insert into resultado values ('A ve o proprio espaco', n::text, '1', n=1);
  select count(*) into n from public.transactions where id='22222222-0000-4000-8000-000000000001';
  insert into resultado values ('A ve o proprio lancamento', n::text, '1', n=1);
  select count(*) into n from public.workspace_members where workspace_id='11111111-0000-4000-8000-000000000001';
  insert into resultado values ('A entrou como membro (gatilho)', n::text, '1', n=1);
end $$;

-- ---- B tenta alcançar o que é de A ----
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}';

do $$
declare n int;
begin
  select count(*) into n from public.transactions where id='22222222-0000-4000-8000-000000000001';
  insert into resultado values ('B LE lancamento de A', n::text, '0', n=0);
  select count(*) into n from public.workspaces where id='11111111-0000-4000-8000-000000000001';
  insert into resultado values ('B LE espaco de A', n::text, '0', n=0);
  select count(*) into n from public.accounts;
  insert into resultado values ('B LE conta de A', n::text, '0', n=0);
  select count(*) into n from public.profiles where user_id='aaaaaaaa-0000-4000-8000-000000000001';
  insert into resultado values ('B LE perfil de A', n::text, '0', n=0);
  select count(*) into n from public.workspace_members where workspace_id='11111111-0000-4000-8000-000000000001';
  insert into resultado values ('B LE membros do espaco de A', n::text, '0', n=0);

  begin
    update public.transactions set descricao='invadido' where id='22222222-0000-4000-8000-000000000001';
    get diagnostics n = row_count;
    insert into resultado values ('B ALTERA lancamento de A', n||' linhas', 'bloqueado', n=0);
  exception when insufficient_privilege then
    insert into resultado values ('B ALTERA lancamento de A', 'erro 42501', 'bloqueado', true);
  end;
  begin
    delete from public.accounts where id='33333333-0000-4000-8000-000000000001';
    get diagnostics n = row_count;
    insert into resultado values ('B APAGA conta de A', n||' linhas', 'bloqueado', n=0);
  exception when insufficient_privilege then
    insert into resultado values ('B APAGA conta de A', 'erro 42501', 'bloqueado', true);
  end;
  begin
    insert into public.transactions (workspace_id, kind, descricao, valor, data)
    values ('11111111-0000-4000-8000-000000000001','expense','plantado por B',1,current_date);
    insert into resultado values ('B INSERE no espaco de A', 'inseriu', 'bloqueado', false);
  exception when insufficient_privilege then
    insert into resultado values ('B INSERE no espaco de A', 'erro 42501', 'bloqueado', true);
  end;
  begin
    insert into public.workspace_members (workspace_id, user_id, papel)
    values ('11111111-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000002','owner');
    insert into resultado values ('B SE AUTO-CONVIDA para espaco de A', 'entrou', 'bloqueado', false);
  exception when insufficient_privilege then
    insert into resultado values ('B SE AUTO-CONVIDA para espaco de A', 'erro 42501', 'bloqueado', true);
  end;
  begin
    update public.subscriptions set plan_id='pro' where user_id='bbbbbbbb-0000-4000-8000-000000000002';
    get diagnostics n = row_count;
    insert into resultado values ('B SE PROMOVE para o plano Pro', n||' linhas', 'bloqueado', n=0);
  exception when insufficient_privilege then
    insert into resultado values ('B SE PROMOVE para o plano Pro', 'erro 42501', 'bloqueado', true);
  end;
end $$;

select teste, obtido, esperado, case when passou then 'PASSA' else 'FALHA' end as veredito from resultado;

-- Nada disso fica. Se você rodar no SQL Editor, confirme o rollback.
rollback;
