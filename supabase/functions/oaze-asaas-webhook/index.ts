/* =============================================================
   oaze-asaas-webhook — o único caminho que libera plano pago
   -------------------------------------------------------------
   Publicada com verify_jwt = false: quem chama é o Asaas, que não
   tem sessão do Supabase. A autenticação é o cabeçalho
   `asaas-access-token`, comparado em tempo constante com o segredo
   ASAAS_WEBHOOK_TOKEN (o mesmo token cadastrado no painel do Asaas).
   Sem o segredo configurado, tudo é recusado.

   NÃO CONFIA NO CORPO
   O aviso só diz "algo aconteceu com o pagamento X". O estado real
   — status, valor, assinatura, externalReference — é buscado na API
   do Asaas com a nossa chave. Um aviso forjado com token vazado ainda
   teria de apontar para um pagamento real, confirmado, do valor
   exato combinado na intenção.

   IDEMPOTENTE
   O id do evento vai para asaas_eventos. Evento já processado
   responde 200 sem refazer nada. Falha no meio responde 500 para o
   Asaas tentar de novo.

   EVENTOS
     PAYMENT_CONFIRMED, PAYMENT_RECEIVED   plano ativo até o fim do ciclo
     PAYMENT_OVERDUE                       past_due (acesso segue até o fim do período)
     PAYMENT_REFUNDED, PAYMENT_CHARGEBACK_REQUESTED
                                           volta para o Semente na hora
     SUBSCRIPTION_DELETED, SUBSCRIPTION_INACTIVATED
                                           não renova; acesso até o fim do período
   ============================================================= */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { asaas, centavos } from '../_shared/asaas.ts';

const PAGO = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED']);
const ESTORNO = new Set(['PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED']);
const FIM = new Set(['SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED']);

/** Folga depois do vencimento: o cartão pode ser recusado e o Asaas tenta de novo por dias. */
const FOLGA_DIAS = 3;

