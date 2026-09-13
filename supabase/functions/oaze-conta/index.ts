/* =============================================================
   oaze-conta — operações que o navegador não pode fazer sozinho
   -------------------------------------------------------------
   Hoje só uma: apagar a própria conta.

   POR QUE ISTO PRECISA EXISTIR
   O cliente do Supabase não apaga usuários. Isso não é limitação
   acidental: remover de auth.users é operação administrativa, e a
   chave que a permite ignora o RLS do projeto inteiro — ela jamais
   pode chegar ao navegador. A saída é esta função, onde a chave
   fica no ambiente do servidor.

   O QUE A EXCLUSÃO APAGA
   Tudo. Cada tabela referencia auth.users com ON DELETE CASCADE,
   então remover o usuário leva junto espaços, contas, cartões,
   categorias, lançamentos, investimentos, faturas, orçamentos,
   metas, assinatura, consumo de IA e progresso de configuração.
   Não é uma promessa: é a chave estrangeira fazendo o trabalho.

   O QUE ELA NÃO APAGA
   O localStorage do aparelho. Isso é do lado do cliente, e o
   cliente faz — mas só depois de a exclusão ter dado certo, e
   depois de o usuário baixar o backup. Apagar antes seria trocar
   uma perda de dados por outra.

   CONFIRMAÇÃO POR DIGITAÇÃO
   O corpo precisa trazer o e-mail exato da conta. Não é teatro:
   um clique acidental num botão vermelho é possível; digitar o
   próprio e-mail por acidente, não. E a comparação é com o e-mail
   do TOKEN, nunca com um que o cliente tenha mandado junto.
   ============================================================= */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { asaas, AsaasErro } from '../_shared/asaas.ts';
import { stripe, StripeErro } from '../_shared/stripe.ts';
import { reservarRateLimit, corpoCabeNoLimite } from '../_shared/security.ts';

function origensPermitidas(): string[] {
  return (Deno.env.get('OAZE_ALLOWED_ORIGINS') ?? '')
    .split(',').map((o) => o.trim()).filter(Boolean);
}

