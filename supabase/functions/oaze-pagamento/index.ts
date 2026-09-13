/* =============================================================
   oaze-pagamento — assinar e cancelar pelo Asaas
   -------------------------------------------------------------
   acao 'assinar'  { plano, ciclo, nome, cpf }
     → devolve { ok, url }: a fatura do Asaas, onde a pessoa digita o
       cartão. Daí em diante o Asaas cobra sozinho a cada ciclo.
   acao 'cancelar' {}
     → encerra a renovação no Asaas; o acesso segue até o fim do
       período já pago.

   O QUE O NAVEGADOR NÃO DECIDE
   Preço, plano liberado e confirmação. O valor sai de plan_prices,
   lido AQUI. O plano só muda quando o aviso do Asaas chega em
   oaze-asaas-webhook e o pagamento é conferido na API do Asaas.
   Esta função nunca escreve plano pago em subscriptions.

   CPF
   O Asaas exige CPF para cobrar. Ele passa por aqui a caminho do
   Asaas e não é guardado, nem registrado em log.

   SEGREDOS: ASAAS_API_KEY, ASAAS_AMBIENTE, OAZE_ALLOWED_ORIGINS e,
   opcional, OAZE_RETORNO_URL (para onde a fatura devolve a pessoa;
   o domínio precisa estar cadastrado na conta Asaas).
   ============================================================= */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { asaas, asaasConfigurado, AsaasErro, hojeSP } from '../_shared/asaas.ts';

function origensPermitidas(): string[] {
  return (Deno.env.get('OAZE_ALLOWED_ORIGINS') ?? '')
    .split(',').map((o) => o.trim()).filter(Boolean);
}

function cors(origem: string | null): Record<string, string> {
  const ok = origem && origensPermitidas().includes(origem);
  return {
    'Access-Control-Allow-Origin': ok ? origem! : 'null',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin'
  };
}

function json(corpo: unknown, status: number, origem: string | null) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors(origem), 'content-type': 'application/json; charset=utf-8' }
  });
}

