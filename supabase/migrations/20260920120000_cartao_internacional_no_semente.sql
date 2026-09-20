-- =============================================================
-- OAZE — cartão em outra moeda desde o Semente
-- -------------------------------------------------------------
-- Em 17/09/2026 o cartão internacional nasceu a partir do Coqueiro.
-- Três dias de uso mostraram o contrário do que a régua supunha:
-- quem tem uma conta em dólar normalmente tem UMA conta — é a pessoa
-- que mora fora, o freelancer que recebe de fora, o estudante com
-- cartão internacional. O limite de plano batia justo em quem o
-- recurso existia para atender, e o recurso não custa nada a mais no
-- servidor: a conversão é conta feita no navegador.
--
-- O direito muda; nenhum dado muda.
-- =============================================================
insert into public.plan_entitlements (plan_id, chave, tipo, ativo) values
  ('free',  'cartoes_internacionais', 'recurso', true),
  ('basic', 'cartoes_internacionais', 'recurso', true),
  ('pro',   'cartoes_internacionais', 'recurso', true)
on conflict (plan_id, chave) do update set ativo = excluded.ativo, tipo = excluded.tipo;