function cors(origem: string | null): Record<string, string> {
  const lista = origensPermitidas();
  const ok = origem && lista.includes(origem);
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
  if (!corpoCabeNoLimite(req, 4096)) {
    return json({ erro: 'corpo', mensagem: 'Requisição inválida.' }, 413, origem);
  }

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !servico) {
    console.error(JSON.stringify({ request_id: requestId, evento: 'config_incompleta' }));
    return json({ erro: 'indisponivel', mensagem: 'Operação indisponível no momento.' }, 503, origem);
  }

  /* ---- quem está pedindo ---- */
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

  const admin = createClient(url, servico, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  try {
    const hora = await reservarRateLimit(admin, 'conta:excluir:hora', usuario.id, 3, 3600);
    const dia = await reservarRateLimit(admin, 'conta:excluir:dia', usuario.id, 6, 86_400);
    if (!hora.permitido || !dia.permitido) {
      return json({ erro: 'limite', mensagem: 'Muitas tentativas seguidas. Tente novamente mais tarde.' }, 429, origem);
    }
  } catch {
    console.error(JSON.stringify({ request_id: requestId, evento: 'rate_limit_indisponivel' }));
    return json({ erro: 'indisponivel', mensagem: 'Operação indisponível no momento.' }, 503, origem);
  }

  /* ---- corpo ---- */
  let corpo: any = null;
  try { corpo = await req.json(); } catch { /* segue nulo */ }
  const acao = String(corpo?.acao || '');

  if (acao !== 'excluir') {
    return json({ erro: 'acao', mensagem: 'Ação desconhecida.' }, 400, origem);
  }

  /* A confirmação é comparada com o e-mail do TOKEN. Se viesse do
     corpo dos dois lados, a checagem seria o cliente conferindo a
     si mesmo — teatro, não verificação. */
  const confirmacao = String(corpo?.confirmacao || '').trim().toLowerCase();
  const emailReal = String(usuario.email || '').trim().toLowerCase();
  if (!emailReal || confirmacao !== emailReal) {
    return json({
      erro: 'confirmacao',
      mensagem: 'O e-mail digitado não confere com o da conta.'
    }, 400, origem);
  }

  /* Antes de apagar, conta o que existe. É esse número que volta
     para o usuário — "apagamos 412 lançamentos" é uma confirmação
     verificável; "pronto" não é. */
  const contar = async (tabela: string, coluna: string) => {
    const { count } = await admin.from(tabela)
      .select('*', { count: 'exact', head: true }).eq(coluna, usuario.id);
    return count ?? 0;
  };

  let resumo: Record<string, number> = {};
  try {
    const espacos = await admin.from('workspaces').select('id').eq('owner_id', usuario.id);
    const ids = (espacos.data ?? []).map((w: any) => w.id);
    const porEspaco = async (tabela: string) => {
      if (!ids.length) return 0;
      const { count } = await admin.from(tabela)
        .select('*', { count: 'exact', head: true }).in('workspace_id', ids);
      return count ?? 0;
    };
    resumo = {
      espacos: ids.length,
      lancamentos: await porEspaco('transactions'),
      contas: await porEspaco('accounts'),
      cartoes: await porEspaco('credit_cards'),
      metas: await porEspaco('goals'),
      documento_antigo: await contar('dados', 'user_id')
    };
  } catch (e) {
    /* Contar é cortesia, não requisito: a exclusão segue. */
    console.error(JSON.stringify({ request_id: requestId, evento: 'contagem_falhou' }));
  }

  /* ---- a cobrança para antes da conta ----
     Apagar o usuário sem encerrar a assinatura no provedor deixaria o
     cartão sendo cobrado por uma conta que não existe mais. Se o
     provedor não confirmar, NADA é apagado: a pessoa tenta de novo. */
  const { data: assinatura } = await admin.from('subscriptions')
    .select('stripe_subscription_id,asaas_subscription_id').eq('user_id', usuario.id).maybeSingle();
  const stripePendentes = await admin.from('stripe_intencoes')
    .select('checkout_session_id,stripe_subscription_id')
    .eq('user_id', usuario.id).eq('status', 'aguardando');
  const stripeAssinaturas = new Set<string>(
    [assinatura?.stripe_subscription_id, ...(stripePendentes.data ?? []).map((p: any) => p.stripe_subscription_id)]
      .filter(Boolean) as string[]);
  try {
    for (const id of stripeAssinaturas) {
      await stripe('DELETE', '/subscriptions/' + encodeURIComponent(id), undefined,
        'excluir-conta-' + usuario.id + '-' + id);
    }
    for (const p of stripePendentes.data ?? []) {
      if (p.checkout_session_id && !p.stripe_subscription_id) {
        await stripe('POST', '/checkout/sessions/' + encodeURIComponent(p.checkout_session_id) + '/expire',
          new URLSearchParams(), 'expirar-conta-' + usuario.id + '-' + p.checkout_session_id);
      }
    }
  } catch (e) {
    /* 404 é o estado desejado: a assinatura ou sessão já não existe. */
    if (!(e instanceof StripeErro && e.status === 404)) {
      console.error(JSON.stringify({ request_id: requestId, evento: 'cancelar_stripe_falhou' }));
      return json({
        erro: 'falhou',
        mensagem: 'Não foi possível encerrar sua assinatura agora, então a conta não foi excluída. Tente novamente mais tarde.',
        request_id: requestId
      }, 502, origem);
    }
  }

  const pendentes = await admin.from('asaas_intencoes')
    .select('asaas_subscription_id').eq('user_id', usuario.id).eq('status', 'aguardando');
  const paraEncerrar = new Set<string>(
    [assinatura?.asaas_subscription_id, ...(pendentes.data ?? []).map((p: any) => p.asaas_subscription_id)]
      .filter(Boolean) as string[]);
  for (const id of paraEncerrar) {
    try {
      await asaas('DELETE', '/subscriptions/' + id);
    } catch (e) {
      if (e instanceof AsaasErro && e.status === 404) continue;
      console.error(JSON.stringify({ request_id: requestId, evento: 'cancelar_cobranca_falhou' }));
      return json({
        erro: 'falhou',
        mensagem: 'Não foi possível encerrar sua assinatura agora, então a conta não foi excluída. Tente de novo em alguns minutos.',
        request_id: requestId
      }, 502, origem);
    }
  }

  /* ---- a exclusão ----
     Uma linha. O ON DELETE CASCADE de cada tabela faz o resto —
     e é por isso que o esquema foi escrito assim: a garantia de
     que nada fica para trás é do banco, não de uma sequência de
     DELETEs que alguém pode esquecer de atualizar. */
  const { error } = await admin.auth.admin.deleteUser(usuario.id);
  if (error) {
    console.error(JSON.stringify({
      request_id: requestId, evento: 'exclusao_falhou', status: (error as any).status ?? null
    }));
    return json({
      erro: 'falhou',
      mensagem: 'Não foi possível excluir a conta agora. Nada foi apagado.',
      request_id: requestId
    }, 502, origem);
  }

  console.error(JSON.stringify({ request_id: requestId, evento: 'conta_excluida' }));
  return json({ ok: true, resumo, request_id: requestId }, 200, origem);
});
