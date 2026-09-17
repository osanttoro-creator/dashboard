-- =============================================================
-- OAZE — cartões internacionais em outras moedas
-- -------------------------------------------------------------
-- Cartão de conta em dólar, euro ou libra (Nomad, Wise, Avenue...)
-- passa a ter fatura e limite na moeda dele, com a conversão para
-- real usada nos totais. Liberado a partir do Coqueiro, como pedido
-- em 17/09/2026: é recurso de quem já organiza mais de uma conta, e
-- não custa nada a mais no servidor (a conversão é local).
--
-- Nenhum dado muda. Só nasce o direito.
-- =============================================================
insert into public.plan_entitlements (plan_id, chave, tipo, ativo) values
  ('free',  'cartoes_internacionais', 'recurso', false),
  ('basic', 'cartoes_internacionais', 'recurso', true),
  ('pro',   'cartoes_internacionais', 'recurso', true)
on conflict (plan_id, chave) do update set ativo = excluded.ativo, tipo = excluded.tipo;
