/* =============================================================
   oaze-stripe-webhook — concilia a assinatura confirmada na Stripe

   Não usa JWT porque quem chama é a Stripe. A autenticação é a
   assinatura HMAC do corpo cru, com tolerância de cinco minutos.
   Eventos repetidos são idempotentes no banco.
   ============================================================= */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { assinaturaStripeValida, stripe } from '../_shared/stripe.ts';
import { reservarRateLimit, corpoCabeNoLimite } from '../_shared/security.ts';

const INTERESSA = new Set([
  'checkout.session.completed', 'checkout.session.expired',
  'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
  'invoice.paid', 'invoice.payment_failed',
  'charge.dispute.created', 'refund.created'
]);

const resposta = (status: number) => new Response(status === 200 ? 'ok' : 'erro', {
  status,
  headers: { 'content-type': 'text/plain; charset=utf-8' }
});

const id = (v: any): string => typeof v === 'string' ? v : typeof v?.id === 'string' ? v.id : '';
const instante = (segundos: unknown): string | null =>
  typeof segundos === 'number' && Number.isFinite(segundos)
    ? new Date(segundos * 1000).toISOString() : null;

function assinaturaDaFatura(fatura: any): string {
  return id(fatura?.subscription) || id(fatura?.parent?.subscription_details?.subscription);
}

Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const log = (evento: string, extra: Record<string, unknown> = {}) =>
    console.error(JSON.stringify({ request_id: requestId, evento, ...extra }));

  if (req.method !== 'POST') return resposta(405);
  if (!corpoCabeNoLimite(req, 262_144)) return resposta(413);

  const corpoCru = await req.text();
  const cabecalho = req.headers.get('stripe-signature') || '';
  if (!(await assinaturaStripeValida(corpoCru, cabecalho))) {
    log('assinatura_recusada');
    return resposta(401);
  }

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !servico) { log('config_incompleta'); return resposta(500); }
  const admin = createClient(url, servico, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const limite = await reservarRateLimit(admin, 'stripe:webhook', 'stripe-assinado', 600, 60);
    if (!limite.permitido) { log('rate_limit'); return resposta(429); }
  } catch { log('rate_limit_indisponivel'); return resposta(500); }

  let evento: any;
  try { evento = JSON.parse(corpoCru); } catch { return resposta(400); }
  const eventoId = typeof evento?.id === 'string' ? evento.id : '';
  const tipo = typeof evento?.type === 'string' ? evento.type : '';
  if (!/^evt_[A-Za-z0-9_]+$/.test(eventoId) || !tipo) return resposta(400);
  if (!INTERESSA.has(tipo)) return resposta(200);

  await admin.from('stripe_eventos').upsert(
    { id: eventoId, evento: tipo }, { onConflict: 'id', ignoreDuplicates: true }
  );
  const { data: registro } = await admin.from('stripe_eventos')
    .select('processado').eq('id', eventoId).maybeSingle();
  if (registro?.processado) return resposta(200);

  const concluir = () => admin.from('stripe_eventos').update({ processado: true }).eq('id', eventoId);

  try {
    const objeto = evento?.data?.object || {};

    if (tipo === 'checkout.session.expired') {
      const intencaoId = String(objeto?.metadata?.oaze_intencao_id || objeto?.client_reference_id || '');
      if (intencaoId) await admin.from('stripe_intencoes').update({
        status: 'expirada', updated_at: new Date().toISOString()
      }).eq('id', intencaoId).eq('status', 'aguardando');
      await concluir();
      return resposta(200);
    }

    let assinaturaId = '';
    let revogarAgora = false;
    if (tipo.startsWith('customer.subscription.')) assinaturaId = id(objeto);
    else if (tipo === 'checkout.session.completed') assinaturaId = id(objeto?.subscription);
    else if (tipo.startsWith('invoice.')) assinaturaId = assinaturaDaFatura(objeto);
    else if (tipo === 'refund.created' || tipo === 'charge.dispute.created') {
      const chargeId = tipo === 'refund.created' ? id(objeto?.charge) : id(objeto?.charge);
      if (chargeId) {
        const charge = await stripe('GET', '/charges/' + encodeURIComponent(chargeId));
        const invoiceId = id(charge?.invoice);
        if (invoiceId) {
          const invoice = await stripe('GET', '/invoices/' + encodeURIComponent(invoiceId));
          assinaturaId = assinaturaDaFatura(invoice);
        }
      }
      revogarAgora = true;
    }

    if (!assinaturaId) {
      log('evento_sem_assinatura', { tipo });
      await concluir();
      return resposta(200);
    }

    const assinatura = await stripe('GET', '/subscriptions/' + encodeURIComponent(assinaturaId));
    const intencaoId = String(assinatura?.metadata?.oaze_intencao_id || '');
    const { data: intencao } = await admin.from('stripe_intencoes')
      .select('id,user_id,plan_id,ciclo,price_id,centavos,versao,status')
      .eq('id', intencaoId).maybeSingle();
    if (!intencao || assinatura?.metadata?.oaze_plan_id !== intencao.plan_id
        || assinatura?.metadata?.oaze_price_id !== intencao.price_id) {
      log('intencao_desconhecida', { tipo });
      await concluir();
      return resposta(200);
    }

    const item = assinatura?.items?.data?.[0];
    const valor = Number(item?.price?.unit_amount);
    const moeda = String(item?.price?.currency || '').toUpperCase();
    if (!Number.isInteger(valor) || valor !== intencao.centavos || moeda !== 'BRL') {
      log('preco_divergente', { tipo });
      await admin.from('stripe_intencoes').update({ status: 'falhou', updated_at: new Date().toISOString() })
        .eq('id', intencao.id);
      await concluir();
      return resposta(200);
    }

    const agora = new Date().toISOString();
    const statusStripe = String(assinatura?.status || '');
    const inicio = instante(assinatura?.current_period_start ?? item?.current_period_start);
    const fim = instante(assinatura?.current_period_end ?? item?.current_period_end);
    const customerId = id(assinatura?.customer);
    const ativo = ['active', 'trialing'].includes(statusStripe);
    const atrasado = ['past_due', 'unpaid', 'paused'].includes(statusStripe);
    const encerrado = ['canceled', 'incomplete_expired'].includes(statusStripe);

    if (revogarAgora) {
      await stripe('DELETE', '/subscriptions/' + encodeURIComponent(assinaturaId), undefined,
        'revogar-' + intencao.id).catch(() => null);
      await admin.from('subscriptions').update({
        plan_id: 'free', status: 'free', current_period_end: agora,
        cancel_at_period_end: false, canceled_at: agora, updated_at: agora
      }).eq('user_id', intencao.user_id).eq('stripe_subscription_id', assinaturaId);
      await admin.from('stripe_intencoes').update({ status: 'estornada', updated_at: agora }).eq('id', intencao.id);
      log('plano_revogado', { tipo });
    } else if (ativo || atrasado) {
      await admin.from('subscriptions').upsert({
        user_id: intencao.user_id,
        plan_id: intencao.plan_id,
        billing_cycle: intencao.ciclo,
        status: ativo ? 'active' : 'past_due',
        price_version: intencao.versao,
        stripe_customer_id: customerId || null,
        stripe_subscription_id: assinaturaId,
        asaas_subscription_id: null,
        current_period_start: inicio,
        current_period_end: fim,
        cancel_at_period_end: !!assinatura?.cancel_at_period_end,
        canceled_at: assinatura?.cancel_at ? instante(assinatura.cancel_at) : null,
        updated_at: agora
      }, { onConflict: 'user_id' });
      await admin.from('stripe_intencoes').update({
        stripe_subscription_id: assinaturaId, status: ativo ? 'ativa' : 'aguardando', updated_at: agora
      }).eq('id', intencao.id);
      log(ativo ? 'plano_liberado' : 'pagamento_atrasado', { plano: intencao.plan_id, ciclo: intencao.ciclo });
    } else if (encerrado || tipo === 'customer.subscription.deleted') {
      await admin.from('subscriptions').update({
        status: 'canceled', cancel_at_period_end: true,
        current_period_end: fim, canceled_at: agora, updated_at: agora
      }).eq('user_id', intencao.user_id).eq('stripe_subscription_id', assinaturaId);
      await admin.from('stripe_intencoes').update({ status: 'cancelada', updated_at: agora }).eq('id', intencao.id);
    } else {
      await admin.from('stripe_intencoes').update({
        stripe_subscription_id: assinaturaId, status: 'aguardando', updated_at: agora
      }).eq('id', intencao.id);
    }

    await concluir();
    return resposta(200);
  } catch (e) {
    log('falhou', { tipo, erro: e instanceof Error ? e.message.slice(0, 120) : 'desconhecido' });
    return resposta(500);
  }
});
