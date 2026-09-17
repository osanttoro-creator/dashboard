/* Travas estáticas da cobrança Stripe. */
'use strict';
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..', '..');
const ler = (a) => fs.readFileSync(path.join(raiz, a), 'utf8');
const falhas = [];
const exige = (ok, msg) => { if (!ok) falhas.push(msg); };

const pagamento = ler('supabase/functions/oaze-pagamento/index.ts');
const webhook = ler('supabase/functions/oaze-stripe-webhook/index.ts');
const stripe = ler('supabase/functions/_shared/stripe.ts');
const conta = ler('supabase/functions/oaze-conta/index.ts');
const migration = ler('supabase/migrations/20260913180000_stripe_e_rate_limits.sql');
const config = ler('supabase/config.toml');
const precos = ler('assets/js/pages/precos.js');

exige(/from\('plan_prices'\)/.test(pagamento), 'oaze-pagamento não lê o preço de plan_prices');
exige(!/corpo\.(centavos|valor|preco|moeda)/.test(pagamento), 'oaze-pagamento aceita valor do navegador');
/* A lista de campos aceitos continua explícita; o cupom entrou nela
   (código, nunca valor). Qualquer outro campo continua recusado. */
exige(/new Set\(\['acao', 'plano', 'ciclo'(, 'cupom')?\]\)/.test(pagamento), 'oaze-pagamento não bloqueia campos extras');
exige(/new Set\(\['acao', 'plano', 'ciclo', 'codigo'\]\)/.test(pagamento), 'a consulta de cupom aceita campos extras');
exige(/cupom:minuto/.test(pagamento), 'a consulta de cupom não tem limite próprio contra tentativa e erro');
exige(/mode', 'subscription'/.test(pagamento), 'Checkout não está em modo de assinatura');
exige(pagamento.includes('checkout\\.stripe\\.com') && precos.includes('checkout\\.stripe\\.com'), 'redirecionamento não restringe o host da Stripe');
exige(!/from\('subscriptions'\)\.(insert|upsert)/.test(pagamento), 'checkout libera plano sem webhook');
exige(/Idempotency-Key/.test(stripe) && /checkout-/.test(pagamento), 'requisição Stripe sem idempotência');

exige(/req\.text\(\)/.test(webhook), 'webhook não usa o corpo cru');
exige(/stripe-signature/.test(webhook), 'webhook não lê Stripe-Signature');
exige(/crypto\.subtle\.sign/.test(stripe) && /HMAC/.test(stripe), 'assinatura HMAC não é conferida');
exige(/stripe_eventos/.test(webhook) && /processado/.test(webhook), 'webhook sem idempotência de evento');
exige(/valor !== intencao\.centavos/.test(webhook) && /moeda !== 'BRL'/.test(webhook), 'webhook não confere preço e moeda');
exige(/reservarRateLimit/.test(pagamento) && /reservarRateLimit/.test(webhook), 'endpoint sem rate limit');

const cancelaStripe = conta.indexOf("stripe('DELETE'");
const apagaUsuario = conta.indexOf('deleteUser(');
exige(cancelaStripe > 0 && cancelaStripe < apagaUsuario, 'exclusão da conta não encerra a Stripe antes');
exige(/stripe_intencoes[\s\S]*enable row level security/.test(migration), 'stripe_intencoes sem RLS');
exige(/revoke all on public\.stripe_intencoes/.test(migration), 'tabelas Stripe expostas ao navegador');
exige(/\[functions\.oaze-stripe-webhook\][\s\S]*verify_jwt = false/.test(config), 'configuração do webhook ausente');

if (falhas.length) { console.error(falhas.join('\n')); process.exit(1); }
console.log('OK - Stripe preparada com preço de servidor, assinatura, idempotência e RLS');
