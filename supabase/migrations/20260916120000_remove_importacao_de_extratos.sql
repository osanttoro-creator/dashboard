-- =============================================================
-- OAZE — a importação de extratos deixa de existir
-- -------------------------------------------------------------
-- O leitor de CSV/OFX acertava o formato de alguns bancos e errava
-- o de outros. Um extrato lido pela metade é pior do que extrato
-- nenhum: cria lançamento com valor ou sinal trocado, e quem for
-- conferir três meses depois não tem como saber de onde veio.
--
-- O recurso saiu do aplicativo, da landing e da tabela de planos
-- em 16/09/2026. Estas duas linhas de direito ficariam prometendo,
-- dentro do banco, algo que o produto não faz mais — e o teste
-- tools/testes/confere-planos.js existe justamente para impedir
-- que o banco e o app digam coisas diferentes.
--
-- Nada além disso muda: nenhum plano perde preço ou limite, e
-- ninguém é rebaixado. Quem assinou por causa da importação tem
-- direito a saber — o aviso é por e-mail, não por migração.
-- =============================================================
delete from public.plan_entitlements
 where tipo = 'recurso'
   and chave in ('import_csv', 'import_ofx');
