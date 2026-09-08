/* =============================================================
   oaze-assinatura — cancelar e mudar de plano
   -------------------------------------------------------------
   Três ações, todas autenticadas:

     cancelar   → o acesso continua até o fim do período pago
     descer     → o plano menor passa a valer no fim do período
     retomar    → desfaz um cancelamento ainda não efetivado

   SUBIR DE PLANO NÃO ESTÁ AQUI. Upgrade envolve cobrança, e
   cobrança é o oaze-checkout: ela vale quando o pagamento é
   confirmado, não quando alguém clica.

   POR QUE CANCELAR NÃO CORTA NA HORA
   Porque foi pago até uma data. Cortar antes seria ficar com
   dinheiro sem entregar o serviço — e não há devolução proporcional
   fora do prazo de arrependimento. O que o cancelamento faz é
   desligar a renovação.

   POR QUE DESCER TAMBÉM NÃO VALE NA HORA
   Mesmo motivo. Quem pagou o Pro até dia 30 tem Pro até dia 30,
   mesmo tendo pedido o Basic no dia 3.

   NADA AQUI APAGA DADO. Nem no cancelamento, nem no downgrade, nem
   quando o período termina. O que passa do limite do plano novo
   entra em modo de visualização — visível, exportável, e sem poder
   crescer. Ver assets/js/limites.js.
   ============================================================= */

import { createClient } from 'jsr:@supabase/supabase-js@2';

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

/* A ordem dos planos. Descer é ir para um índice menor; qualquer
   outra coisa é subida e vai para o checkout. */
const ORDEM = ['free', 'basic', 'pro'];

Deno.serve(async (req: Request) => {
  const origem = req.headers.get('Origin');
  const requestId = crypto.randomUUID();

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origem) });
  if (req.method !== 'POST') {
    return json({ erro: 'metodo', mensagem: 'Método não permitido.' }, 405, origem);
  }
  if (origem && !origensPermitidas().includes(origem)) {
    return json({ erro: 'origem', mensagem: 'Origem não autorizada.' }, 403, origem);
  }

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !servico) {
    return json({ erro: 'indisponivel', mensagem: 'Operação indisponível no momento.' }, 503, origem);
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
  if (erroAuth || !auth?.user) {
    return json({ erro: 'sem_sessao', mensagem: 'Sua sessão expirou. Entre novamente.' }, 401, origem);
  }
  const usuario = auth.user;

  let corpo: any = null;
  try { corpo = await req.json(); } catch { /* segue nulo */ }
  const acao = String(corpo?.acao || '');

  const admin = createClient(url, servico, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: ass } = await admin.from('subscriptions')
    .select('plan_id, billing_cycle, status, current_period_end, cancel_at_period_end, plano_agendado')
    .eq('user_id', usuario.id).maybeSingle();

  if (!ass) {
    return json({ erro: 'sem_assinatura', mensagem: 'Nenhuma assinatura encontrada.' }, 404, origem);
  }

  const fim = ass.current_period_end;
  const dataBr = fim
    ? new Date(fim).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : null;

  /* ---------------- cancelar ---------------- */
  if (acao === 'cancelar') {
    if (ass.status !== 'active') {
      return json({ erro: 'nao_ativa', mensagem: 'Não há assinatura ativa para cancelar.' }, 409, origem);
    }
    if (ass.cancel_at_period_end) {
      return json({
        ok: true, acao: 'ja_cancelada',
        mensagem: dataBr
          ? `Sua assinatura já está cancelada e o acesso vai até ${dataBr}.`
          : 'Sua assinatura já está cancelada.'
      }, 200, origem);
    }

    const { error } = await admin.from('subscriptions').update({
      cancel_at_period_end: true,
      canceled_at: new Date().toISOString(),
      /* No fim do período, cai para o Grátis. Deixar o agendamento
         explícito evita depender de alguém interpretar
         cancel_at_period_end na hora da virada. */
      plano_agendado: 'free',
      ciclo_agendado: 'monthly',
      agendado_para: fim,
      updated_at: new Date().toISOString()
    }).eq('user_id', usuario.id);

    if (error) {
      console.error(JSON.stringify({ request_id: requestId, evento: 'cancelar_falhou' }));
      return json({ erro: 'falhou', mensagem: 'Não foi possível cancelar agora. Nada mudou.' }, 502, origem);
    }

    await admin.from('subscription_events').insert({
      user_id: usuario.id, tipo: 'cancelamento_agendado',
      de_plano: ass.plan_id, para_plano: 'free',
      de_status: ass.status, para_status: 'active',
      dados: { efetivo_em: fim }
    });

    return json({
      ok: true, acao: 'cancelada',
      mensagem: dataBr
        ? `Cancelado. Seu acesso ao plano continua até ${dataBr}, e nada será cobrado depois disso.`
        : 'Cancelado. A renovação foi desligada.',
      ate: fim
    }, 200, origem);
  }

  /* ---------------- retomar ---------------- */
  if (acao === 'retomar') {
    if (!ass.cancel_at_period_end) {
      return json({ erro: 'nao_cancelada', mensagem: 'Sua assinatura não está cancelada.' }, 409, origem);
    }
    await admin.from('subscriptions').update({
      cancel_at_period_end: false, canceled_at: null,
      plano_agendado: null, ciclo_agendado: null, agendado_para: null,
      updated_at: new Date().toISOString()
    }).eq('user_id', usuario.id);

    await admin.from('subscription_events').insert({
      user_id: usuario.id, tipo: 'cancelamento_desfeito',
      de_plano: ass.plan_id, para_plano: ass.plan_id
    });

    return json({ ok: true, acao: 'retomada', mensagem: 'A renovação foi religada.' }, 200, origem);
  }

  /* ---------------- descer de plano ---------------- */
  if (acao === 'descer') {
    const alvo = String(corpo?.plano || '');
    if (!ORDEM.includes(alvo)) {
      return json({ erro: 'plano', mensagem: 'Plano inválido.' }, 400, origem);
    }
    if (ORDEM.indexOf(alvo) >= ORDEM.indexOf(ass.plan_id)) {
      /* Subir por aqui liberaria plano sem pagamento. A porta para
         cima é o checkout, e ela passa pelo webhook. */
      return json({
        erro: 'nao_e_descida',
        mensagem: 'Para subir de plano, use o checkout — o plano novo vale quando o pagamento é confirmado.'
      }, 400, origem);
    }

    await admin.from('subscriptions').update({
      plano_agendado: alvo,
      ciclo_agendado: alvo === 'free' ? 'monthly' : ass.billing_cycle,
      agendado_para: fim,
      updated_at: new Date().toISOString()
    }).eq('user_id', usuario.id);

    await admin.from('subscription_events').insert({
      user_id: usuario.id, tipo: 'downgrade_agendado',
      de_plano: ass.plan_id, para_plano: alvo,
      dados: { efetivo_em: fim }
    });

    return json({
      ok: true, acao: 'agendada',
      mensagem: dataBr
        ? `Agendado. Você continua no plano ${ass.plan_id} até ${dataBr}, e depois passa para o ${alvo}. Nenhum dado será apagado.`
        : `Agendado para o fim do período. Nenhum dado será apagado.`,
      ate: fim
    }, 200, origem);
  }

  return json({ erro: 'acao', mensagem: 'Ação desconhecida.' }, 400, origem);
});
