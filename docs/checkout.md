# Checkout e assinaturas

Como o dinheiro entra, e onde ele **não** pode ser decidido.

---

## A regra que organiza tudo

**Nenhuma tela ativa um plano.** Nem o retorno do checkout, nem um clique, nem
uma resposta de sucesso. Só o webhook, e só depois de três verificações
independentes:

1. a **assinatura** do cabeçalho `x-signature` confere (HMAC-SHA256);
2. o pagamento é **reconsultado** na API do Mercado Pago — o corpo da
   notificação é um aviso de que algo mudou, não a fonte da verdade;
3. o **valor pago** bate com o valor congelado na intenção de compra.

Falhar qualquer uma não libera nada.

---

## O caminho, do clique ao plano

```
navegador                Edge Function            Mercado Pago         banco
   │  { plano, ciclo }        │                        │                │
   │ ─────────────────────►   │                        │                │
   │   (NUNCA o preço)        │  lê plan_prices ───────────────────────►│
   │                          │  cria checkout_intencoes ──────────────►│
   │                          │  ── cria preferência ─►│                │
   │  ◄── init_point ─────────│                        │                │
   │ ─── vai pagar ──────────────────────────────────► │                │
   │                          │                        │                │
   │                     oaze-mp-webhook  ◄── notifica │                │
   │                          │  1. confere assinatura │                │
   │                          │  2. reconsulta ───────►│                │
   │                          │  3. confere valor      │                │
   │                          │  aplicar_evento_pagamento ─────────────►│
   │                          │     (evento + assinatura, atômico)      │
```

O `external_reference` que vai na preferência é o id da intenção. É por ele que
o webhook descobre de quem é o pagamento.

---

## Os seis status, e o que cada um concede

O plano que **vale** é calculado por `meus_direitos()`, não lido de uma coluna.
A regra cabe numa frase:

> Você tem o plano que pagou, enquanto durar o período que pagou.

| status | dentro do período pago | fora dele |
|---|---|---|
| `active` | o plano | o agendado, ou Grátis |
| `past_due` | o plano — falhou a **renovação**, o já pago continua valendo | Grátis |
| `canceled` | o plano — cancelar desliga a renovação, não corta no meio | o agendado, ou Grátis |
| `pending` | **Grátis** | Grátis |
| `expired` | Grátis | Grátis |
| `free` | Grátis | Grátis |

> **`pending` não concede, e isso é o ponto.** A versão anterior fazia
> `status in ('active','pending')`. `pending` é o boleto emitido e ainda não
> compensado: bastava iniciar um checkout para ter Pro sem pagar nada, e nenhum
> erro apareceria. Corrigido, e coberto por `tools/testes/plano-efetivo.sql`.

O downgrade agendado também sai daí: como o plano é **calculado na leitura**, ele
vira no instante em que o relógio passa. Não há tarefa periódica para atrasar.

---

## Idempotência, em duas camadas

**No provedor.** O `X-Idempotency-Key` da criação da preferência é o id da
intenção: dois cliques rápidos no mesmo botão não viram duas cobranças.

**No banco.** `subscription_events` tem índice único em
`(provider, external_event_id)`, e a chave usada é o **id do pagamento** — não o
`x-request-id`. O Mercado Pago reenvia a mesma notificação com request-id
diferente; usar o request-id deixaria a porta aberta para processar o mesmo
pagamento várias vezes.

E o registro do evento e a mudança da assinatura acontecem na **mesma
transação**, dentro de `private.aplicar_evento_pagamento`. Separadas, uma falha
no meio deixaria o evento gravado e o plano não — e a retentativa do provedor
seria recusada como duplicada. A pessoa teria pagado sem receber.

---

## O que fazer para ligar

Nada disso pede que você cole segredo em lugar nenhum além do seu terminal.

### 1 · Publicar as três Edge Functions

