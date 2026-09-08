/* =============================================================
   oaze-checkout — começa uma compra
   -------------------------------------------------------------
   O QUE O NAVEGADOR MANDA
     { plano: 'basic'|'pro', ciclo: 'monthly'|'annual' }

   E MAIS NADA. Em particular, NÃO manda preço. O preço é lido da
   tabela plan_prices aqui dentro. Um frontend que envia valor é um
   frontend que decide quanto você recebe — e o DevTools está a um
   atalho de distância de qualquer visitante.

   O QUE ESTA FUNÇÃO NÃO FAZ
   Não ativa plano. Não muda status para 'active'. Não devolve nada
   que a tela possa interpretar como "pago". Ela cria a intenção,
   pede uma preferência ao Mercado Pago e devolve o endereço para
   onde mandar a pessoa. Quem ativa é o webhook, e só depois de
   conferir a assinatura e reconsultar o pagamento na API.

   POR QUE A INTENÇÃO EXISTE
   O webhook chega dizendo "o pagamento X foi aprovado". Sozinho,
   isso não diz de quem é nem do que é. A intenção guarda o dono, o
   plano, o ciclo e o VALOR CONGELADO — e é contra esse valor que o
   webhook confere o que foi pago.
   ============================================================= */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const MP_API = 'https://api.mercadopago.com';

/* ---------------------------------------------------------------
   CORS
   --------------------------------------------------------------- */
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

