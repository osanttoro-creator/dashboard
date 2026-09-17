/* =============================================================
   oaze-pagamento — Checkout e cancelamento pela Stripe

   O navegador escolhe apenas plano, ciclo e em que moeda quer pagar.
   VALOR ele nunca escolhe: preço, versão, usuário e estado da
   assinatura vêm do token e do banco. O plano pago só é liberado
   pelo webhook assinado.

   Sobre a moeda ser escolha de quem compra: os preços em dólar e em
   euro são MAIORES que os em real no câmbio do dia (US$ 3,99 ≈
   R$ 21, contra R$ 14,90). Não existe arbitragem a fazer, então
   pedir prova de país só criaria um jeito de errar com quem mora
   fora e paga em real, ou viaja e some da própria tabela.

   Assinaturas antigas do Asaas continuam canceláveis durante a
   migração. Nenhuma assinatura nova é criada lá.
   ============================================================= */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { asaas, AsaasErro } from '../_shared/asaas.ts';
import { reservarRateLimit, corpoCabeNoLimite } from '../_shared/security.ts';
import { stripe, stripeConfigurada, StripeErro } from '../_shared/stripe.ts';

const NOMES: Record<string, string> = { basic: 'Coqueiro', pro: 'Oásis' };

/* As três moedas da tabela plan_prices. Quem pedir qualquer outra
   coisa — ou nada — paga em real, como sempre foi. */
const MOEDAS: Record<string, { simbolo: string; depois: boolean; decimal: string; locale: string }> = {
  BRL: { simbolo: 'R$', depois: false, decimal: ',', locale: 'pt-BR' },
  USD: { simbolo: 'US$', depois: false, decimal: '.', locale: 'auto' },
  EUR: { simbolo: '€', depois: true, decimal: ',', locale: 'auto' }
};

function moedaEscolhida(v: unknown): string {
  const alvo = typeof v === 'string' ? v.trim().toUpperCase() : '';
  return Object.prototype.hasOwnProperty.call(MOEDAS, alvo) ? alvo : 'BRL';
}

function dinheiro(centavos: number, moeda: string): string {
  const m = MOEDAS[moeda] ?? MOEDAS.BRL;
  const n = (centavos / 100).toFixed(2).replace('.', m.decimal);
  return m.depois ? n + ' ' + m.simbolo : m.simbolo + ' ' + n;
}

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
  const permitidos = acao === 'assinar' ? new Set(['acao', 'plano', 'ciclo', 'moeda', 'cupom'])
    : acao === 'cupom' ? new Set(['acao', 'plano', 'ciclo', 'moeda', 'codigo'])
      : new Set(['acao']);
  return Object.keys(corpo as Record<string, unknown>).every((k) => permitidos.has(k));
}

/* =============================================================
   CUPOM DE DESCONTO
   -------------------------------------------------------------
   O cupom é criado no painel da Stripe (Produtos → Cupons → código
   promocional). O OAZE não guarda cupom nenhum: pergunta à Stripe se
   o código existe e vale, e mostra o preço com desconto ANTES de
   mandar a pessoa para o pagamento. No Checkout, o desconto vai pelo
   id do código promocional — a Stripe aplica e registra o uso.

   O preço de tabela (unit_amount) não muda com o cupom, então a
   conciliação do webhook, que compara esse valor com a intenção,
   continua valendo sem exceção.

   Descobrir códigos por tentativa é o risco óbvio: por isso a
   consulta tem limite próprio, mais apertado que o do pagamento, e a
   resposta de "não existe" é a mesma para expirado, esgotado ou
   inexistente.
   ============================================================= */
type Cupom = { id: string; codigo: string; descricao: string; centavosPrimeira: number };

