-- Índice da chave estrangeira criada pelas automações assistidas.
-- Evita varredura completa ao filtrar ou remover categorias ligadas a metas.

create index if not exists goals_category_id_idx
  on public.goals (category_id);
