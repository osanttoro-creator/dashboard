/* =============================================================
   oaze-mp-webhook — o único lugar que libera um plano
   -------------------------------------------------------------
   Nenhuma tela ativa assinatura. Nenhum retorno de checkout ativa
   assinatura. Só isto aqui, e só depois de três verificações
   independentes:

     1. a ASSINATURA do cabeçalho x-signature confere (HMAC-SHA256
        com o segredo do webhook)
     2. o pagamento é RECONSULTADO na API do Mercado Pago -- o corpo
        da notificação não é a fonte, é só um aviso de que algo
        mudou
     3. o VALOR pago bate com o valor congelado na intenção

   Falhar qualquer uma delas não libera nada.

   POR QUE RECONSULTAR SE A ASSINATURA JÁ CONFERE
   A assinatura prova que a notificação veio do Mercado Pago. Não
   prova que o corpo dela está atualizado: notificações podem chegar
   fora de ordem, repetidas, ou descrevendo um estado que já mudou.
   O estado real é o que a API responde no momento da consulta.

   ESTA FUNÇÃO É PÚBLICA (verify_jwt = false)
   Ela precisa ser: quem chama é o Mercado Pago, que não tem sessão
   no Supabase. Quem faz o papel da autenticação é a assinatura HMAC
   -- e é por isso que uma falha ali devolve 401 e para.
   ============================================================= */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const MP_API = 'https://api.mercadopago.com';

/* ---------------------------------------------------------------
   assinatura
   ---------------------------------------------------------------
   Formato do cabeçalho:
     x-signature: ts=1704908010,v1=618c8534...

   Manifesto:
     id:{data.id};request-id:{x-request-id};ts:{ts};

   TRÊS PEGADINHAS, todas já custaram tarde de alguém:

   · data.id vem da QUERY STRING (?data.id=...), não do corpo.
   · data.id entra MINÚSCULO no manifesto. Ids numéricos não se
     importam, mas alguns tópicos usam id alfanumérico -- e aí a
     validação falha só em produção, onde os ids são outros.
     O id original (sem minusculizar) é o que vai para a consulta.
   · segmento ausente é OMITIDO INTEIRO, não deixado vazio. Se não
     há x-request-id, o manifesto não tem "request-id:;" -- não tem
     nada. Deixar vazio muda o hash.
   --------------------------------------------------------------- */
function partesDaAssinatura(cabecalho: string): { ts: string; v1: string } {
  const out: Record<string, string> = {};
  cabecalho.split(',').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return { ts: out.ts || '', v1: out.v1 || '' };
}

async function hmacHex(segredo: string, mensagem: string): Promise<string> {
  const chave = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(segredo),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const assinado = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(mensagem));
  return Array.from(new Uint8Array(assinado))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* Comparação em tempo constante. Um === sai no primeiro byte
   diferente, e a diferença de tempo entre "errou no primeiro" e
   "errou no último" é medível -- é assim que se descobre um HMAC
   byte a byte. */