```bash
supabase functions deploy oaze-checkout
supabase functions deploy oaze-assinatura
supabase functions deploy oaze-mp-webhook --no-verify-jwt
```

O `--no-verify-jwt` do webhook **não é descuido**: quem chama é o Mercado Pago,
que não tem sessão no Supabase. Quem faz o papel da autenticação ali é a
assinatura HMAC — e é por isso que uma assinatura inválida responde 401 e para.

### 2 · Configurar os segredos

```bash
supabase secrets set MERCADOPAGO_ACCESS_TOKEN="cole-no-seu-terminal"
supabase secrets set MERCADOPAGO_WEBHOOK_SECRET="cole-no-seu-terminal"
supabase secrets set OAZE_SITE_URL="https://seu-dominio"
```

Onde encontrar:

- **Access token** — painel do Mercado Pago → *Suas integrações* → sua aplicação
  → *Credenciais*
- **Webhook secret** — painel → *Webhooks* → *Configurar notificações* →
  *Assinatura secreta*

> **Comece pelo sandbox.** As credenciais de teste e as de produção são pares
> distintos, e o segredo do webhook também. Misturar um token de teste com um
> segredo de produção faz a validação de assinatura falhar **sem dizer por quê**
> — é a forma mais comum de perder uma tarde nesta integração.

### 3 · Cadastrar a URL do webhook

No painel do Mercado Pago, em *Webhooks*:

```
https://<seu-projeto>.supabase.co/functions/v1/oaze-mp-webhook
```

Evento: **Pagamentos**.

### 4 · Conferir

Faça uma compra em sandbox e confira, nesta ordem:

```sql
select id, plan_id, billing_cycle, centavos, status from public.checkout_intencoes
order by created_at desc limit 5;

select tipo, para_status, external_event_id, created_at from public.subscription_events
order by created_at desc limit 10;

select plan_id, status, current_period_end from public.subscriptions
where user_id = '<uuid>';
```

O que precisa ser verdade: a intenção sai de `aberta` para `paga`, aparece **um**
evento por pagamento (reenvios não criam outro), e a assinatura só vira `active`
depois disso.

---

## O que o navegador nunca faz

- **Não envia preço.** O `oaze-checkout` recusa o corpo com `centavos`, `valor`
  ou `preco` — se vier, é cliente adulterado ou integração escrita errado, e
  ignorar em silêncio esconderia os dois.
- **Não ativa plano.** Nem no retorno do checkout, nem em lugar nenhum.
- **Não sobe de plano pelo `oaze-assinatura`.** Aquela função só cancela, retoma
  e **desce** — subir envolve cobrança, e cobrança passa pelo webhook.

O `auto_return` da preferência fica desligado de propósito: o retorno automático
levaria a pessoa de volta com cara de "pronto", e o plano só vale depois do
webhook.

---

## O que acontece com os dados ao descer de plano

Nada é apagado. Nem no cancelamento, nem no downgrade, nem quando o período
termina. O que passa do limite do plano novo entra em **modo de visualização** —
visível, exportável, presente nos relatórios de períodos passados — e o que para
é a criação de novos. Ver `assets/js/limites.js`, seção *excedente*.

---

## Testes

| arquivo | o que prova |
|---|---|
| `tools/testes/assinatura-webhook.js` | 13 casos no portão HMAC: replay, id maiúsculo, segmento vazio, segredo trocado, id adulterado |
| `tools/testes/plano-efetivo.sql` | 9 casos de `meus_direitos()`, incluindo `pending` → Grátis |

O primeiro roda no CI. O segundo precisa de banco e é rodado à mão.

> Os manifestos do teste de assinatura são **literais**, escritos como o Mercado
> Pago documenta. A primeira versão assinava com a mesma função que o portão usa
> — removi a minusculização de propósito, as duas pontas erraram igual, e os 13
> casos continuaram passando. Um teste em que a especificação e a implementação
> são o mesmo código não verifica nada.
