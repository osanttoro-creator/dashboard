# Segurança para o lançamento do OAZE

Estado verificado em 13 de setembro de 2026. “Pronto” significa proteção presente no código ou no banco. “Pendente” significa que ainda depende de painel, chave ou mudança de arquitetura.

## Pronto no código e no banco

- **Domínio, suporte e metadados:** URLs públicas usam `https://oaze.site` e o contato é `suporte@oaze.site`. As páginas públicas têm título, descrição, canônica e imagem de compartilhamento.
- **HTTPS e cabeçalhos:** redirecionamento para HTTPS, HSTS, CSP, `nosniff`, bloqueio de iframe, política de referência e política de permissões.
- **Segredos:** `.env` não é versionado; chaves secretas ficam em Edge Function Secrets. O pacote público e todo o histórico Git são verificados por formato de segredo sem imprimir o valor encontrado.
- **Chave pública do banco:** o navegador usa somente `sb_publishable_...`. Ela é pública por definição. `sb_secret_...` e `service_role` ficam no servidor e nunca entram no pacote.
- **RLS:** todas as tabelas expostas estão com RLS. Tabelas de assinatura, eventos, limites e consumo são somente do servidor; o navegador não recebe permissão de escrita.
- **Autorização no servidor:** as funções autenticadas validam o JWT na borda e chamam `getUser()` antes de usar identidade ou plano.
- **Mass assignment:** endpoints de pagamento reconstroem o corpo com campos permitidos e recusam campos extras. Preço, usuário e plano efetivo não vêm do navegador.
- **Consultas parametrizadas:** o aplicativo usa o cliente Supabase e RPCs com parâmetros. Não há SQL montado com texto enviado pelo usuário.
- **Validação:** perguntas, planos, ciclos, datas, números e listas são normalizados e limitados antes do uso.
- **Vazamento de conteúdo:** a UGLEZ recebe apenas agregados, usa `store: false`, não repassa erro do provedor e corta a resposta devolvida. O renderizador escapa o texto antes de produzir o Markdown mínimo.
- **Upload:** o aplicativo não recebe arquivo nenhum. A importação de extratos foi removida em 16/09/2026 e com ela o único ponto de upload que existia.
- **Senha:** o OAZE não guarda senha em tabela própria. O Supabase Auth recebe a senha e mantém apenas o hash.
- **Cobrança:** Checkout Stripe criado no servidor, preço lido do banco, idempotência, assinatura HMAC do webhook e conciliação antes de liberar plano.
- **Rate limit:** assistente, pagamento, exclusão de conta e webhook têm janelas de uso no banco. A cota mensal da UGLEZ continua atômica e separada.
- **Dependências:** `npm audit --audit-level=high` não encontrou vulnerabilidade nas dependências atuais.

## Pendente de painel ou decisão

- **Stripe:** inserir chaves de teste, criar o endpoint de webhook e executar os testes de cobrança. Sem isso, a função falha fechada e nada é cobrado.
- **Proteção contra bots:** ativar Cloudflare Turnstile ou hCaptcha no Supabase Auth e então colocar a chave pública no site. Ativar sem completar os dois lados bloquearia todo cadastro.
- **Senhas vazadas:** habilitar *Leaked password protection* no painel do Supabase. O advisor ainda aponta essa opção desligada.
- **Cookies HttpOnly:** o site é uma aplicação estática e o Supabase SPA guarda a sessão no `localStorage`. Um cookie `HttpOnly`, `Secure` e `SameSite` exige um backend/SSR que troque e renove a sessão. O aviso de armazenamento está pronto, mas essa migração arquitetural ainda não foi feita.
- **CSP sem `unsafe-inline`:** a política atual bloqueia origens desconhecidas, porém ainda permite scripts inline porque algumas páginas antigas dependem deles. Esses blocos devem ir para arquivos externos antes de remover a exceção.
- **Criptografia de campo:** HTTPS e criptografia gerenciada em repouso estão cobertos pelo provedor. Criptografar campos financeiros individualmente exige uma chave fora do navegador e uma decisão sobre pesquisa, exportação e recuperação. Não deve ser improvisado no cliente.
- **Acesso administrativo:** contas de Supabase, Stripe, GitHub e Hostinger devem usar MFA, usuários individuais e menor privilégio. Isso é configuração das contas, não código do site.
- **Contratos e aceites:** dependem da aprovação registrada em `docs/CONTRATOS-E-ACEITES-PARA-APROVACAO.md`.

## Limites que não podem ser tornados “ilimitados” pelo código

A OpenAI aplica limites por organização, projeto e modelo. O OAZE protege a chave contra rajadas e controla a cota dos usuários, mas não pode remover o limite do provedor. Use projeto próprio, chave restrita, orçamento e alertas no painel da OpenAI. Nunca compartilhe a chave em conversa.
