-- =============================================================
-- OAZE — revisão de preços, limites e direitos
-- -------------------------------------------------------------
-- O BANCO É A AUTORIDADE. assets/js/planos.js orienta a interface;
-- quem libera é aqui. Esta migração alinha os dois com a tabela de
-- planos aprovada.
--
-- PREÇOS SOBEM, MAS NÃO PARA QUEM JÁ ASSINOU
-- plan_prices tem `versao` e `vigente` justamente para isto. A
-- linha antiga é APOSENTADA (vigente = false), não sobrescrita, e
-- a nova entra como versão 2. Quem assinou na versão 1 continua
-- pagando a versão 1: a assinatura guarda price_version, e mudar o
-- valor por baixo de um contrato em vigor é o tipo de coisa que se
-- descobre pelo estorno.
--
-- LIMITES CAEM EM ALGUNS PONTOS (histórico de 6 para 3 meses no
-- Grátis, orçamentos de 2 para 1). NADA É APAGADO por causa disso:
-- quem estiver acima do teto continua com tudo, vendo tudo e
-- exportando tudo, só não cria novos. A regra vive em limites.js
-- (a faixa de excedente) e não tem contrapartida destrutiva no
-- banco, de propósito.
-- =============================================================

-- -------------------------------------------------------------
-- 1 · preços — versão 2
-- -------------------------------------------------------------
-- Basic  R$ 24,90/mês  ·  R$ 239,90/ano
-- Pro    R$ 49,90/mês  ·  R$ 479,90/ano
update public.plan_prices
   set vigente = false
 where plan_id in ('basic', 'pro') and vigente;

insert into public.plan_prices (id, plan_id, ciclo, centavos, versao, vigente) values
  ('basic_monthly_v2', 'basic', 'monthly',  2490, 2, true),
  ('basic_annual_v2',  'basic', 'annual',  23990, 2, true),
  ('pro_monthly_v2',   'pro',   'monthly',  4990, 2, true),
  ('pro_annual_v2',    'pro',   'annual',  47990, 2, true)
on conflict (id) do update
  set centavos = excluded.centavos,
      versao   = excluded.versao,
      vigente  = excluded.vigente;

-- -------------------------------------------------------------
-- 2 · limites
-- -------------------------------------------------------------
-- transactions_per_month é chave NOVA. O teto do Grátis (100 por
-- mês) não existia em lugar nenhum a não ser no texto de vendas, e
-- limite que só existe no texto não é limite.
insert into public.plan_entitlements (plan_id, chave, tipo, limite) values
  -- ---- Grátis ----
  ('free', 'workspaces',             'limite', 1),
  ('free', 'accounts',               'limite', 2),
  ('free', 'credit_cards',           'limite', 1),
  ('free', 'transactions_per_month', 'limite', 100),
  ('free', 'custom_categories',      'limite', 10),
  ('free', 'budgets',                'limite', 1),
  ('free', 'goals',                  'limite', 1),
  ('free', 'recurring_items',        'limite', 3),
  ('free', 'ai_queries_per_month',   'limite', 5),
  ('free', 'history_months',         'limite', 3),
  ('free', 'comparison_months',      'limite', 1),
  ('free', 'collaborators',          'limite', 0),
  -- ---- Basic ----  NULL = ilimitado
  ('basic', 'workspaces',             'limite', 1),
  ('basic', 'accounts',               'limite', 10),
  ('basic', 'credit_cards',           'limite', 5),
  ('basic', 'transactions_per_month', 'limite', null),
  ('basic', 'custom_categories',      'limite', null),
  ('basic', 'budgets',                'limite', null),
  ('basic', 'goals',                  'limite', 10),
  ('basic', 'recurring_items',        'limite', null),
  ('basic', 'ai_queries_per_month',   'limite', 30),
  ('basic', 'history_months',         'limite', 24),
  ('basic', 'comparison_months',      'limite', 24),
  ('basic', 'collaborators',          'limite', 0),
  -- ---- Pro ----
  ('pro', 'workspaces',             'limite', 5),
  ('pro', 'accounts',               'limite', null),
  ('pro', 'credit_cards',           'limite', null),
  ('pro', 'transactions_per_month', 'limite', null),
  ('pro', 'custom_categories',      'limite', null),
  ('pro', 'budgets',                'limite', null),
  ('pro', 'goals',                  'limite', null),
  ('pro', 'recurring_items',        'limite', null),
  ('pro', 'ai_queries_per_month',   'limite', 120),
  ('pro', 'history_months',         'limite', null),
  ('pro', 'comparison_months',      'limite', null),
  ('pro', 'collaborators',          'limite', 3)
