-- =============================================================
-- OAZE — índices que o RLS exige
-- -------------------------------------------------------------
-- Toda política filtra por workspace_id. Sem índice, cada consulta
-- de cada usuário faz varredura sequencial — e o custo cresce com
-- o tamanho da tabela INTEIRA, não com a parte dele. Num banco
-- multiusuário isso degrada para todos ao mesmo tempo, que é a
-- pior forma de degradar.
--
-- Os advisors do Supabase apontaram 16 chaves estrangeiras sem
-- cobertura. Estas são as correções.
-- =============================================================

create index if not exists accounts_ws_idx      on public.accounts (workspace_id);
create index if not exists credit_cards_ws_idx  on public.credit_cards (workspace_id);
create index if not exists categories_ws_idx    on public.categories (workspace_id);
create index if not exists investments_ws_idx   on public.investments (workspace_id);
create index if not exists card_invoices_ws_idx on public.card_invoices (workspace_id);
create index if not exists budgets_ws_idx       on public.budgets (workspace_id);
create index if not exists goals_ws_idx         on public.goals (workspace_id);

-- eh_membro() roda em cada linha avaliada: procurar a participação
-- pelo usuário é a consulta mais quente do banco.
create index if not exists workspace_members_user_idx on public.workspace_members (user_id);

-- Chaves de ligação, usadas em junção e em exclusão em cascata.
-- transactions_ws_card_idx tem card_id na segunda posição e por
-- isso NÃO cobre a checagem da chave estrangeira: o Postgres
-- precisa de um índice que comece pela coluna referenciada.
create index if not exists credit_cards_account_idx    on public.credit_cards (account_id);
create index if not exists transactions_account_idx    on public.transactions (account_id);
create index if not exists transactions_to_account_idx on public.transactions (to_account_id);
create index if not exists transactions_category_idx   on public.transactions (category_id);
create index if not exists transactions_card_idx       on public.transactions (card_id);
create index if not exists investments_account_idx     on public.investments (account_id);
create index if not exists goals_account_idx           on public.goals (account_id);
create index if not exists budgets_category_idx        on public.budgets (category_id);
create index if not exists user_settings_ws_idx        on public.user_settings (workspace_ativo_id);
