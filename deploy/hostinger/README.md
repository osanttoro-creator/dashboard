# Publicar o OAZE na Hostinger

O front-end é estático: HTML, CSS e JavaScript. O que exige servidor
— banco, login, IA, cobrança — vive no Supabase, e nada disso sobe
para cá. **Nenhum segredo entra neste pacote**, e o script de
montagem recusa gerar se encontrar um.

---

## O passo a passo curto

Se você já conhece o resto deste documento, é isto:

```bash
node tools/verificar-tudo.js
```

Se houver migração nova em `supabase/migrations/`, **rode ela antes**
(seção [Banco primeiro](#1--banco-primeiro-quando-houver-migração)).
Depois:

```bash
git add -A && git commit -m "descreva a mudança" && git push origin main
```

O resto é automático. Acompanhe em **GitHub → Actions**, e no fim
percorra o [checklist](#checklist-de-publicação).

---

## Onde isso vai

| | |
|---|---|
| Site | `mediumvioletred-viper-277230.hostingersite.com` |
| Conta Hostinger | `u231435333` |
| Projeto Supabase | `gxwatircdhhetvzzlwwq` (OAZE) |

> [!] **Este documento já apontou para o site errado.**
> A versão anterior mandava publicar em
> `royalblue-falcon-601254.hostingersite.com`, que é outro site da
> mesma conta. O endereço acima é o que está no
> `deploy-hostinger.yml` e em todas as tags `rel="canonical"` do
> HTML — essas duas são a fonte da verdade, não este README.
> Se divergirem de novo, acredite nelas.

Enquanto não houver domínio próprio, o subdomínio serve como
**staging**: dá para validar tudo antes de comprar o domínio.

---

## 1 · Banco primeiro (quando houver migração)

**Esta é a única ordem que não pode ser invertida.**

`oaze-checkout` lê o preço de `plan_prices` no banco e recusa preço
vindo do corpo da requisição — o que está certo. Mas significa que,
se o site subir antes da migração, a página anuncia um valor e o
Mercado Pago cobra outro.

Anunciar um preço e cobrar outro se descobre pelo estorno.

Se `supabase/migrations/` tem arquivo que ainda não rodou:

1. Supabase → projeto **OAZE** → **SQL Editor**
2. Cole o conteúdo do arquivo e execute
3. Confira o efeito. Para uma migração de preço:

```sql
select plan_id, ciclo, centavos, versao, vigente
from plan_prices where vigente order by plan_id, ciclo;
```

Ou, pela CLI:

```bash
supabase db push --project-ref gxwatircdhhetvzzlwwq
```

> [!] Migração não tem rollback fácil
> Elas são aditivas de propósito — tabelas e colunas novas —, então
> uma versão anterior do front convive com o esquema novo. Reverter
> esquema com dado dentro apaga dado. Pense duas vezes.

---

## 2 · Verificar antes de commitar

```bash
node tools/verificar-tudo.js
```

Nove verificações. Qualquer uma falhando derruba o deploy, então
rodar aqui economiza uma ida ao Actions:

| | |
|---|---|
| `varrer-segredos` | Nenhum segredo no que vai ao navegador |
| `conferir-rls` | Toda tabela exposta tem RLS |
| `auditar-cliques` | Nenhum botão ou link sem ação |
| `conferir-planos` | Site público e `planos.js` concordam |
| `testes/confere-planos` | `planos.js` e o banco concordam |
| `testes/contraste` | Contraste mínimo nos dois temas |
| `testes/ida-e-volta` | Dados voltam iguais do banco |
| `testes/trava-sobrescrita` | O banco não apaga o aparelho |
| `testes/assinatura-webhook` | Webhook rejeita assinatura inválida |

Ficam de fora, por exigirem conexão e dois usuários reais:
`tools/testes/isolamento-rls.sql` e `plano-efetivo.sql`.

> [!] Este comando existe por um motivo específico
> `confere-planos.js` passou tempo falhando com 16 divergências sem
> ninguém saber. Ele estava silenciado no CI por um `|| warning`,
> sob a justificativa de que "consulta o banco". Não consulta —
> compara `planos.js` com um retrato estático. Um teste silenciado é
> pior do que um teste ausente: o ausente todo mundo sabe que falta.

---

## 3 · Publicar

```bash
git add -A
git commit -m "descreva a mudança"
git push origin main
```

O workflow [`deploy-hostinger.yml`](../../.github/workflows/deploy-hostinger.yml)
faz o resto. Acompanhe em **GitHub → Actions**.

### O que dispara

Push em `main` que toque em `*.html`, `robots.txt`, `sitemap.xml`,
`manifest.webmanifest`, `assets/**`, `tools/**` ou
`deploy/hostinger/**`.

> [!] Esta lista já esqueceu dez páginas
> Ela cobria só `index.html`. Um commit que corrigisse o preço em
> `precos.html` **não disparava deploy** — sem erro, sem job
> vermelho. A pessoa ia dormir achando que publicou. Hoje é
> `*.html`, que cobre inclusive as páginas que ainda não existem.

Commit que só mexe em `supabase/` ou `docs/` não publica, de
propósito: não muda o que é servido, e deploy à toa some com o sinal
de quando um deploy de verdade quebrou algo.

Para publicar sem mudar arquivo: **Actions → Publica na Hostinger →
Run workflow**.

### O que o workflow confere

Enviar arquivo não é a mesma coisa que o site estar de pé:

- **Verificação completa** antes de empacotar — pacote que não
  deveria existir é melhor não existir
- **Offset do upload** batendo com o tamanho do zip — um envio
  truncado também devolve `204` e seguiria para a extração
- **`.htaccess` dentro do zip** — ele entra por um passo à mão,
  justamente o tipo de passo que quebra calado
- **Site respondendo certo** depois: `/`, `/precos` e os assets em
  `200`; `/naoexiste.css` em `404`

Dois deploys simultâneos se sobrescrevem no meio da extração, então
o workflow serializa — e não cancela o que está correndo, porque
cancelar no meio da extração é exatamente o estado a evitar.

### Passo único de configuração

Só na primeira vez:

1. hPanel → <https://hpanel.hostinger.com/profile/api> → gere um token
2. GitHub → repositório → **Settings** → **Secrets and variables** →
   **Actions** → **New repository secret**
3. Nome exato: `HOSTINGER_API_TOKEN`

Sem ele o workflow falha cedo, com
`HOSTINGER_API_TOKEN nao esta configurado`, antes de qualquer coisa
sair do runner.

---

## Publicar à mão (rollback e emergência)

```bash
.\deploy\hostinger\montar-pacote.ps1
```

Gera `deploy/hostinger/public_html/` e o `.zip`. O script varre o
que vai ser servido atrás de chave, `.env`, `.sql` e `.ps1`, e se
achar **apaga a pasta e para**. Um pacote que não sobe é um
problema; um segredo que sobe é outro, bem maior.

Depois:

1. hPanel → **Arquivos** → **Gerenciador de Arquivos**
2. Entre em `public_html` do site
3. **Antes de qualquer coisa**, baixe o conteúdo atual — é o rollback
4. Apague o conteúdo antigo
5. Envie `oaze-public_html.zip` e extraia ali
6. Confirme que o `.htaccess` foi extraído — o Gerenciador esconde
   arquivos que começam com ponto. Ative *Mostrar arquivos ocultos*

O `.htaccess` é o arquivo mais importante do pacote. Sem ele, a home
abre e todo o resto dá 404.

---

## Checklist de publicação

Na ordem. Cada linha existe porque a falha correspondente é
silenciosa — o site parece funcionar e não está.

- [ ] `https://mediumvioletred-viper-277230.hostingersite.com/` abre a
      landing
- [ ] `/precos` abre **direto**, sem passar pela home
      *(404 aqui = o `.htaccess` não subiu)*
- [ ] `/app` abre o painel, e `/app/carteira` abre direto
- [ ] `/assets/css/style.css` devolve **CSS**, não HTML
      *(HTML aqui = o fallback está reescrevendo demais)*
- [ ] `http://` redireciona para `https://`
- [ ] `/nao-existe.css` mostra a página 404 do OAZE
- [ ] O console do navegador não acusa bloqueio de CSP
- [ ] O celular abre sem rolagem horizontal
- [ ] Tema claro e escuro

### Depois de uma mudança de preço

- [ ] O preço da landing é o mesmo de `/precos`
- [ ] O checkout mostra o **mesmo valor** antes de ir ao Mercado Pago

### Depois de mexer em autenticação

- [ ] Ciclo inteiro: `/cadastro` → e-mail de confirmação → `/app`
      **sem pedir conta de novo**
- [ ] Fechar o navegador, reabrir, continuar logado
- [ ] Sair de fato desloga

> [!] Mudança de `storageKey` desloga todo mundo, uma vez
> Foi o caso em 10/09/2026. Esperado, acontece uma vez só, e é
> preferível ao cadastro em duplicado que o desencontro causava.

### Depois de apontar o domínio próprio

- [ ] Trocar o domínio no `.htaccess` (regra do `www`)
- [ ] `www.seudominio` redireciona para `seudominio`
- [ ] **Supabase → Authentication → URL Configuration**: acrescentar
      em *Site URL* e *Redirect URLs* — sem isso o link de
      confirmação de e-mail não volta para o app
- [ ] Acrescentar em `OAZE_ALLOWED_ORIGINS` nos segredos do Supabase
      — sem isso o UGLEZ responde 403
- [ ] Só então revisar o `Strict-Transport-Security`

O HSTS instrui o navegador a **recusar** HTTP naquele domínio por um
ano. Ligado antes de o HTTPS funcionar em todos os subdomínios,
prende o site num endereço que talvez ainda não exista.

---

## Rollback

Escolha pela pressa.

**Imediato, segundos.** Renomeie `public_html` para
`public_html-quebrado` e restaure a pasta que você baixou. É por isso
que aquele passo existe.

**Pelo git, minutos.**

```bash
git revert <commit> && git push origin main
```

`revert` em vez de `checkout`: ele deixa rastro e dispara o workflow
sozinho. Reescrever a `main` para trás não faz nem uma coisa nem
outra.

**Se o problema for o `.htaccess`.** Renomeie para `.htaccess-off`.
O site volta a servir só a home — degradado, mas no ar, o que é
melhor do que fora enquanto você investiga.

**O que o rollback NÃO desfaz:** migrações do banco. Ver a seção 1.

---

## Onde ficam as configurações

Nada aqui lê `.env` — é um site estático.

| O quê | Onde | Público? |
|---|---|---|
| URL e chave publicável do Supabase | `assets/js/supabase-config.js` | sim, por design |
| `OPENAI_API_KEY`, `OPENAI_MODEL`, `OAZE_ALLOWED_ORIGINS` | `supabase secrets set` | **não** |
| `SUPABASE_SERVICE_ROLE_KEY` | injetada pelo Supabase na função | **não** |
| `HOSTINGER_API_TOKEN` | GitHub Actions secrets | **não** |

A chave publicável é pública por projeto — quem protege os dados é o
RLS. O que **nunca** sobe para a Hostinger é chave de IA ou
`service_role`.

---

## O que ainda não está pronto

**O checkout.** Para na borda, esperando os identificadores de preço
do Mercado Pago. Ver `assets/js/checkout.js`. Nenhuma assinatura é
ativada sem confirmação do webhook — não há simulação de pagamento
aprovado.

**Relatórios personalizados, backup agendado e colaboradores.** Os
direitos existem no banco; as funções não. Não são anunciados nos
planos.
