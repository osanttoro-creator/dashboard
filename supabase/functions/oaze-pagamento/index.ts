/* =============================================================
   oaze-pagamento — Checkout e cancelamento pela Stripe

   O navegador escolhe apenas plano e ciclo. Preço, moeda, versão,
   usuário e estado da assinatura vêm do token e do banco. O plano
   pago só é liberado pelo webhook assinado.

   Assinaturas antigas do Asaas continuam canceláveis durante a
   migração. Nenhuma assinatura nova é criada lá.
   ============================================================= */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { asaas, AsaasErro } from '../_shared/asaas.ts';
import { reservarRateLimit, corpoCabeNoLimite } from '../_shared/security.ts';
import { stripe, stripeConfigurada, StripeErro } from '../_shared/stripe.ts';

const NOMES: Record<string, string> = { basic: 'Coqueiro', pro: 'Oásis' };

function origensPermitidas(): string[] {
  return (Deno.env.get('OAZE_ALLOWED_ORIGINS') ?? '')
    .split(',').map((o) => o.trim()).filter(Boolean);
}

function cors(origem: string | null): Record<string, string> {
  const ok = !!origem && origensPermitidas().includes(origem);
  return {
    'Access-Control-Allow-Origin': ok ? origem! : 'null',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '3600',
    Vary: 'Origin'
  };
}

function json(corpo: unknown, status: number, origem: string | null, extras: Record<string, string> = {}) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors(origem), ...extras, 'content-type': 'application/json; charset=utf-8' }
  });
}

function siteUrl(): string | null {
  const valor = (Deno.env.get('OAZE_SITE_URL') ?? 'https://oaze.site').trim().replace(/\/+$/, '');
  try {
    const u = new URL(valor);
    return u.protocol === 'https:' ? u.origin : null;
  } catch { return null; }
}

function corpoPermitido(corpo: unknown, acao: string): boolean {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) return false;
  const permitidos = acao === 'assinar' ? new Set(['acao', 'plano', 'ciclo']) : new Set(['acao']);
  return Object.keys(corpo as Record<string, unknown>).every((k) => permitidos.has(k));
}