async function buscarCupom(codigo: string, centavos: number, moeda: string): Promise<Cupom | null> {
  const lista = await stripe('GET', '/promotion_codes?limit=1&active=true&code=' + encodeURIComponent(codigo));
  const pc = lista?.data?.[0];
  if (!pc?.id || pc.active !== true) return null;
  if (pc.expires_at && pc.expires_at * 1000 < Date.now()) return null;
  if (pc.max_redemptions && pc.times_redeemed >= pc.max_redemptions) return null;

  /* Versões novas da API guardam o cupom em promotion.coupon, e às
     vezes só o id: nesse caso ele é buscado. */
  let cupom: any = pc.coupon ?? pc.promotion?.coupon;
  if (typeof cupom === 'string') cupom = await stripe('GET', '/coupons/' + encodeURIComponent(cupom));
  if (!cupom?.id || cupom.valid === false) return null;

  /* Valor mínimo e desconto fixo só valem na moeda em que foram
     criados na Stripe. Um cupom de "R$ 10 de desconto" aplicado a um
     preço em dólar tiraria US$ 10 — o Coqueiro sairia de graça e
     ainda com troco. Por isso, na moeda errada o cupom simplesmente
     não existe. */
  const minimo = pc.restrictions?.minimum_amount;
  if (minimo && String(pc.restrictions?.minimum_amount_currency || '').toLowerCase() === moeda.toLowerCase() && centavos < minimo) return null;

  let centavosPrimeira = centavos;
  let desconto = '';
  if (Number(cupom.percent_off) > 0) {
    const pct = Math.min(100, Number(cupom.percent_off));
    centavosPrimeira = Math.max(0, Math.round(centavos * (1 - pct / 100)));
    desconto = String(pct).replace('.', ',') + '% de desconto';
  } else if (Number(cupom.amount_off) > 0) {
    if (String(cupom.currency || '').toLowerCase() !== moeda.toLowerCase()) return null;
    centavosPrimeira = Math.max(0, centavos - Number(cupom.amount_off));
    desconto = dinheiro(Number(cupom.amount_off), moeda) + ' de desconto';
  } else {
    return null;
  }
  const quando = cupom.duration === 'forever' ? 'em todas as cobranças'
    : cupom.duration === 'repeating' && cupom.duration_in_months
      ? 'nos primeiros ' + cupom.duration_in_months + (cupom.duration_in_months === 1 ? ' mês' : ' meses')
      : 'na primeira cobrança';
  return { id: pc.id, codigo: String(pc.code || codigo), descricao: desconto + ' ' + quando, centavosPrimeira };
}

