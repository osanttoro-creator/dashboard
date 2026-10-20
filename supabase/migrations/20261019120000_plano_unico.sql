-- =============================================================
-- 19/10/2026 — plano único: Semente grátis + Oásis pago
-- -------------------------------------------------------------
-- Decisão de precificação de 19/10/2026 (docs/PRECIFICACAO-2026-10-18.md):
-- um preço só, igual na web, no iOS e no Android, porque o mesmo
-- número tem de sobreviver à comissão da App Store. O degrau do meio
-- (Coqueiro, R$ 14,90) sai: com preço único não existe upsell, então
-- o número precisa capturar a disposição a pagar média da base — não
-- a da porta de entrada.
--
--   Oásis  R$ 29,90/mês  ·  R$ 299,00/ano  (= 29,90 × 10, "2 meses grátis")
--          US$ 7,99/mês  ·  US$ 79,90/ano
--          € 7,99/mês    ·  € 79,90/ano
--
-- O anual passa de R$ 299,90 para R$ 299,00 porque dez vezes a
-- mensalidade é um desconto que a pessoa confere de cabeça. Em centavo
-- inteiro: 29900. Nunca em ponto flutuante.
--
-- POR QUE O COQUEIRO NÃO É APAGADO
-- `subscriptions.plan_id` referencia `plans.id`. Conferido em 19/10/2026:
-- nenhuma assinatura em `basic` (6 em `free`, 1 em `pro`), então ninguém
-- é migrado — mas apagar a linha destrói o histórico de quem viesse a
-- ter assinado e quebraria qualquer evento antigo do provedor. O plano
-- fica inativo: invisível na venda, íntegro no banco.
-- =============================================================

begin;

-- 1 · o Coqueiro sai de venda
-- `ativo = false` tira o plano da listagem; a linha continua existindo
-- para `subscriptions` e para os eventos do provedor.
update public.plans
   set ativo    = false,
       destaque = false
 where id = 'basic';

-- Sem isto, o índice parcial plan_prices_vigente_idx continuaria
-- apontando um preço vigente para um plano que não está mais à venda.
update public.plan_prices
   set vigente = false
 where plan_id = 'basic'
   and vigente;

-- 2 · o Oásis vira o único pago, e por isso é o destaque
update public.plans
   set destaque = true,
       ordem    = 2
 where id = 'pro';

-- 3 · preço novo do Oásis
-- O índice único é parcial (plan_id, ciclo, moeda) where vigente, então
-- o antigo precisa cair ANTES de o novo entrar. Mesma transação: não
-- existe instante em que o plano esteja sem preço.
update public.plan_prices
   set vigente = false
 where plan_id = 'pro'
   and vigente;

insert into public.plan_prices (id, plan_id, ciclo, centavos, moeda, versao, vigente) values
  ('pro_monthly_v4',     'pro', 'monthly',  2990, 'BRL', 4, true),
  ('pro_annual_v4',      'pro', 'annual',  29900, 'BRL', 4, true),
  ('pro_monthly_usd_v2', 'pro', 'monthly',   799, 'USD', 2, true),
  ('pro_annual_usd_v2',  'pro', 'annual',   7990, 'USD', 2, true),
  ('pro_monthly_eur_v2', 'pro', 'monthly',   799, 'EUR', 2, true),
  ('pro_annual_eur_v2',  'pro', 'annual',   7990, 'EUR', 2, true)
on conflict (id) do update
  set centavos = excluded.centavos,
      moeda    = excluded.moeda,
      versao   = excluded.versao,
      vigente  = excluded.vigente;

commit;
