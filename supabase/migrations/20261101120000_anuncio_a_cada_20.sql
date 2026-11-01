-- =============================================================
-- 01/11/2026 — Semente: lançamentos ilimitados, liberados de 20 em 20
-- por anúncio premiado (Android: AdMob com SSV; Windows/site/iOS sem
-- SDK nativo: vídeo do Google Ad Manager, POST acao:'web' em
-- oaze-anuncio). O teto mensal fixo deixa de existir: começa em 0 e
-- cada anúncio soma 20 no mês. 40 anúncios por dia = 800 lançamentos.
-- Pro e Oásis continuam sem limite e sem anúncio.
-- =============================================================
update public.plan_entitlements set limite = 0
 where plan_id = 'free' and chave = 'transactions_per_month';

insert into public.plan_entitlements (plan_id, chave, tipo, limite, ativo) values
  ('free', 'anuncios_por_dia',        'limite', 40, null),
  ('free', 'lancamentos_por_anuncio', 'limite', 20, null)
on conflict (plan_id, chave) do update set limite = excluded.limite, tipo = excluded.tipo, ativo = null;
