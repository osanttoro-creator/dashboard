-- =============================================================
-- Fecha os achados dos advisors de segurança do Supabase
-- =============================================================

-- 1 · criar_assinatura_gratis é função de GATILHO (usa new.id), mas
--     estava com EXECUTE para anon e authenticated, exposta em
--     /rest/v1/rpc/. Chamá-la por RPC daria erro de "record new is
--     not assigned yet" -- não é explorável, mas uma SECURITY
--     DEFINER alcançável de fora é superfície que não precisa
--     existir. O gatilho continua funcionando: ele roda com o
--     privilégio do dono da tabela, não do chamador, e por isso não
--     depende de GRANT nenhum.
revoke execute on function public.criar_assinatura_gratis() from public, anon, authenticated;

-- 2 · testa_involucro era um teste da migração de planos. Ficou para
--     trás, sem search_path fixo. Função sem search_path é o vetor
--     clássico de sequestro por schema: quem puder criar um schema à
--     frente no caminho troca o que a função chama.
drop function if exists public.testa_involucro();

-- 3 · As funções de reserva/estorno de IA existem em dois lugares:
--     private (correto) e public (invólucros para o PostgREST). Os
--     invólucros já eram só service_role; confirmado aqui para o
--     estado não depender da ordem em que as migrações rodaram.
revoke execute on function public.reservar_ia(uuid, integer) from public, anon, authenticated;
revoke execute on function public.estornar_ia(uuid) from public, anon, authenticated;

-- 4 · PENDENTE, e não é SQL: "Leaked Password Protection" está
--     desligada. Liga no painel, em Authentication > Policies. Ela
--     confere a senha escolhida contra o HaveIBeenPwned antes de
--     aceitar. Não dá para ligar por migração.