/** Dígitos verificadores do CPF. Recusar aqui poupa uma ida ao Asaas. */
function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(cpf[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(cpf[9]) && dv(10) === Number(cpf[10]);
}

const NOMES: Record<string, string> = { basic: 'Coqueiro', pro: 'Oásis' };

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

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !servico || !asaasConfigurado()) {
    log('config_incompleta');
    return json({ erro: 'indisponivel', mensagem: 'As assinaturas ainda não estão abertas.' }, 503, origem);
  }

  const autorizacao = req.headers.get('Authorization') ?? '';
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: auth } = await userClient.auth.getUser();
  const usuario = auth?.user;
  if (!usuario) return json({ erro: 'sem_sessao', mensagem: 'Sua sessão expirou. Entre novamente.' }, 401, origem);

  const admin = createClient(url, servico, { auth: { persistSession: false, autoRefreshToken: false } });

  let corpo: any = null;
  try { corpo = await req.json(); } catch { /* segue nulo */ }
  const acao = String(corpo?.acao || '');

  const { data: atual } = await admin.from('subscriptions')
    .select('plan_id, status, current_period_end, cancel_at_period_end, asaas_subscription_id')
    .eq('user_id', usuario.id).maybeSingle();

  try {
    /* ======================== cancelar ======================== */
    if (acao === 'cancelar') {
      if (!atual?.asaas_subscription_id || atual.plan_id === 'free') {
        return json({ erro: 'sem_assinatura', mensagem: 'Não há assinatura paga para cancelar.' }, 400, origem);
      }
      try {
        await asaas('DELETE', '/subscriptions/' + atual.asaas_subscription_id);
      } catch (e) {
        /* 404: já não existe no Asaas — o resultado que queríamos. */
        if (!(e instanceof AsaasErro && e.status === 404)) throw e;
      }
      await admin.from('subscriptions').update({
        status: 'canceled', cancel_at_period_end: true,
        canceled_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }).eq('user_id', usuario.id);
      log('assinatura_cancelada');
      return json({ ok: true, acesso_ate: atual.current_period_end }, 200, origem);
    }

    if (acao !== 'assinar') return json({ erro: 'acao', mensagem: 'Ação desconhecida.' }, 400, origem);

    /* ======================== assinar ======================== */
    const plano = String(corpo?.plano || '');
    const ciclo = String(corpo?.ciclo || '');
    const nome = String(corpo?.nome || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    const cpf = String(corpo?.cpf || '').replace(/\D/g, '');

    if (!NOMES[plano] || !['monthly', 'annual'].includes(ciclo)) {
      return json({ erro: 'plano', mensagem: 'Plano inválido.' }, 400, origem);
    }
    if (nome.length < 3) return json({ erro: 'nome', mensagem: 'Informe o nome como está no cartão ou documento.' }, 400, origem);
    if (!cpfValido(cpf)) return json({ erro: 'cpf', mensagem: 'CPF inválido.' }, 400, origem);

    const vigente = atual && atual.plan_id !== 'free'
      && ['active', 'past_due'].includes(atual.status) && !atual.cancel_at_period_end
      && (!atual.current_period_end || new Date(atual.current_period_end) > new Date());
    if (vigente) {
      return json({
        erro: 'ja_assina',
        mensagem: 'Você já tem uma assinatura ativa. Para trocar de plano, cancele a atual em Configurações; o acesso segue até o fim do período pago.'
      }, 409, origem);
    }

    /* o preço é o do banco, nunca o da tela */
    const { data: preco } = await admin.from('plan_prices')
      .select('id, centavos, versao').eq('plan_id', plano).eq('ciclo', ciclo).eq('vigente', true)
      .maybeSingle();
    if (!preco || !preco.centavos) {
      log('preco_ausente', { plano, ciclo });
      return json({ erro: 'indisponivel', mensagem: 'Plano indisponível no momento.' }, 503, origem);
    }

    /* Clique duplo ou volta da fatura: a intenção aguardando do mesmo
       preço, nas últimas 24 h, é reaproveitada. Outra intenção
       aguardando é encerrada no Asaas, para não sobrar assinatura
       pendurada gerando cobrança. */
    const { data: pendentes } = await admin.from('asaas_intencoes')
      .select('id, price_id, asaas_subscription_id, created_at')
      .eq('user_id', usuario.id).eq('status', 'aguardando');
    for (const p of pendentes ?? []) {
      const recente = Date.now() - new Date(p.created_at).getTime() < 24 * 3600 * 1000;
      if (p.price_id === preco.id && recente && p.asaas_subscription_id) {
        const fatura = await primeiraFatura(p.asaas_subscription_id);
        if (fatura) return json({ ok: true, url: fatura }, 200, origem);
      }
      if (p.asaas_subscription_id) {
        await asaas('DELETE', '/subscriptions/' + p.asaas_subscription_id).catch(() => null);
      }
      await admin.from('asaas_intencoes').update({ status: 'cancelada', updated_at: new Date().toISOString() }).eq('id', p.id);
    }

    /* cliente do Asaas: um por pessoa */
    let { data: cliente } = await admin.from('asaas_clientes')
      .select('customer_id').eq('user_id', usuario.id).maybeSingle();
    if (cliente) {
      /* o nome e o CPF podem ter mudado; o Asaas guarda, nós não */
      await asaas('PUT', '/customers/' + cliente.customer_id, { name: nome, cpfCnpj: cpf });
    } else {
      const c = await asaas('POST', '/customers', {
        name: nome, cpfCnpj: cpf, email: usuario.email,
        externalReference: usuario.id, notificationDisabled: false
      });
      await admin.from('asaas_clientes').insert({ user_id: usuario.id, customer_id: c.id });
      cliente = { customer_id: c.id };
    }

    const { data: intencao, error: erroIntencao } = await admin.from('asaas_intencoes').insert({
      user_id: usuario.id, plan_id: plano, ciclo, price_id: preco.id,
      centavos: preco.centavos, versao: preco.versao
    }).select('id').single();
    if (erroIntencao || !intencao) throw new Error('intencao');

    const retorno = Deno.env.get('OAZE_RETORNO_URL');
    const assinatura = await asaas('POST', '/subscriptions', {
      customer: cliente.customer_id,
      billingType: 'CREDIT_CARD',
      value: preco.centavos / 100,
      nextDueDate: hojeSP(),
      cycle: ciclo === 'annual' ? 'YEARLY' : 'MONTHLY',
      description: 'OAZE ' + NOMES[plano] + (ciclo === 'annual' ? ' — anual' : ' — mensal'),
      externalReference: intencao.id,
      ...(retorno ? { callback: { successUrl: retorno, autoRedirect: true } } : {})
    });

    await admin.from('asaas_intencoes')
      .update({ asaas_subscription_id: assinatura.id, updated_at: new Date().toISOString() })
      .eq('id', intencao.id);

    const fatura = await primeiraFatura(assinatura.id);
    if (!fatura) throw new Error('sem_fatura');

    log('assinatura_criada', { plano, ciclo });
    return json({ ok: true, url: fatura }, 200, origem);
  } catch (e) {
    const codigo = e instanceof AsaasErro ? e.codigo : 'interno';
    log('falhou', { codigo, status: e instanceof AsaasErro ? e.status : null });
    const mensagem = codigo === 'invalid_cpfCnpj'
      ? 'O Asaas não aceitou este CPF.'
      : 'Não foi possível falar com o sistema de pagamento agora. Nada foi cobrado.';
    return json({ erro: 'falhou', mensagem, request_id: requestId }, 502, origem);
  }
});

/** A fatura em aberto da assinatura: é nela que o cartão é digitado. */
async function primeiraFatura(subscriptionId: string): Promise<string | null> {
  const r = await asaas('GET', '/subscriptions/' + subscriptionId + '/payments?limit=1');
  const p = r?.data?.[0];
  return p && p.invoiceUrl ? String(p.invoiceUrl) : null;
}