/* ---------------------------------------------------------------
   principal
   --------------------------------------------------------------- */
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
  const mpToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN') ?? '';
  const siteUrl = Deno.env.get('OAZE_SITE_URL') ?? '';

  if (!url || !servico) {
    console.error(JSON.stringify({ request_id: requestId, evento: 'config_incompleta' }));
    return json({ erro: 'indisponivel', mensagem: 'Operação indisponível no momento.' }, 503, origem);
  }

  /* Sem token do provedor, a resposta é honesta: o checkout não está
     configurado. Antes isso era um 500 genérico, que fazia parecer
     defeito do app quando é ausência de credencial. */
  if (!mpToken) {
    console.error(JSON.stringify({ request_id: requestId, evento: 'sem_token_mp' }));
    return json({
      erro: 'nao_configurado',
      mensagem: 'O pagamento ainda não está disponível. Nenhuma cobrança foi feita.'
    }, 503, origem);
  }

  /* ---- quem está comprando ---- */
  const autorizacao = req.headers.get('Authorization') ?? '';
  if (!autorizacao.startsWith('Bearer ')) {
    return json({ erro: 'sem_sessao', mensagem: 'Entre na sua conta para assinar.' }, 401, origem);
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

  /* ---- o que ele quer ---- */
  let corpo: any = null;
  try { corpo = await req.json(); } catch { /* segue nulo */ }

  const plano = String(corpo?.plano || '');
  const ciclo = String(corpo?.ciclo || 'monthly');

  if (!['basic', 'pro'].includes(plano)) {
    return json({ erro: 'plano', mensagem: 'Plano inválido.' }, 400, origem);
  }
  if (!['monthly', 'annual'].includes(ciclo)) {
    return json({ erro: 'ciclo', mensagem: 'Ciclo inválido.' }, 400, origem);
  }
  /* Se o corpo trouxer preço, é sinal de cliente adulterado ou de
     integração escrita errado. Ignorar em silêncio esconderia as
     duas; recusar deixa o erro visível para quem estiver integrando. */
  if (corpo && (corpo.centavos !== undefined || corpo.valor !== undefined || corpo.preco !== undefined)) {
    console.error(JSON.stringify({ request_id: requestId, evento: 'corpo_com_preco' }));
    return json({
      erro: 'preco_no_corpo',
      mensagem: 'O valor não é enviado pelo navegador. Ele é determinado no servidor.'
    }, 400, origem);
  }

  const admin = createClient(url, servico, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  /* ---- O PREÇO VEM DAQUI, e de nenhum outro lugar ---- */
  const { data: preco, error: erroPreco } = await admin.from('plan_prices')
    .select('id, centavos, moeda, versao')
    .eq('plan_id', plano).eq('ciclo', ciclo).eq('vigente', true)
    .maybeSingle();

  if (erroPreco || !preco || !preco.centavos) {
    console.error(JSON.stringify({ request_id: requestId, evento: 'preco_nao_encontrado', plano, ciclo }));
    return json({ erro: 'preco', mensagem: 'Não foi possível calcular o valor. Nada foi cobrado.' }, 500, origem);
  }

  /* ---- já é assinante deste mesmo plano? ---- */
  const { data: assinatura } = await admin.from('subscriptions')
    .select('plan_id, billing_cycle, status').eq('user_id', usuario.id).maybeSingle();

  if (assinatura?.status === 'active' &&
      assinatura.plan_id === plano && assinatura.billing_cycle === ciclo) {
    return json({
      erro: 'ja_assinante',
      mensagem: 'Você já assina este plano neste ciclo.'
    }, 409, origem);
  }

  /* ---- a intenção ---- */
  const { data: intencao, error: erroInt } = await admin.from('checkout_intencoes')
    .insert({
      user_id: usuario.id,
      plan_id: plano,
      billing_cycle: ciclo,
      price_id: preco.id,
      centavos: preco.centavos,
      price_version: preco.versao,
      moeda: preco.moeda,
      provider: 'mercadopago'
    })
    .select('id').single();

  if (erroInt || !intencao) {
    console.error(JSON.stringify({ request_id: requestId, evento: 'intencao_falhou' }));
    return json({ erro: 'indisponivel', mensagem: 'Não foi possível iniciar a compra agora.' }, 503, origem);
  }

  /* ---- a preferência no Mercado Pago ---- */
  const titulo = plano === 'pro' ? 'OAZE Pro' : 'OAZE Basic';
  const periodo = ciclo === 'annual' ? 'anual' : 'mensal';

  const preferencia = {
    items: [{
      id: preco.id,
      title: `${titulo} — assinatura ${periodo}`,
      quantity: 1,
      currency_id: preco.moeda,
      /* Centavos para reais. O Mercado Pago trabalha em unidades
         decimais; o banco guarda inteiro em centavos porque ponto
         flutuante e dinheiro não convivem. A conversão acontece aqui,
         num lugar só, e nunca no caminho de volta. */
      unit_price: preco.centavos / 100
    }],
    payer: { email: usuario.email },
    /* É por aqui que o webhook descobre de quem é o pagamento. */
    external_reference: intencao.id,
    back_urls: siteUrl ? {
      success: `${siteUrl}/app/assinatura?retorno=ok`,
      pending: `${siteUrl}/app/assinatura?retorno=pendente`,
      failure: `${siteUrl}/app/assinatura?retorno=falhou`
    } : undefined,
    /* false de propósito: o retorno automático levaria a pessoa de
       volta com cara de "pronto", e o plano só vale depois do
       webhook. Deixar que ela volte quando quiser evita prometer o
       que ainda não aconteceu. */
    auto_return: undefined,
    notification_url: siteUrl ? `${url}/functions/v1/oaze-mp-webhook` : undefined,
    statement_descriptor: 'OAZE'
  };

  let resposta: Response;
  try {
    resposta = await fetch(`${MP_API}/checkout/preferences`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mpToken}`,
        'Content-Type': 'application/json',
        /* Idempotência do lado do provedor: dois cliques rápidos no
           mesmo botão não viram duas preferências. */
        'X-Idempotency-Key': intencao.id
      },
      body: JSON.stringify(preferencia)
    });
  } catch (e) {
    console.error(JSON.stringify({ request_id: requestId, evento: 'mp_inalcancavel' }));
    return json({ erro: 'provedor', mensagem: 'O pagamento está indisponível agora. Nada foi cobrado.' }, 502, origem);
  }

  if (!resposta.ok) {
    /* O corpo do erro do provedor NÃO volta ao navegador: ele
       costuma ecoar parte do cabeçalho enviado, e ali vai o token. */
    console.error(JSON.stringify({
      request_id: requestId, evento: 'mp_recusou', status: resposta.status
    }));
    return json({
      erro: 'provedor', mensagem: 'Não foi possível iniciar o pagamento. Nada foi cobrado.',
      request_id: requestId
    }, 502, origem);
  }

  const pref = await resposta.json();

  await admin.from('checkout_intencoes')
    .update({ external_preference_id: String(pref.id) })
    .eq('id', intencao.id);

  console.error(JSON.stringify({
    request_id: requestId, evento: 'intencao_criada',
    intencao: intencao.id, plano, ciclo
  }));

  /* init_point é produção; sandbox_init_point é o ambiente de teste.
     Devolver os dois deixa a escolha explícita no cliente em vez de
     depender de qual token está configurado — e evita o clássico
     "testei em sandbox e cobrei de verdade". */
  return json({
    ok: true,
    intencao: intencao.id,
    plano, ciclo,
    centavos: preco.centavos,          /* para CONFERÊNCIA na tela, não para cobrança */
    url: pref.init_point,
    url_sandbox: pref.sandbox_init_point,
    request_id: requestId
  }, 200, origem);
});