const codigoValido = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9_-]{3,40}$/.test(v.trim());

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
  if (!['assinar', 'cancelar', 'cupom'].includes(acao) || !corpoPermitido(corpo, acao)) {
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
    const moeda = moedaEscolhida(corpo.moeda);
    if (!NOMES[plano] || !['monthly', 'annual'].includes(ciclo)) {
      return json({ erro: 'plano', mensagem: 'Plano inválido.' }, 400, origem);
    }

    if (acao === 'cupom') {
      if (!codigoValido(corpo.codigo)) {
        return json({ erro: 'cupom_invalido', mensagem: 'Esse cupom não existe ou não vale mais.' }, 200, origem);
      }
      const minuto = await reservarRateLimit(admin, 'cupom:minuto', usuario.id, 5, 60);
      const hora = await reservarRateLimit(admin, 'cupom:hora', usuario.id, 20, 3600);
      if (!minuto.permitido || !hora.permitido) {
        return json({ erro: 'limite', mensagem: 'Muitas tentativas de cupom. Espere um pouco e tente de novo.' }, 429, origem,
          { 'Retry-After': String(!minuto.permitido ? minuto.tentarEm : hora.tentarEm) });
      }
      const { data: precoCupom } = await admin.from('plan_prices')
        .select('centavos,moeda').eq('plan_id', plano).eq('ciclo', ciclo)
        .eq('moeda', moeda).eq('vigente', true).maybeSingle();
      if (!precoCupom || precoCupom.moeda !== moeda) {
        return json({ erro: 'indisponivel', mensagem: 'Plano indisponível no momento.' }, 503, origem);
      }
      const achado = await buscarCupom(String(corpo.codigo).trim(), precoCupom.centavos, moeda);
      log(achado ? 'cupom_valido' : 'cupom_recusado', { plano, ciclo, moeda });
      if (!achado) return json({ erro: 'cupom_invalido', mensagem: 'Esse cupom não existe ou não vale mais.' }, 200, origem);
      return json({
        ok: true, codigo: achado.codigo, descricao: achado.descricao, moeda,
        centavos: precoCupom.centavos, centavosPrimeira: achado.centavosPrimeira
      }, 200, origem);
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
      .select('id,centavos,versao,moeda').eq('plan_id', plano).eq('ciclo', ciclo)
      .eq('moeda', moeda).eq('vigente', true)
      .maybeSingle();
    if (!preco || !Number.isInteger(preco.centavos) || preco.centavos < 1 || preco.moeda !== moeda) {
      log('preco_ausente', { plano, ciclo, moeda });
      return json({ erro: 'indisponivel', mensagem: 'Plano indisponível no momento.' }, 503, origem);
    }

    /* Cupom: validado de novo aqui — o que o navegador mostrou antes
       não vale como prova. Cupom que deixou de valer entre a tela e o
       clique volta como erro, e nada é cobrado. */
    let cupom: Cupom | null = null;
    if (corpo.cupom !== undefined && corpo.cupom !== null && corpo.cupom !== '') {
      if (!codigoValido(corpo.cupom)) {
        return json({ erro: 'cupom_invalido', mensagem: 'Esse cupom não existe ou não vale mais.' }, 400, origem);
      }
      cupom = await buscarCupom(String(corpo.cupom).trim(), preco.centavos, moeda);
      if (!cupom) return json({ erro: 'cupom_invalido', mensagem: 'Esse cupom deixou de valer. Nada foi cobrado.' }, 400, origem);
    }

    const { data: pendentes } = await admin.from('stripe_intencoes')
      .select('id,price_id,checkout_session_id,created_at')
      .eq('user_id', usuario.id).eq('status', 'aguardando');
    for (const p of pendentes ?? []) {
      const recente = Date.now() - new Date(p.created_at).getTime() < 30 * 60 * 1000;
      if (!cupom && recente && p.price_id === preco.id && p.checkout_session_id) {
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
      centavos: preco.centavos, versao: preco.versao, moeda
    }).select('id').single();
    if (erroIntencao || !intencao) throw new Error('intencao');

    const parametros = new URLSearchParams();
    parametros.set('mode', 'subscription');
    parametros.set('client_reference_id', intencao.id);
    parametros.set('customer_email', usuario.email);
    parametros.set('success_url', retorno + '/app/planos?pagamento=sucesso&sessao={CHECKOUT_SESSION_ID}');
    parametros.set('cancel_url', retorno + '/app/planos?pagamento=cancelado');
    /* A página da Stripe em português para quem paga em real; para as
       outras moedas, 'auto' — ela lê o idioma do navegador, que é
       melhor palpite do que escolher inglês para um francês. */
    parametros.set('locale', MOEDAS[moeda].locale);
    parametros.set('line_items[0][quantity]', '1');
    parametros.set('line_items[0][price_data][currency]', moeda.toLowerCase());
    parametros.set('line_items[0][price_data][unit_amount]', String(preco.centavos));
    parametros.set('line_items[0][price_data][recurring][interval]', ciclo === 'annual' ? 'year' : 'month');
    parametros.set('line_items[0][price_data][product_data][name]', 'OAZE ' + NOMES[plano]);
    parametros.set('metadata[oaze_intencao_id]', intencao.id);
    parametros.set('subscription_data[metadata][oaze_intencao_id]', intencao.id);
    parametros.set('subscription_data[metadata][oaze_plan_id]', plano);
    parametros.set('subscription_data[metadata][oaze_price_id]', preco.id);
    if (cupom) {
      parametros.set('discounts[0][promotion_code]', cupom.id);
      parametros.set('metadata[oaze_cupom]', cupom.codigo);
    } else {
      /* sem cupom no app, a página da Stripe ainda aceita um */
      parametros.set('allow_promotion_codes', 'true');
    }

    let sessao: any;
    try {
      sessao = await stripe('POST', '/checkout/sessions', parametros, 'checkout-' + intencao.id + (cupom ? '-' + cupom.id : ''));
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

    log('checkout_criado', { plano, ciclo, moeda });
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
