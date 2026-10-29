# Base da sessão — OAZE: nova apresentação e contato

**Data:** 29/10/2026  
**Projeto:** `G:\Meu Drive\sites\OAZE\o site`  
**Branch publicada:** `main` de `osanttoro-creator/dashboard`

## Objetivo e avaliação

Jonatham rejeitou a primeira landing (`66a3f9f`) como uma adaptação da página antiga. Pediu um site novo, inspirado no ritmo de apresentação da Pierre, sem copiar seu conteúdo ou sua interface. Depois confirmou `info@oaze.site` como e-mail oficial e pediu um formulário de mensagens com Supabase. A nova aparência ainda não recebeu avaliação explícita dele.

## Entrega

- `index.html` e `assets/css/landing-editorial.css`: apresentação reconstruída, com hero editorial, cenas do produto, carteira, Coco, agenda, lojas, planos, dúvidas e contato.
- `en/index.html`, `fr/index.html`, `es/index.html` e `i18n/site/index.json`: versões traduzidas.
- `termos.html`, `privacidade.html` e respectivas traduções: e-mail público atualizado para `info@oaze.site`.
- `tools/testes/landing-lojas-ui.js`: verifica apresentação, disponibilidade das lojas, formulário, e-mail, imagens, menu e ausência de erros e rolagem lateral.
- O formulário da landing reutiliza `assets/js/contato.js` e a função Supabase `oaze-contato`. Ela grava em `public.mensagens_contato` antes de tentar enviar o aviso por e-mail. A migração e a função já existiam no projeto; não foram alteradas nesta sessão.
- Os botões da Google Play e Microsoft Store continuam “Em breve”, sem URL inventado. A rota `/app` segue necessária para retornos técnicos de autenticação e cobrança.

## Estado e testes

- Commits enviados à `main`: `70a8abf` (redesign) e `6aba1de` (contato e e-mail).
- A suíte `node tools/verificar-tudo.js` passou com 46 verificações na cópia isolada da `main` após o redesign e após incluir o contato. O teste visual passou localmente e em `https://oaze.site/` a 1440 px e 390 px.
- O pacote Hostinger foi montado localmente sem segredos detectados. O domínio respondeu HTTP 200 com a nova seção de contato e o e-mail oficial. O estado interno do workflow não foi obtido; a publicação foi confirmada pelo conteúdo servido no domínio.
- Envio real à função `oaze-contato` retornou protocolo `4926e1eb`; a linha correspondente apareceu no Supabase. O teste usou nome `Teste OAZE` e o e-mail oficial. A tentativa de remover essa linha pelo conector expirou, então ela pode permanecer na tabela.

## Limitação e próximo passo

O registro no Supabase funciona. O aviso por e-mail **não está configurado**: a linha de teste marcou `erro_envio = envio_nao_configurado`. As duas mensagens anteriores tinham o mesmo estado. Para receber avisos em `info@oaze.site`, configurar `RESEND_API_KEY`, `CONTATO_DESTINO=info@oaze.site` e um remetente de domínio verificado nos segredos da função, então repetir teste de entrega. Não guardar chaves no repositório nem no My Brain. Até lá, consultar as mensagens no painel Supabase.

O checkout original estava em um branch compartilhado de trabalho do app. A publicação foi preparada em um worktree isolado (`C:\Users\santtoro\Downloads\sites\OAZE\oaze-landing-release-20261028`) a partir de `origin/main`, para não enviar mudanças do app. As capturas locais do redesign ficam em `G:\Meu Drive\sites\OAZE\o site\docs\previews\landing-editorial` e não entraram nos commits.

Conexão: `G:\Meu Drive\my brain\03 - Projetos\OAZE\oaze-site-lojas-e-apresentacao-2026-10-28.md`.
