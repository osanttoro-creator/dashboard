# Publicar o OAZE na Hostinger

O front-end é estático: HTML, CSS e JavaScript. O que exige servidor
— banco, login, IA — vive no Supabase, e nada disso sobe para cá.
**Nenhum segredo entra neste pacote**, e o script de montagem recusa
gerar se encontrar um.

---

## Onde isso vai

Sua conta tem três sites. O que serve arquivo estático é o de tipo
`addon`, com `public_html`:

| Site | Tipo | Serve estático |
|---|---|---|
| `royalblue-falcon-601254.hostingersite.com` | addon | ✅ **use este** |
| `whitesmoke-clam-895996.hostingersite.com` | nodejs | não |
| `kyps-ele-929193.hostingersite.com` | horizons | não |

Enquanto não houver domínio próprio, o subdomínio serve como
**staging** — dá para validar tudo antes de comprar o domínio.

---

## Montar

```bash
.\deploy\hostinger\montar-pacote.ps1
```

Gera `deploy/hostinger/public_html/` e um `.zip`. Antes de empacotar,
o script confere:

- nenhuma chave (OpenAI, Anthropic, `service_role`, JWT de serviço);
- nenhum `.ps1`, `.sql`, `.md` ou `.env` no meio;
- o `.htaccess` presente — sem ele, `/precos` dá 404 no Apache.

Se achar um segredo, **ele apaga a pasta e para**. Um pacote que não
sobe é um problema; um segredo que sobe é outro, bem maior.

---

## Publicar pelo GitHub (caminho normal)

Cada push em `main` que toque em `index.html`, `robots.txt`,
`assets/` ou `deploy/hostinger/` publica sozinho, pelo workflow
[`.github/workflows/deploy-hostinger.yml`](../../.github/workflows/deploy-hostinger.yml).

**Por que não é a integração nativa do hPanel:** ela não existe para
este site. Ele foi provisionado como *Aplicativo web Node.js*, cujo
único deploy é por arquivo — o menu vai de **Avançado** direto para
**Acesso SSH**, sem seção GIT, e a API da Hostinger também não expõe
nada de Git. O workflow faz o que a integração faria.

### Passo único de configuração

1. hPanel → <https://hpanel.hostinger.com/profile/api> → gere um token
2. GitHub → repositório → **Settings** → **Secrets and variables** →
   **Actions** → **New repository secret**
3. Nome exato: `HOSTINGER_API_TOKEN`. Valor: o token.

Enquanto ele não existir, o workflow falha no terceiro passo com
`HOSTINGER_API_TOKEN nao esta configurado` — de propósito, e antes de
qualquer coisa sair do runner.

### O que o workflow confere

Enviar arquivo não é a mesma coisa que o site estar de pé, então ele
não confia no "deu certo" da API:

- o **offset** do upload tem que bater com o tamanho do zip — um
  envio truncado também devolve `204`, e seguiria para a extração
- o **`.htaccess`** tem que estar dentro do zip — ele entra por um
  passo à mão, justamente o tipo de passo que quebra calado
- o **site tem que responder certo** depois: `/`, `/precos` e os
  assets em `200`; `/naoexiste.css` em `404`

Qualquer uma dessas falhando derruba o job.

---

## Publicar à mão (rollback e emergência)

1. hPanel → **Arquivos** → **Gerenciador de Arquivos**
2. Entre em `public_html` do site escolhido
3. **Antes de qualquer coisa**, baixe o conteúdo atual — é o rollback
4. Apague o conteúdo antigo
5. Envie `oaze-public_html.zip` e extraia ali
6. Confirme que o `.htaccess` foi extraído: o Gerenciador esconde
   arquivos que começam com ponto — ative *Mostrar arquivos ocultos*

O `.htaccess` é o arquivo mais importante do pacote. Sem ele, a home
abre e todo o resto dá 404.

---

## Checklist de publicação

Faça na ordem. Cada linha existe porque a falha correspondente é
silenciosa — o site parece funcionar e não está.

- [ ] `https://seusite/` abre o painel
- [ ] `https://seusite/precos` abre **direto**, sem passar pela home
      *(se der 404, o `.htaccess` não subiu)*
- [ ] `https://seusite/carteira` abre direto
- [ ] `https://seusite/assets/css/style.css` devolve **CSS**, não HTML
      *(se devolver HTML, o fallback está reescrevendo demais)*
- [ ] `http://seusite` redireciona para `https://`
- [ ] `https://seusite/nao-existe.css` mostra a página 404 do OAZE
- [ ] O login abre o formulário e entra
- [ ] O console do navegador não acusa bloqueio de CSP
- [ ] O celular abre sem rolagem horizontal
- [ ] Tema claro e escuro

### Depois de apontar o domínio

- [ ] Trocar `SEUDOMINIO.COM.BR` no `.htaccess` (linha da regra `www`)
- [ ] `www.seudominio` redireciona para `seudominio`
- [ ] Acrescentar o domínio em **Supabase → Authentication → URL
      Configuration** (*Site URL* e *Redirect URLs*) — sem isso o link
      de confirmação de e-mail não volta para o app
- [ ] Acrescentar o domínio em `OAZE_ALLOWED_ORIGINS` dos segredos do
      Supabase — sem isso a UGLEZ responde 403
- [ ] Só então descomentar o `Strict-Transport-Security` no `.htaccess`

O HSTS fica comentado de propósito. Ele instrui o navegador a
**recusar** HTTP naquele domínio por um ano; ligado antes de o HTTPS
funcionar em todos os subdomínios, prende o site num endereço que
talvez ainda não exista.

---

## Variáveis de ambiente

Nada aqui lê `.env` — é um site estático. As configurações vivem em
dois lugares:

| O quê | Onde | Público? |
|---|---|---|
| URL e chave publicável do Supabase | `assets/js/supabase-config.js` | sim, por design |
| `OPENAI_API_KEY`, `OPENAI_MODEL`, `OAZE_ALLOWED_ORIGINS` | `supabase secrets set` | **não** |
| `SUPABASE_SERVICE_ROLE_KEY` | injetada pelo Supabase na função | **não** |

A chave publicável é pública por projeto — quem protege os dados é o
RLS. O que **nunca** sobe para a Hostinger é chave de IA ou
`service_role`.

---

## Rollback

Escolha pela pressa:

**Imediato — segundos.** Renomeie `public_html` para
`public_html-quebrado` e restaure a pasta que você baixou no passo 3.
É por isso que aquele passo existe.

**Pelo git — minutos.**
```bash
git checkout <commit-anterior>
```
```bash
.\deploy\hostinger\montar-pacote.ps1
```
E suba o pacote de novo.

**Se o problema for o `.htaccess`.** Renomeie para `.htaccess-off`. O
site volta a servir só a home, sem `/precos` — degradado, mas no ar,
o que é melhor do que fora enquanto você investiga.

**O que o rollback NÃO desfaz:** migrações do banco. Elas são
aditivas (tabelas e colunas novas), então uma versão anterior do
front convive com o esquema novo. Se precisar reverter uma migração,
é operação separada e manual — e vale pensar duas vezes: reverter
esquema com dado dentro apaga dado.

---

## O que ainda não está aqui

**A landing page pública.** O brief pede `/`, `/recursos`, `/entrar`,
`/cadastro`, `/privacidade` e `/termos` como páginas de apresentação,
separadas do app. Hoje `/` abre o painel direto. As rotas do app já
são URLs de verdade e o `.htaccess` já as serve — o que falta é o
conteúdo do site público.

**O checkout.** Para na borda, esperando os identificadores de preço
do Mercado Pago. Ver `assets/js/checkout.js`.
