# Contratos e aceites — minuta para aprovação

Esta etapa ainda não deve bloquear o cadastro. Os documentos públicos continuam marcados como minutas até a aprovação do responsável pelo OAZE e a revisão jurídica.

## Texto dos três aceites

1. **Termos de uso:** “Li e aceito os Termos de uso do OAZE.”
2. **Privacidade:** “Li a Política de privacidade e entendi como meus dados são tratados.”
3. **Responsabilidade pelo arquivo:** “Declaro que só vou importar arquivos que tenho direito de usar e que sou responsável pelo conteúdo enviado.”

Os três campos devem ser separados, obrigatórios e desmarcados por padrão. Um único “aceito tudo” não deixa claro o que foi aceito.

## Evidência que o servidor deve guardar

Quando essa etapa for aprovada, o OAZE deve registrar para cada aceite:

- usuário;
- tipo do documento;
- versão do texto;
- data e hora do servidor;
- origem do fluxo, como e-mail ou Google;
- apenas os dados técnicos estritamente necessários para comprovar o aceite.

O navegador não pode decidir a versão nem alterar um aceite anterior. Uma nova versão relevante exige novo aceite, sem apagar o histórico.

## Pontos que precisam de aprovação antes de valer

- razão social, CNPJ e endereço do responsável pelo OAZE;
- identificação e contato do encarregado de dados;
- bases legais, prazo real de retenção dos logs e transferência internacional;
- cancelamento, estorno, contestação e direito de arrependimento na Stripe;
- limitação de responsabilidade e foro;
- redação final da responsabilidade por arquivos importados;
- tratamento do cadastro social: o aceite precisa acontecer antes de iniciar Google ou Apple, e não apenas depois que o provedor criar a conta.

Depois da aprovação, a implementação deve bloquear o envio do formulário e os botões sociais até os três aceites, além de registrar a evidência no servidor. Alterar só o HTML não basta: qualquer pessoa pode remover um `required` pelo DevTools.
