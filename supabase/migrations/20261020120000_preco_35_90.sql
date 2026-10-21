-- =============================================================
-- 20/10/2026 — Oásis a R$ 35,90/mês, anual com 35% de desconto
-- -------------------------------------------------------------
-- Decisão de Jonatham. A mensalidade sobe de R$ 29,90 para R$ 35,90 e
-- o anual passa a ser doze mensalidades menos 35%:
--
--   35,90 × 12 = 430,80   ·   −35% = 280,02   →   cobrado R$ 279,90
--
-- Os 12 centavos a menos existem por dois motivos: o produto escreve
-- preço terminando em ,90 em todas as moedas, e errar para baixo é o
-- único lado seguro de errar num número de venda (o desconto sai
-- 35,03%, nunca menos que os 35% anunciados).
--
-- Internacional: a mensalidade NÃO muda (US$ 7,99 e € 7,99); só o
-- anual recebe os mesmos 35%, 95,88 − 35% = 62,32 → 62,30. A regra da
-- tabela internacional continua valendo: todo preço de fora é maior
-- que o brasileiro no câmbio do dia (US$ 7,99 ≈ R$ 41, contra
-- R$ 35,90; US$ 62,30 ≈ R$ 324, contra R$ 279,90).
--
-- O selo de desconto volta a ser "−35%": 35% de doze meses são 4,2
-- mensalidades, e "4 meses grátis" seria prometer menos do que se dá.
-- =============================================================

begin;

-- O índice plan_prices_vigente_idx é parcial (plan_id, ciclo, moeda)
-- where vigente: o preço antigo cai antes de o novo entrar, na mesma
-- transação, para que o plano nunca fique sem preço vigente.
update public.plan_prices
   set vigente = false
 where plan_id = 'pro'
   and vigente;

insert into public.plan_prices (id, plan_id, ciclo, centavos, moeda, versao, vigente) values
  ('pro_monthly_v5',     'pro', 'monthly',  3590, 'BRL', 5, true),
  ('pro_annual_v5',      'pro', 'annual',  27990, 'BRL', 5, true),
  ('pro_monthly_usd_v3', 'pro', 'monthly',   799, 'USD', 3, true),
  ('pro_annual_usd_v3',  'pro', 'annual',   6230, 'USD', 3, true),
  ('pro_monthly_eur_v3', 'pro', 'monthly',   799, 'EUR', 3, true),
  ('pro_annual_eur_v3',  'pro', 'annual',   6230, 'EUR', 3, true)
on conflict (id) do update
  set centavos = excluded.centavos,
      moeda    = excluded.moeda,
      versao   = excluded.versao,
      vigente  = excluded.vigente;

commit;
