# Publicação do site OAZE
<!-- last-analyzed: 2026-10-24T20:41:55Z -->

## Fontes de versão

Este site estático não usa uma versão semântica única para publicar. Não criar
tag nem alterar números de versão só para entregar uma mudança de interface.

## Gatilho e distribuição

O push na branch `main` aciona `.github/workflows/deploy-hostinger.yml`.
O workflow monta o pacote com `deploy/hostinger/montar-pacote.ps1` e o publica
na Hostinger. `workflow_dispatch` também existe para execução manual.
Tags antigas não são o gatilho desta publicação.

## Testes obrigatórios

- `node tools/verificar-tudo.js`
- `node tools/gen-idiomas-app.js --conferir`
- `git diff --check`
- Conferir o ZIP: `app-v3.html` e `assets/app/` presentes; `preview-v3/`,
  testes, fixtures e segredos ausentes.

O workflow repete a suíte antes do upload. O `.gitignore` exclui pacotes e
artefatos locais.

## Notas da entrega

Não há `CHANGELOG.md` ou release GitHub exigidos pelo fluxo. No handoff,
resumir mudanças visíveis, migrações, limites dos testes e URL do site.

## Verificação após publicar

Conferir commit em `origin/main`, conclusão do workflow, `/app` e
`/app-v3.html`, arquivos de `assets/app/` e HTTP 410 em `/preview-v3/`.
Comparar os arquivos publicados com o commit quando possível. HTTP 200 e
testes estáticos não substituem sessão autenticada nem teste visual real.

Comprovantes privados exigem o bucket e as migrações do Supabase, além da
função `oaze-conta` compatível, antes de publicar o frontend.

## Lacunas de validação

Sem uma conta de teste fornecida, não executar exclusão de conta em produção
nem afirmar que upload/remoção autenticados foram validados ponta a ponta.
