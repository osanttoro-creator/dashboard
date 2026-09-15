# Publicação na Hostinger

O site é estático. A `main` é validada, empacotada e enviada pelo workflow
`.github/workflows/deploy-hostinger.yml`.

## O que o pacote contém

`montar-pacote.ps1` copia somente os HTMLs públicos, `assets/`, manifesto,
SEO e `.htaccess`. Código do Supabase, ferramentas, documentação, `.env` e
fontes de desenvolvimento não entram em `public_html`.

```powershell
.\deploy\hostinger\montar-pacote.ps1
```

O resultado local fica em `deploy/hostinger/public_html/` e
`deploy/hostinger/oaze-public_html.zip`; ambos são descartáveis e ignorados
pelo Git.

## Segredo do workflow

O repositório precisa de `HOSTINGER_API_TOKEN` em GitHub → Settings → Secrets
and variables → Actions. Nenhum segredo de Supabase ou IA vai para a Hostinger.

## Verificação depois do deploy

- `/`, `/precos`, `/recursos`, `/suporte`, `/app` e `/app/carteira` abrem.
- `/assets/css/style.css` devolve CSS, não HTML.
- uma rota inventada devolve 404.
- `http://` redireciona para `https://`.
- não há rolagem horizontal no celular.
- o console não registra erro de CSP.

## Domínio próprio

Ao trocar o subdomínio temporário:

1. atualize canônicas e `sitemap.xml`;
2. inclua a origem em `OAZE_ALLOWED_ORIGINS` no Supabase;
3. inclua Site URL e Redirect URLs no Supabase Auth;
4. valide HTTPS antes de ampliar HSTS.

## Rollback

Use `git revert <commit>` e envie a `main`. O workflow publica o estado
revertido sem reescrever o histórico. Migrações do banco não voltam com o
deploy do site e precisam de uma migração compensatória.

## Limite atual

O webhook da Stripe foi validado em modo de teste e as páginas públicas de
Termos e Privacidade foram autorizadas para publicação como minuta. A cobrança
em produção permanece fechada até configurar as credenciais e o webhook live,
validar o fluxo ponta a ponta e concluir a identificação legal, o canal do
encarregado, a revisão jurídica e o registro server-side dos aceites. Sem essa
configuração de produção, nada é cobrado.
