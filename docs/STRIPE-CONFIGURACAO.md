# Stripe no OAZE — configuração que falta no painel

O código está preparado para o Checkout hospedado da Stripe. Cartão e CVC são digitados na Stripe e não passam pelo OAZE. A contratação só libera o plano depois que um webhook assinado confirma o estado da assinatura.

## Segredos

Guarde estes valores em **Supabase → Edge Functions → Secrets**. Não cole nenhum deles em conversa, arquivo do site, GitHub Actions ou `assets/`.

- `STRIPE_SECRET_KEY`: comece com uma chave de teste. Quando o fluxo estiver aprovado, troque pela chave de produção ou por uma chave restrita com o menor conjunto de permissões que permita Checkout, assinaturas e leitura dos eventos conciliados.
- `STRIPE_WEBHOOK_SECRET`: começa com `whsec_` e pertence ao endpoint de webhook abaixo.
- `OAZE_SITE_URL`: `https://oaze.site`
- `OAZE_ALLOWED_ORIGINS`: `https://oaze.site`

O arquivo `.env.example` contém apenas os nomes. Valores reais ficam no cofre do Supabase.

## Webhook

Crie um endpoint na Stripe apontando para:

`https://gxwatircdhhetvzzlwwq.supabase.co/functions/v1/oaze-stripe-webhook`

Eventos usados pelo OAZE:

- `checkout.session.completed`
- `checkout.session.expired`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`
- `charge.dispute.created`
- `refund.created`

Depois de criar o endpoint, copie o segredo de assinatura para `STRIPE_WEBHOOK_SECRET`. O código recusa corpo alterado, assinatura com mais de cinco minutos e evento repetido.

## Ordem segura de ativação

1. Configurar as chaves de teste e o webhook.
2. Fazer uma assinatura completa no modo de teste.
3. Confirmar no banco que o plano só mudou depois do webhook.
4. Testar renovação, falha de pagamento, cancelamento, estorno e exclusão de conta.
5. Aprovar Termos e Política de Privacidade.
6. Só então trocar para a chave de produção.

Assinaturas antigas do Asaas continuam canceláveis durante a transição. Nenhuma assinatura nova é criada no Asaas. Ele só deve ser removido depois que as assinaturas existentes forem migradas ou encerradas.
