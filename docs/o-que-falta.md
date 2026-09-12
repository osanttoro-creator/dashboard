# O que falta para lançar

Revisão de 12/09/2026. A interface, o app local, a autenticação, o banco com
RLS, a UGLEZ e a publicação estática existem. Os pontos abaixo ainda impedem
tratar o OAZE como um sistema de produção completo.

## Bloqueios

1. **Aplicar a migração de limpeza no Supabase.**
   `20260912232434_remove_payment_providers.sql` retira tabelas, funções e
   colunas do modelo antigo. Depois, confirmar esquema e executar os testes SQL
   de RLS e de plano efetivo.

2. **Remover as Edge Functions antigas do projeto remoto.**
   `oaze-checkout` e `oaze-mp-webhook` não têm mais código no repositório e não
   podem continuar publicados. `oaze-assinatura` também sai até a implementação
   completa do novo ciclo comercial.

3. **Definir uma única fonte da verdade para os dados financeiros.**
   Hoje coexistem o documento JSON `dados` e as tabelas normalizadas. A
   sincronização precisa escolher um modelo, migrar automaticamente o legado e
   ser testada em dois aparelhos.

4. **Corrigir a chegada em um aparelho novo.**
   O perfil local vazio pode continuar ativo mesmo depois de os perfis da conta
   chegarem. A adoção de dados locais também precisa de confirmação explícita em
   navegadores compartilhados.

5. **Implementar o Asaas do zero.**
   Checkout no servidor, criação de cliente/cobrança, webhook autenticado e
   idempotente, atualização do plano, cancelamento, reembolso, conciliação e
   segredos somente no servidor. Nenhum valor ou confirmação pode ser aceito do
   navegador.

6. **Finalizar os documentos legais.**
   Preencher razão social, CNPJ, endereço e encarregado de dados; revisar Termos
   e Privacidade com advogado. Quando o Asaas entrar, nomeá-lo como operador e
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
