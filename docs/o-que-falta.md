# O que falta para lançar

Revisão de 13/09/2026. A interface, o app local, a autenticação, o banco com
RLS, a UGLEZ e a publicação estática existem. Os pontos abaixo ainda impedem
tratar o OAZE como um sistema de produção completo.

## Bloqueios

1. **Aplicar e validar a migração de segurança e Stripe.**
   `20260913180000_stripe_e_rate_limits.sql` cria rate limits, intenções e eventos
   somente do servidor e os identificadores da assinatura. Depois, executar os
   testes SQL de RLS e de plano efetivo.

2. **Remover as Edge Functions antigas do projeto remoto.**
   `oaze-checkout`, `oaze-mp-webhook` e `oaze-assinatura` não têm código ativo no
   produto e não podem continuar publicados. A remoção depende de acesso ao
   painel ou de uma sessão autenticada da CLI.

3. **Definir uma única fonte da verdade para os dados financeiros.**
   Hoje coexistem o documento JSON `dados` e as tabelas normalizadas. A
   sincronização precisa escolher um modelo, migrar automaticamente o legado e
   ser testada em dois aparelhos.

4. **Corrigir a chegada em um aparelho novo.**
   O perfil local vazio pode continuar ativo mesmo depois de os perfis da conta
   chegarem. A adoção de dados locais também precisa de confirmação explícita em
   navegadores compartilhados.

5. **Ativar e testar a Stripe.**
   O código existe: `oaze-pagamento`, `oaze-stripe-webhook` e o cancelamento na
   exclusão da conta. Falta o dono cadastrar as chaves de teste e o webhook,
   seguir `docs/STRIPE-CONFIGURACAO.md` e validar renovação, falha, cancelamento,
   estorno e exclusão antes de usar uma chave de produção.

6. **Finalizar os documentos legais.**
   Preencher razão social, CNPJ, endereço e encarregado de dados; revisar Termos
   e Privacidade com advogado. Nomear a Stripe como operadora e
   documentar cobrança, cancelamento e reembolso reais.

7. **Fechar a configuração de produção.**
   Usar domínio próprio, verificar o domínio no Google OAuth, revisar URLs de
   redirecionamento, origens permitidas, e-mail transacional, proteção contra
   senhas vazadas, backups e recuperação.

## Qualidade antes de abrir ao público

- eliminar as inscrições Realtime duplicadas e validar reconexão/offline;
- testar cadastro, confirmação, login, recuperação, logout e exclusão de conta;
- testar importação, backup/restauração e sincronização sem perda de dados;
- testar limites de plano e UGLEZ no banco real, inclusive concorrência;
- adicionar monitoramento de erros e métricas do funil sem dados financeiros;
- validar acessibilidade, mobile, desktop e navegadores suportados;
- executar `node tools/verificar-tudo.js` e os testes SQL antes de cada release.

## Funcionalidades anunciadas que ainda não existem

Relatórios personalizados, backup agendado e colaboradores não devem aparecer
como entregues até terem implementação e testes de ponta a ponta.