Deno.serve(async (req: Request) => {
  const origem = req.headers.get('Origin');
  const requestId = crypto.randomUUID();
  const log = (evento: string, extra: Record<string, unknown> = {}) =>
    console.error(JSON.stringify({ request_id: requestId, evento, ...extra }));

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origem) });
  if (req.method !== 'POST') return json({ erro: 'metodo', mensagem: 'Método não permitido.' }, 405, origem);
  if (origem && !origensPermitidas().includes(origem)) {
    return json({ erro: 'origem', mensagem: 'Origem não autorizada.' }, 403, origem);
  }
  if (!corpoCabeNoLimite(req, 4096)) {
    return json({ erro: 'corpo', mensagem: 'Requisição inválida.' }, 413, origem);
  }

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const retorno = siteUrl();
  if (!url || !servico || !retorno || !stripeConfigurada()) {
    log('config_incompleta');
    return json({ erro: 'indisponivel', mensagem: 'As assinaturas ainda não estão abertas.' }, 503, origem);
  }

  const autorizacao = req.headers.get('Authorization') ?? '';
  if (!autorizacao.startsWith('Bearer ')) {
    return json({ erro: 'sem_sessao', mensagem: 'Sua sessão expirou. Entre novamente.' }, 401, origem);
  }
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: auth, error: erroAuth } = await userClient.auth.getUser();
  const usuario = auth?.user;
  if (erroAuth || !usuario?.id || !usuario.email) {
    return json({ erro: 'sem_sessao', mensagem: 'Sua sessão expirou. Entre novamente.' }, 401, origem);
  }

  const admin = createClient(url, servico, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const curto = await reservarRateLimit(admin, 'pagamento:minuto', usuario.id, 10, 60);
    const diario = await reservarRateLimit(admin, 'pagamento:dia', usuario.id, 50, 86_400);
    if (!curto.permitido || !diario.permitido) {
      const tentarEm = !curto.permitido ? curto.tentarEm : diario.tentarEm;
      return json({ erro: 'limite', mensagem: 'Muitas tentativas seguidas. Tente novamente mais tarde.' }, 429, origem,
        { 'Retry-After': String(tentarEm) });
    }
  } catch {
    log('rate_limit_indisponivel');
    return json({ erro: 'indisponivel', mensagem: 'Operação indisponível no momento.' }, 503, origem);
  }

  let corpo: Record<string, unknown> = {};
  try { corpo = await req.json(); } catch { /* validado abaixo */ }
  const acao = typeof corpo.acao === 'string' ? corpo.acao : '';
  if (!['assinar', 'cancelar'].includes(acao) || !corpoPermitido(corpo, acao)) {
    return json({ erro: 'acao', mensagem: 'Ação inválida.' }, 400, origem);
  }

  const { data: atual } = await admin.from('subscriptions')
    .select('plan_id,status,current_period_end,cancel_at_period_end,stripe_subscription_id,asaas_subscription_id')
    .eq('user_id', usuario.id).maybeSingle();

  try {
    if (acao === 'cancelar') {
      if (atual?.stripe_subscription_id) {
        const p = new URLSearchParams({ cancel_at_period_end: 'true' });
        const s = await stripe('POST', '/subscriptions/' + encodeURIComponent(atual.stripe_subscription_id), p,
          'cancelar-' + usuario.id + '-' + atual.stripe_subscription_id);
        await admin.from('subscriptions').update({
          status: 'canceled', cancel_at_period_end: true,
          canceled_at: new Date().toISOString(), updated_at: new Date().toISOString()
        }).eq('user_id', usuario.id).eq('stripe_subscription_id', s.id);
      } else if (atual?.asaas_subscription_id) {
        try { await asaas('DELETE', '/subscriptions/' + atual.asaas_subscription_id); }
        catch (e) { if (!(e instanceof AsaasErro && e.status === 404)) throw e; }
        await admin.from('subscriptions').update({
          status: 'canceled', cancel_at_period_end: true,
          canceled_at: new Date().toISOString(), updated_at: new Date().toISOString()
        }).eq('user_id', usuario.id);
      } else {
        return json({ erro: 'sem_assinatura', mensagem: 'Não há assinatura paga para cancelar.' }, 400, origem);
      }
      log('assinatura_cancelada');
      return json({ ok: true, acesso_ate: atual.current_period_end }, 200, origem);
    }

    const plano = typeof corpo.plano === 'string' ? corpo.plano : '';
    const ciclo = typeof corpo.ciclo === 'string' ? corpo.ciclo : '';
    if (!NOMES[plano] || !['monthly', 'annual'].includes(ciclo)) {
      return json({ erro: 'plano', mensagem: 'Plano inválido.' }, 400, origem);
    }

    const vigente = atual && atual.plan_id !== 'free'
      && ['active', 'past_due'].includes(atual.status) && !atual.cancel_at_period_end
      && (!atual.current_period_end || new Date(atual.current_period_end) > new Date());
    if (vigente) {
      return json({
        erro: 'ja_assina',
        mensagem: 'Você já tem uma assinatura ativa. Para trocar de plano, cancele a atual em Configurações.'
      }, 409, origem);
    }

    const { data: preco } = await admin.from('plan_prices')
      .select('id,centavos,versao,moeda').eq('plan_id', plano).eq('ciclo', ciclo).eq('vigente', true)
      .maybeSingle();
    if (!preco || !Number.isInteger(preco.centavos) || preco.centavos < 1 || preco.moeda !== 'BRL') {
      log('preco_ausente', { plano, ciclo });
      return json({ erro: 'indisponivel', mensagem: 'Plano indisponível no momento.' }, 503, origem);
    }

    const { data: pendentes } = await admin.from('stripe_intencoes')
      .select('id,price_id,checkout_session_id,created_at')
      .eq('user_id', usuario.id).eq('status', 'aguardando');
    for (const p of pendentes ?? []) {
      const recente = Date.now() - new Date(p.created_at).getTime() < 30 * 60 * 1000;
      if (recente && p.price_id === preco.id && p.checkout_session_id) {
        const sessao = await stripe('GET', '/checkout/sessions/' + encodeURIComponent(p.checkout_session_id));
        if (sessao?.status === 'open' && /^https:\/\/checkout\.stripe\.com\//.test(String(sessao.url || ''))) {
          return json({ ok: true, url: sessao.url }, 200, origem);
        }
      }
      await admin.from('stripe_intencoes').update({
        status: 'expirada', updated_at: new Date().toISOString()
      }).eq('id', p.id).eq('status', 'aguardando');
    }

    const { data: intencao, error: erroIntencao } = await admin.from('stripe_intencoes').insert({
      user_id: usuario.id, plan_id: plano, ciclo, price_id: preco.id,
      centavos: preco.centavos, versao: preco.versao
    }).select('id').single();
    if (erroIntencao || !intencao) throw new Error('intencao');

    const parametros = new URLSearchParams();
    parametros.set('mode', 'subscription');
    parametros.set('client_reference_id', intencao.id);
    parametros.set('customer_email', usuario.email);
    parametros.set('success_url', retorno + '/app/planos?pagamento=sucesso&sessao={CHECKOUT_SESSION_ID}');
    parametros.set('cancel_url', retorno + '/app/planos?pagamento=cancelado');
    parametros.set('locale', 'pt-BR');
    parametros.set('line_items[0][quantity]', '1');
    parametros.set('line_items[0][price_data][currency]', 'brl');
    parametros.set('line_items[0][price_data][unit_amount]', String(preco.centavos));
    parametros.set('line_items[0][price_data][recurring][interval]', ciclo === 'annual' ? 'year' : 'month');
    parametros.set('line_items[0][price_data][product_data][name]', 'OAZE ' + NOMES[plano]);
    parametros.set('metadata[oaze_intencao_id]', intencao.id);
    parametros.set('subscription_data[metadata][oaze_intencao_id]', intencao.id);
    parametros.set('subscription_data[metadata][oaze_plan_id]', plano);
    parametros.set('subscription_data[metadata][oaze_price_id]', preco.id);

    let sessao: any;
    try {
      sessao = await stripe('POST', '/checkout/sessions', parametros, 'checkout-' + intencao.id);
    } catch (e) {
      await admin.from('stripe_intencoes').update({ status: 'falhou', updated_at: new Date().toISOString() })
        .eq('id', intencao.id);
      throw e;
    }
    if (!sessao?.id || !/^https:\/\/checkout\.stripe\.com\//.test(String(sessao.url || ''))) {
      throw new Error('sessao_invalida');
    }
    await admin.from('stripe_intencoes').update({
      checkout_session_id: sessao.id, updated_at: new Date().toISOString()
    }).eq('id', intencao.id);

    log('checkout_criado', { plano, ciclo });
    return json({ ok: true, url: sessao.url }, 200, origem);
  } catch (e) {
    const codigo = e instanceof StripeErro ? e.codigo : e instanceof AsaasErro ? e.codigo : 'interno';
    log('falhou', { codigo, status: e instanceof StripeErro || e instanceof AsaasErro ? e.status : null });
    return json({
      erro: 'falhou',
      mensagem: 'Não foi possível abrir o pagamento agora. Nada foi cobrado.',
      request_id: requestId
    }, 502, origem);
  }
});