on conflict (plan_id, chave) do update set limite = excluded.limite;

-- -------------------------------------------------------------
-- 3 · recursos
-- -------------------------------------------------------------
-- uglez_assistente_flutuante é a chave que o brief chama de
-- features.uglezFloatingAssistant. Ela existe como DIREITO, e não
-- como uma comparação de plano espalhada pelos componentes: no dia
-- em que houver um quarto plano, a regra continua num lugar só.
--
-- comparacao_anual saiu de dentro de comparison_months. Eram duas
-- perguntas diferentes ("quantos meses comparo" e "comparo anos")
-- respondidas pelo mesmo número, e por isso impossíveis de ajustar
-- em separado.
insert into public.plan_entitlements (plan_id, chave, tipo, ativo) values
  ('free',  'import_csv',                 'recurso', false),
  ('free',  'import_ofx',                 'recurso', false),
  ('free',  'export_csv',                 'recurso', false),
  ('free',  'export_pdf',                 'recurso', false),
  ('free',  'calendario',                 'recurso', false),
  ('free',  'uglez_assistente_flutuante', 'recurso', false),
  ('free',  'comparacao_mensal',          'recurso', false),
  ('free',  'comparacao_anual',           'recurso', false),
  ('free',  'analises_avancadas',         'recurso', false),
  ('free',  'ia_simulacoes',              'recurso', false),
  ('free',  'colaboracao',                'recurso', false),
  ('free',  'relatorios_custom',          'recurso', false),
  ('free',  'acesso_antecipado',          'recurso', false),
  ('free',  'suporte_prioritario',        'recurso', false),

  ('basic', 'import_csv',                 'recurso', true),
  ('basic', 'import_ofx',                 'recurso', true),
  ('basic', 'export_csv',                 'recurso', true),
  ('basic', 'export_pdf',                 'recurso', true),
  ('basic', 'calendario',                 'recurso', true),
  ('basic', 'uglez_assistente_flutuante', 'recurso', true),
  ('basic', 'comparacao_mensal',          'recurso', true),
  ('basic', 'comparacao_anual',           'recurso', false),
  ('basic', 'analises_avancadas',         'recurso', false),
  ('basic', 'ia_simulacoes',              'recurso', false),
  ('basic', 'colaboracao',                'recurso', false),
  ('basic', 'relatorios_custom',          'recurso', false),
  ('basic', 'acesso_antecipado',          'recurso', false),
  ('basic', 'suporte_prioritario',        'recurso', false),

  ('pro',   'import_csv',                 'recurso', true),
  ('pro',   'import_ofx',                 'recurso', true),
  ('pro',   'export_csv',                 'recurso', true),
  ('pro',   'export_pdf',                 'recurso', true),
  ('pro',   'calendario',                 'recurso', true),
  ('pro',   'uglez_assistente_flutuante', 'recurso', true),
  ('pro',   'comparacao_mensal',          'recurso', true),
  ('pro',   'comparacao_anual',           'recurso', true),
  ('pro',   'analises_avancadas',         'recurso', true),
  ('pro',   'ia_simulacoes',              'recurso', true),
  ('pro',   'colaboracao',                'recurso', true),
  ('pro',   'relatorios_custom',          'recurso', true),
  ('pro',   'acesso_antecipado',          'recurso', true),
  ('pro',   'suporte_prioritario',        'recurso', true)
on conflict (plan_id, chave) do update set ativo = excluded.ativo;

-- -------------------------------------------------------------
-- 4 · o que saiu de cena
-- -------------------------------------------------------------
-- Nenhuma chave é apagada. Uma versão antiga do front ainda pode
-- perguntar por ela, e chave ausente vira NULL, que meus_direitos()
-- devolve como "não tem" — o lado seguro. Elas apenas deixam de
-- aparecer no comparativo, que é a lista curada em planos.js.