function igualSemVazar(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

/* ---------------------------------------------------------------
   principal
   --------------------------------------------------------------- */
Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID();

  /* Sem CORS: nenhum navegador chama isto. Um webhook que responde a
     preflight é um webhook que alguém tentou chamar do front. */
  if (req.method !== 'POST') {
    return new Response('metodo', { status: 405 });
  }

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const mpToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN') ?? '';
  const segredo = Deno.env.get('MERCADOPAGO_WEBHOOK_SECRET') ?? '';

  if (!url || !servico || !mpToken || !segredo) {
    console.error(JSON.stringify({ request_id: requestId, evento: 'config_incompleta' }));
    /* 503 e não 200: o Mercado Pago reenvia diante de erro, e é isso
       que se quer enquanto a configuração não estiver pronta.
       Responder 200 aqui descartaria a notificação para sempre. */
    return new Response('indisponivel', { status: 503 });
  }

  const q = new URL(req.url).searchParams;
  const dataId = q.get('data.id') || q.get('id') || '';
  const tipo = q.get('type') || q.get('topic') || '';
  const xRequestId = req.headers.get('x-request-id') || '';
  const xSignature = req.headers.get('x-signature') || '';

  /* ---- 1 · a assinatura ---- */
  const { ts, v1 } = partesDaAssinatura(xSignature);
  if (!ts || !v1) {
    console.error(JSON.stringify({ request_id: requestId, evento: 'sem_assinatura' }));
    return new Response('sem assinatura', { status: 401 });
  }

  let manifesto = '';
  if (dataId) manifesto += `id:${dataId.toLowerCase()};`;
  if (xRequestId) manifesto += `request-id:${xRequestId};`;
  manifesto += `ts:${ts};`;

  const esperado = await hmacHex(segredo, manifesto);
  if (!igualSemVazar(esperado, v1)) {
    console.error(JSON.stringify({ request_id: requestId, evento: 'assinatura_invalida' }));
    /* 401 e não 503: assinatura errada não melhora com retentativa.
       Reenviar seria só ruído. */
    return new Response('assinatura invalida', { status: 401 });
  }

  /* Janela de tempo. Sem ela, uma notificação legítima capturada
     hoje continuaria válida daqui a um ano -- a assinatura não
     expira sozinha. Cinco minutos cobre atraso de rede e relógio
     fora de sincronia sem virar uma porta aberta.

     O ts DO MERCADO PAGO VEM EM SEGUNDOS (ex.: 1704908010, dez
     dígitos). Date.now() é em milissegundos. Subtrair um do outro
     sem converter dá uma diferença de ~1,7 trilhão e RECUSA TODO
     WEBHOOK LEGÍTIMO -- a integração pareceria configurada e
     nenhum pagamento seria aplicado.

     A normalização abaixo aceita as duas escalas em vez de fixar
     uma: menos de 1e11 só pode ser segundos (1e11 ms seria o ano
     5138, e 1e11 s seria o ano 5138 também — mas em segundos a era
     atual tem 10 dígitos, ~1,7e9). Assim a checagem continua certa
     se o provedor mudar a unidade um dia. */
  const tsNum = Number(ts);
  const tsMs = tsNum < 1e11 ? tsNum * 1000 : tsNum;
  const idadeMs = Math.abs(Date.now() - tsMs);
  if (!Number.isFinite(idadeMs) || idadeMs > 5 * 60 * 1000) {
    console.error(JSON.stringify({ request_id: requestId, evento: 'assinatura_velha', idade_ms: idadeMs }));
    return new Response('assinatura fora da janela', { status: 401 });
  }

  /* Só pagamento interessa. Outros tópicos (merchant_order etc.)
     recebem 200 para o Mercado Pago parar de reenviar -- ignorar
     não é falhar. */
  if (tipo && !/payment/i.test(tipo)) {
    return new Response(JSON.stringify({ ok: true, ignorado: tipo }), {
      status: 200, headers: { 'content-type': 'application/json' }
    });
  }
  if (!dataId) return new Response('sem data.id', { status: 400 });

  /* ---- 2 · reconsulta na API ---- */
  let pagamento: any;
  try {
    const r = await fetch(`${MP_API}/v1/payments/${encodeURIComponent(dataId)}`, {
      headers: { Authorization: `Bearer ${mpToken}` }
    });
    if (!r.ok) {
      console.error(JSON.stringify({ request_id: requestId, evento: 'consulta_falhou', status: r.status }));
      /* 503 pede retentativa: pode ser indisponibilidade momentânea,
         e desistir aqui perderia um pagamento de verdade. */
      return new Response('consulta falhou', { status: 503 });
    }
    pagamento = await r.json();
  } catch (e) {
    console.error(JSON.stringify({ request_id: requestId, evento: 'consulta_erro' }));
    return new Response('consulta erro', { status: 503 });
  }

  const intencaoId = String(pagamento.external_reference || '');
  if (!intencaoId) {
    console.error(JSON.stringify({ request_id: requestId, evento: 'sem_referencia', pagamento: dataId }));
    /* 200: não é erro nosso e não melhora com retentativa. Pode ser
       um pagamento criado fora do OAZE, na mesma conta do provedor. */
    return new Response(JSON.stringify({ ok: true, ignorado: 'sem_referencia' }), {
      status: 200, headers: { 'content-type': 'application/json' }
    });
  }

  /* Centavos, sempre inteiro. transaction_amount vem como decimal;
     Math.round evita que 149.90 * 100 vire 14989.999999999998 e a
     conferência de valor reprove um pagamento correto. */
  const centavosPagos = Math.round(Number(pagamento.transaction_amount || 0) * 100);

  /* ---- 3 · aplica, atomicamente ---- */
  const admin = createClient(url, servico, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: resultado, error } = await admin.rpc('aplicar_evento_pagamento', {
    p_intencao: intencaoId,
    p_provider: 'mercadopago',
    /* A chave de idempotência é o id do PAGAMENTO, não o do evento:
       o Mercado Pago reenvia a mesma notificação com request-id
       diferente, e usar o request-id deixaria a porta aberta para
       processar o mesmo pagamento várias vezes. */
    p_evento_id: String(pagamento.id),
    p_status_pagamento: String(pagamento.status || 'pending'),
    p_centavos_pagos: centavosPagos,
    p_assinatura_externa: pagamento.metadata?.preapproval_id ?? null,
    p_cliente_externo: pagamento.payer?.id ? String(pagamento.payer.id) : null,
    p_dados: {
      pagamento_id: pagamento.id,
      status: pagamento.status,
      status_detail: pagamento.status_detail,
      metodo: pagamento.payment_method_id,
      valor: pagamento.transaction_amount
    }
  });

  if (error) {
    console.error(JSON.stringify({ request_id: requestId, evento: 'rpc_falhou', msg: error.message }));
    return new Response('falha ao aplicar', { status: 503 });
  }

  console.error(JSON.stringify({
    request_id: requestId, evento: 'processado',
    pagamento: pagamento.id, resultado
  }));

  /* 200 sempre que o processamento chegou ao fim, INCLUSIVE quando o
     resultado foi "já processado" ou "valor divergente": os dois são
     decisões finais, e pedir retentativa não mudaria nada. */
  return new Response(JSON.stringify({ ok: true, resultado }), {
    status: 200, headers: { 'content-type': 'application/json' }
  });
});