function iguais(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

function fimDoCiclo(vencimento: string, ciclo: string): string {
  const d = new Date(vencimento + 'T12:00:00-03:00');
  if (ciclo === 'annual') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  d.setDate(d.getDate() + FOLGA_DIAS);
  return d.toISOString();
}

const resposta = (status: number) => new Response(status === 200 ? 'ok' : 'erro', { status });

Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const log = (evento: string, extra: Record<string, unknown> = {}) =>
    console.error(JSON.stringify({ request_id: requestId, evento, ...extra }));

  if (req.method !== 'POST') return resposta(405);

  const segredo = Deno.env.get('ASAAS_WEBHOOK_TOKEN') ?? '';
  const recebido = req.headers.get('asaas-access-token') ?? '';
  if (!segredo || segredo.length < 32 || !iguais(recebido, segredo)) {
    log('token_recusado');
    return resposta(401);
  }

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !servico) { log('config_incompleta'); return resposta(500); }
  const admin = createClient(url, servico, { auth: { persistSession: false, autoRefreshToken: false } });

  let aviso: any = null;
  try { aviso = await req.json(); } catch { return resposta(400); }
  const eventoId = String(aviso?.id || '');
  const tipo = String(aviso?.event || '');
  if (!eventoId || !tipo) return resposta(400);

  const interessa = PAGO.has(tipo) || tipo === 'PAYMENT_OVERDUE' || ESTORNO.has(tipo) || FIM.has(tipo);
  if (!interessa) return resposta(200);

  /* idempotência */
  await admin.from('asaas_eventos').upsert({ id: eventoId, evento: tipo }, { onConflict: 'id', ignoreDuplicates: true });
  const { data: registro } = await admin.from('asaas_eventos').select('processado').eq('id', eventoId).maybeSingle();
  if (registro?.processado) return resposta(200);

  try {
    /* ---- de onde veio: a assinatura no Asaas ---- */
    let pagamento: any = null;
    let subscriptionId = '';
    if (FIM.has(tipo)) {
      subscriptionId = String(aviso?.subscription?.id || '');
    } else {
      const pagamentoId = String(aviso?.payment?.id || '');
      if (!pagamentoId) return resposta(400);
      pagamento = await asaas('GET', '/payments/' + pagamentoId);
      subscriptionId = String(pagamento?.subscription || '');
    }
    if (!subscriptionId) { await concluir(); return resposta(200); }   // cobrança avulsa: não é do OAZE

    const assinatura = await asaas('GET', '/subscriptions/' + subscriptionId);
    const intencaoId = String(assinatura?.externalReference || '');

    const { data: intencao } = await admin.from('asaas_intencoes')
      .select('id, user_id, plan_id, ciclo, centavos, versao, asaas_subscription_id, status')
      .eq('id', intencaoId).maybeSingle();
    if (!intencao || intencao.asaas_subscription_id !== subscriptionId) {
      log('intencao_desconhecida', { tipo });
      await concluir();
      return resposta(200);
    }

    const agora = new Date().toISOString();
    const { data: atual } = await admin.from('subscriptions')
      .select('asaas_subscription_id').eq('user_id', intencao.user_id).maybeSingle();
    const eDaAssinaturaAtual = atual?.asaas_subscription_id === subscriptionId;

    if (PAGO.has(tipo)) {
      const status = String(pagamento?.status || '');
      if (!['CONFIRMED', 'RECEIVED'].includes(status)) {
        log('pagamento_nao_confirmado_na_api', { tipo, status });
        await concluir();
        return resposta(200);
      }
      if (centavos(pagamento.value) !== intencao.centavos) {
        log('valor_divergente', { esperado: intencao.centavos, recebido: centavos(pagamento.value) });
        await concluir();
        return resposta(200);
      }
      await admin.from('subscriptions').upsert({
        user_id: intencao.user_id,
        plan_id: intencao.plan_id,
        billing_cycle: intencao.ciclo,
        status: 'active',
        price_version: intencao.versao,
        asaas_subscription_id: subscriptionId,
        current_period_start: agora,
        current_period_end: fimDoCiclo(String(pagamento.dueDate), intencao.ciclo),
        cancel_at_period_end: false,
        canceled_at: null,
        updated_at: agora
      }, { onConflict: 'user_id' });
      await admin.from('asaas_intencoes').update({ status: 'paga', updated_at: agora }).eq('id', intencao.id);
      log('plano_liberado', { plano: intencao.plan_id, ciclo: intencao.ciclo });
    } else if (tipo === 'PAYMENT_OVERDUE') {
      if (eDaAssinaturaAtual) {
        await admin.from('subscriptions').update({ status: 'past_due', updated_at: agora })
          .eq('user_id', intencao.user_id);
      }
    } else if (ESTORNO.has(tipo)) {
      if (eDaAssinaturaAtual) {
        await asaas('DELETE', '/subscriptions/' + subscriptionId).catch(() => null);
        await admin.from('subscriptions').update({
          plan_id: 'free', status: 'free', current_period_end: agora,
          cancel_at_period_end: false, canceled_at: agora, updated_at: agora
        }).eq('user_id', intencao.user_id);
      }
      await admin.from('asaas_intencoes').update({ status: 'estornada', updated_at: agora }).eq('id', intencao.id);
      log('plano_revogado', { tipo });
    } else if (FIM.has(tipo)) {
      if (eDaAssinaturaAtual) {
        await admin.from('subscriptions').update({
          status: 'canceled', cancel_at_period_end: true, canceled_at: agora, updated_at: agora
        }).eq('user_id', intencao.user_id);
      }
      if (intencao.status === 'aguardando') {
        await admin.from('asaas_intencoes').update({ status: 'cancelada', updated_at: agora }).eq('id', intencao.id);
      }
    }

    await concluir();
    return resposta(200);
  } catch (e) {
    log('falhou', { tipo, erro: e instanceof Error ? e.message : 'desconhecido' });
    return resposta(500);   // o Asaas reenvia
  }

  async function concluir() {
    await admin.from('asaas_eventos').update({ processado: true }).eq('id', eventoId);
  }
});
