# Histórico da cobrança pelo Asaas

> Transição em 13/09/2026: novas assinaturas foram movidas para a Stripe. Este
> documento permanece apenas para encerrar ou migrar assinaturas antigas sem
> deixar cobrança órfã. Para o fluxo atual, veja `STRIPE-CONFIGURACAO.md`.

Planos v3 (13/09/2026): **Semente** grátis · **Coqueiro** R$ 14,90/mês ou R$ 149,90/ano ·
**Oásis** R$ 29,90/mês ou R$ 299,90/ano. Só cartão de crédito, recorrente.

Os ids internos continuam `free`, `basic` e `pro`.

## Como funciona

1. Em **Planos**, a pessoa escolhe o plano e informa nome e CPF (o Asaas exige).
2. `oaze-pagamento` lê o preço em `plan_prices`, cria (ou reaproveita) o cliente e a
   assinatura no Asaas com `billingType: CREDIT_CARD` e devolve a fatura (`invoiceUrl`).
3. A pessoa digita o cartão na página do Asaas. O OAZE nunca vê o cartão.
4. O Asaas avisa `oaze-asaas-webhook`. A função confere o token, busca o pagamento e a
   assinatura **na API do Asaas**, confere o valor com a intenção e só então grava o plano
   em `subscriptions`.
5. Cancelar em Configurações apaga a assinatura no Asaas; o acesso segue até
   `current_period_end`. Excluir a conta faz o mesmo antes de apagar o usuário.

| Evento do Asaas | Efeito |
|---|---|
| `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED` | plano ativo até o vencimento + 1 ciclo + 3 dias |
| `PAYMENT_OVERDUE` | `past_due`, acesso até o fim do período |
| `PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED` | volta ao Semente na hora |
| `SUBSCRIPTION_DELETED`, `SUBSCRIPTION_INACTIVATED` | não renova |

Tabelas só do servidor (RLS sem política): `asaas_clientes`, `asaas_intencoes`,
`asaas_eventos`. CPF e cartão não são gravados.

## Configurar (feito pelo dono da conta, nunca pelo assistente)

1. **Asaas → Integrações → Chave de API.** Comece no **sandbox**
   (`sandbox.asaas.com`), com uma chave de sandbox.
2. **Asaas → Minha conta → Informações:** cadastre o domínio do site (exigido para a
   fatura devolver a pessoa ao OAZE).
3. **Asaas → Integrações → Webhooks → Adicionar:**
   - URL: `https://gxwatircdhhetvzzlwwq.supabase.co/functions/v1/oaze-asaas-webhook`
   - Token de autenticação: gere um valor aleatório com **32+ caracteres** e guarde.
   - Eventos: cobranças (`PAYMENT_*`) e assinaturas (`SUBSCRIPTION_*`).
   - Fila ativa, versão da API v3.
4. **Segredos no Supabase** (Dashboard → Edge Functions → Secrets, ou CLI):

   ```bash
   supabase secrets set ASAAS_API_KEY=... ASAAS_AMBIENTE=sandbox ASAAS_WEBHOOK_TOKEN=... OAZE_RETORNO_URL=https://SEU-DOMINIO/app/planos?assinatura=ok --project-ref gxwatircdhhetvzzlwwq
   ```

   `OAZE_ALLOWED_ORIGINS` já existe (usado pelas outras funções).
5. Teste no sandbox (roteiro abaixo). Depois troque para a chave de produção e
   `ASAAS_AMBIENTE=producao`, e recadastre o webhook na conta de produção.

## Roteiro de teste no sandbox

- Assinar o Coqueiro mensal com CPF de teste → a fatura abre → pagar com cartão de teste
  do Asaas → em até 1 min o app mostra "Plano Coqueiro liberado".
- **Conferir a renovação automática:** no painel do sandbox, a próxima cobrança da
  assinatura deve aparecer com o cartão salvo (sem pedir o cartão de novo). Se o Asaas
  exigir o cartão a cada fatura nesse fluxo, o próximo passo é tokenizar o cartão.
- Cancelar em Configurações → a assinatura some do Asaas e o app mostra "até dd/mm".
- Estornar a cobrança no painel → o plano volta ao Semente.
- Reenviar o mesmo evento pelo painel de webhooks → nada muda (idempotência).

## Taxas e margem (base do preço)

Cartão Asaas: R$ 0,49 + 2,99% (1,99% nos 3 primeiros meses). Com 6% de imposto e a IA no
pior caso, sobram ~R$ 12,59 por Coqueiro e ~R$ 24,16 por Oásis por mês. O custo fixo
(~R$ 165/mês) se paga com 13 Coqueiros.
