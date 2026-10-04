# Cofre e PIN da V3 — ativação

Esta mudança **ainda não fica ativa só com o deploy dos arquivos do site**. A tabela e a função precisam existir no mesmo projeto Supabase usado por `assets/js/supabase-config.js`. Não publique `cadastro.html` antes dos passos abaixo: um usuário novo confirma o e-mail e fica na etapa de criar PIN.

1. Aplicar `supabase/migrations/20261003090000_cofre_pin.sql` no projeto correto. Conferir que `public.oaze_cofre` tem RLS ativa, sem política de acesso do cliente, e que apenas `service_role` executa `oaze_cofre_configurar` e `oaze_cofre_verificar`.
2. Criar um segredo novo `OAZE_COFRE_KEY`, composto por **32 bytes aleatórios codificados em Base64**, no gerenciador de segredos das Edge Functions. Nunca colocar a chave no Git, no navegador ou nos arquivos do site. Fazer cópia de recuperação em cofre administrativo: se essa chave for perdida, os dados cifrados já gravados não poderão ser recuperados. Trocar a chave sem migrar os registros também os torna ilegíveis.
3. Confirmar `OAZE_ALLOWED_ORIGINS` com `https://oaze.site` e os domínios oficiais efetivamente usados, sem curinga. Implantar `supabase/functions/oaze-cofre/index.ts` como `oaze-cofre` com verificação JWT habilitada.
4. Em ambiente de teste, criar conta por e-mail, confirmar o link, criar um PIN válido, salvar chave Pix de teste, sair e entrar em outro aparelho, e confirmar que a chave só aparece após o PIN. Testar PIN incorreto cinco vezes, bloqueio, acesso direto à tabela com chave pública, criação sem aceite de privacidade e conflito entre dois aparelhos.
5. Só então publicar o frontend. Contas antigas continuam podendo entrar com a senha antiga pelo painel recolhido; não há migração automática de senha para PIN. O PIN não autentica uma sessão sozinho: a entrada é pelo e-mail confirmado.

O cofre guarda apenas chave Pix, agência, número de conta e nota curta. **Não guarda senha bancária.** Criptografia AES-GCM com chave do servidor protege o conteúdo gravado; hash adaptativo protege o PIN. Para apagar uma conta, a linha do cofre é eliminada pela chave estrangeira `on delete cascade` quando o usuário de autenticação é excluído.
