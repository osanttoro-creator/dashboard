-- =============================================================
-- OAZE — preço em dólar e em euro
-- -------------------------------------------------------------
-- O site passou a existir em inglês, francês e espanhol em
-- 17/09/2026. Cobrar R$ 29,90 de quem chega pelo /en é vender por
-- US$ 5,50 o que os concorrentes de lá cobram a US$ 8 e US$ 15.
--
-- A tabela internacional é ESCRITA, não convertida: nenhuma cotação
-- entra aqui, porque preço que muda sozinho com o câmbio é preço que
-- ninguém consegue anunciar. O desconto anual de fora é maior (27%)
-- que o do Brasil (16%) porque é assim que aquele mercado compra.
--
-- POR QUE É SEGURO DEIXAR QUALQUER PESSOA ESCOLHER A MOEDA
-- Todo preço internacional é maior que o brasileiro no câmbio do dia
-- (US$ 3,99 ≈ R$ 21, contra R$ 14,90). Não há arbitragem: quem
-- escolhe dólar paga mais. Por isso o servidor não pede prova de
-- país nenhuma — ele só confere se a moeda existe na tabela e cobra
-- o valor que está AQUI, nunca o que o navegador mandar.
--
-- O índice único passa a incluir a moeda: antes só podia existir um
-- preço vigente por (plano, ciclo), o que era exatamente o que
-- impedia esta tabela de existir.
-- =============================================================

-- 1 · um preço vigente por plano, ciclo E MOEDA
drop index if exists public.plan_prices_vigente_idx;
create unique index plan_prices_vigente_idx
  on public.plan_prices (plan_id, ciclo, moeda) where vigente;

-- 2 · só estas três moedas entram, aqui e na intenção de pagamento
-- A trava antiga dizia `moeda = 'BRL'`. Ela não some: vira uma lista.
alter table public.plan_prices drop constraint if exists plan_prices_moeda_ck;
alter table public.plan_prices add constraint plan_prices_moeda_ck
  check (moeda in ('BRL', 'USD', 'EUR'));

-- 3 · a tabela internacional, DESLIGADA
-- Ela nasce com vigente = false de propósito. A função oaze-pagamento
-- que está no ar enquanto esta migração roda busca UMA linha por
-- (plano, ciclo); com três moedas vigentes ela recebe "mais de uma
-- linha" e passa a recusar até o checkout em real. A ordem certa é:
--   1. esta migração          (o preço existe, desligado)
--   2. deploy da função nova  (ela sabe filtrar por moeda)
--   3. 20260917140000         (liga as três moedas)
insert into public.plan_prices (id, plan_id, ciclo, centavos, moeda, versao, vigente) values
  ('basic_monthly_usd_v1', 'basic', 'monthly',   399, 'USD', 1, false),
  ('basic_annual_usd_v1',  'basic', 'annual',   3499, 'USD', 1, false),
  ('pro_monthly_usd_v1',   'pro',   'monthly',   799, 'USD', 1, false),
  ('pro_annual_usd_v1',    'pro',   'annual',   6999, 'USD', 1, false),
  ('basic_monthly_eur_v1', 'basic', 'monthly',   399, 'EUR', 1, false),
  ('basic_annual_eur_v1',  'basic', 'annual',   3499, 'EUR', 1, false),
  ('pro_monthly_eur_v1',   'pro',   'monthly',   799, 'EUR', 1, false),
  ('pro_annual_eur_v1',    'pro',   'annual',   6999, 'EUR', 1, false),
  ('free_monthly_usd_v1',  'free',  'monthly',     0, 'USD', 1, false),
  ('free_annual_usd_v1',   'free',  'annual',      0, 'USD', 1, false),
  ('free_monthly_eur_v1',  'free',  'monthly',     0, 'EUR', 1, false),
  ('free_annual_eur_v1',   'free',  'annual',      0, 'EUR', 1, false)
on conflict (id) do update
  set centavos = excluded.centavos,
      moeda    = excluded.moeda,
      versao   = excluded.versao;

-- 4 · a intenção guarda em que moeda o checkout foi aberto
-- O webhook compara unit_amount E moeda com o que está aqui. Sem esta
-- coluna ele comparava com 'BRL' fixo e recusaria toda assinatura
-- internacional como "preço divergente" — depois de cobrada.
alter table public.stripe_intencoes
  add column if not exists moeda text not null default 'BRL';
alter table public.stripe_intencoes drop constraint if exists stripe_intencoes_moeda_ck;
alter table public.stripe_intencoes add constraint stripe_intencoes_moeda_ck
  check (moeda in ('BRL', 'USD', 'EUR'));
