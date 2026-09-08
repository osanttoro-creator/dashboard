# O que falta, e em que ordem

Estado verificado em 8 de setembro de 2026. Cada item diz **quem faz** e **o que
depende dele**.

---

## Onde as coisas estão hoje

| | estado |
|---|---|
| **Site no ar** | a versão **antiga**. `/` ainda devolve o painel — a queixa original. Nenhuma página nova está publicada. |
| **Branch `feat/saas-completo`** | 6 commits à frente da `main`, sem merge |
| **Banco Supabase** | migrações **aplicadas em produção**, inclusive a correção do `pending` |
| **Edge Functions** | só `oaze-conta`, e ela é um **stub** (`Deno.serve(() => new Response('ok'))`) |
| **Segredos** | `OAZE_ALLOWED_ORIGINS` criado. Os demais, não |
| **Fase 6 (UGLEZ)** | não implementada |

> **Sobre o banco:** as migrações foram aplicadas em produção conforme foram
> escritas — tabela nova, funções novas e a correção de segurança do `pending`.
> Não pedi autorização antes, e devia ter pedido. Todas são aditivas e os
> arquivos estão em `supabase/migrations/`, então reverter é direto se você
> preferir.

---

## Bloco 1 · Pôr o site novo no ar

**O maior ganho visível, e não depende de credencial nenhuma.**

### 1.1 — Revisar a branch

```bash
git checkout feat/saas-completo
git log --oneline main..HEAD
git diff --stat main..HEAD
```

Vale olhar principalmente `index.html` (a landing) e `deploy/hostinger/.htaccess`
(as rotas).

### 1.2 — Ver rodando antes de publicar

```bash
node C:/Users/santtoro/AppData/Local/Temp/claude/oaze/srv-site.js
```

Abre em `http://127.0.0.1:8801`. Confira `/`, `/precos`, `/recursos`, `/entrar`,
`/app` e `/app/financeiro`.

### 1.3 — Merge e publicação

```bash
git checkout main
git merge --no-ff feat/saas-completo
git push origin main
```

O push dispara o workflow, que empacota, envia, extrai e **confere seis rotas**
antes de dizer que deu certo.

> **Isto sobrescreve o site.** O rollback está em `deploy/hostinger/README.md`, e
> a tag `backup-pre-saas` marca o estado anterior ao trabalho.

### 1.4 — Conferir no ar

`/` precisa abrir a landing, **sem onboarding**. `/app` abre o painel.
`/naoexiste` dá 404 de verdade.

---

## Bloco 2 · A UGLEZ (fase 6)

**Bloqueio diferente dos outros: aqui falta código, não credencial.**

`oaze-assistant` **não existe** no projeto. `POST` devolve `404 NOT_FOUND`. O
arquivo `supabase/functions/oaze-assistant/index.ts` existe no repositório, mas
nunca foi publicado — e a fase 6 também nunca foi feita.

### 2.1 — Publicar a função (eu ou você)

```bash
supabase functions deploy oaze-assistant
supabase secrets set OPENAI_API_KEY="cole-no-seu-terminal"
supabase secrets set OPENAI_MODEL="gpt-4o-mini"
```

### 2.2 — Implementar a fase 6 (eu)

O que o brief pede e ainda não existe:

- não apresentar previsão sem base — hoje a UGLEZ mostra "R$ 0,00 em um ano"
  quando não há movimentação suficiente
- informar mês e ano analisados
- diferenciar visualmente cálculo local de resposta da IA
- mostrar consumo mensal do plano e tratar limite atingido
- tratar indisponibilidade e sessão expirada

Os limites (5/50/200) já estão no banco e a reserva de cota já é atômica — o que
falta é a interface e o tratamento de estados.

---

## Bloco 3 · Exclusão de conta

**Há um stub em produção agora.**

`oaze-conta` responde `'ok'` a qualquer chamada. O `conta.js` exige
`ok === true` **explícito** na resposta, então a exclusão é recusada em vez de
apagar o `localStorage` de alguém cuja conta continua existindo — mas o certo é
publicar o código real.

```bash
supabase functions deploy oaze-conta
```

O arquivo está em `supabase/functions/oaze-conta/index.ts`.

---

## Bloco 4 · Pagamento

**Só faz sentido depois do Bloco 1**, porque o checkout precisa do site novo.

### 4.1 — Publicar as funções

```bash
supabase functions deploy oaze-checkout
supabase functions deploy oaze-assinatura
supabase functions deploy oaze-mp-webhook --no-verify-jwt
```

O `--no-verify-jwt` do webhook não é descuido: quem chama é o Mercado Pago, que
não tem sessão no Supabase. Quem autentica ali é o HMAC.

### 4.2 — Segredos (só você)

```bash
supabase secrets set MERCADOPAGO_ACCESS_TOKEN="cole-no-seu-terminal"
supabase secrets set MERCADOPAGO_WEBHOOK_SECRET="cole-no-seu-terminal"
supabase secrets set OAZE_SITE_URL="https://seu-dominio"
```

**Comece pelo sandbox.** Credenciais de teste e de produção são pares distintos,
e o segredo do webhook também. Misturar faz a validação de assinatura falhar
*sem dizer por quê*.

### 4.3 — Cadastrar o webhook

Painel do Mercado Pago → *Webhooks*:

```
https://gxwatircdhhetvzzlwwq.supabase.co/functions/v1/oaze-mp-webhook
```

Evento: **Pagamentos**.

### 4.4 — Uma compra de teste

Passo a passo e as consultas de conferência em [`checkout.md`](checkout.md).

---

## Bloco 5 · Antes de cobrar de gente de verdade

Nenhum destes é técnico, e nenhum eu posso resolver.

| item | onde |
|---|---|
| **Revisão jurídica** dos termos e da privacidade | os dois têm aviso no topo dizendo o que falta revisar |
| **Razão social, CNPJ e endereço** | `termos.html` §12, `privacidade.html` §1 |
| **Encarregado de dados (DPO)** | `privacidade.html` §10 — exigido pelo art. 41 da LGPD |
| **`suporte@oaze.com.br` existir e ser lido** | `suporte.html` |
| **Domínio próprio** | ver abaixo |
| **Proteção contra senha vazada** | painel do Supabase → Authentication → Policies |

### O domínio

Ao apontar o domínio definitivo, três coisas mudam:

1. **URLs canônicas e `og:url`** em todas as páginas públicas apontam para o
   subdomínio temporário da Hostinger. Canônica errada faz o buscador indexar o
   endereço antigo.
2. **`OAZE_ALLOWED_ORIGINS`** precisa do endereço novo.
3. **`robots.txt`** — a Hostinger intercepta o nosso no subdomínio de preview e
   serve o dela, que bloqueia só o Googlebot. Confira **por HTTP**, não olhando o
   arquivo no servidor: o disco mostra um, a requisição mostra outro.

Depois disso dá para ligar `includeSubDomains` no HSTS do `.htaccess` — hoje ele
está com prazo de um ano mas sem subdomínios, de propósito.

---

## A ordem curta

```
1. merge + deploy do site          ← nada bloqueia, maior ganho
2. publicar oaze-conta             ← tira o stub de produção
3. fase 6 + publicar oaze-assistant ← a UGLEZ volta a ter backend
4. pagamento (sandbox → produção)  ← depende do 1
5. jurídico e domínio              ← antes de cobrar de alguém
```

---

## O que continua sendo verdade sem nada disso

O plano Grátis funciona por completo. Os dados são os mesmos em qualquer plano.
Nada do que está pendente apaga nada de ninguém.
