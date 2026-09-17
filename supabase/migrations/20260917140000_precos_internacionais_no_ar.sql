-- =============================================================
-- OAZE — liga o preço em dólar e em euro
-- -------------------------------------------------------------
-- RODE SÓ DEPOIS DE PUBLICAR A FUNÇÃO oaze-pagamento (a versão que
-- filtra plan_prices por moeda) E A oaze-stripe-webhook (a que
-- concilia com intencao.moeda em vez de 'BRL' fixo).
--
-- Antes disso, três moedas vigentes fazem a função antiga receber
-- "mais de uma linha" na busca do preço e recusar TODO checkout,
-- inclusive o em real. Esta é a única razão de existirem duas
-- migrações para uma decisão só.
--
-- Para conferir que a hora chegou:
--   supabase functions list        → oaze-pagamento numa versão nova
--   ou: o log da função registra checkout_criado com {moeda}
-- =============================================================
update public.plan_prices set vigente = true
 where moeda in ('USD', 'EUR')
   and id in ('basic_monthly_usd_v1', 'basic_annual_usd_v1', 'pro_monthly_usd_v1', 'pro_annual_usd_v1',
              'basic_monthly_eur_v1', 'basic_annual_eur_v1', 'pro_monthly_eur_v1', 'pro_annual_eur_v1',
              'free_monthly_usd_v1', 'free_annual_usd_v1', 'free_monthly_eur_v1', 'free_annual_eur_v1');
