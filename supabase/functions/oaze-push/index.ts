/* =============================================================
   oaze-push — aviso diário do dólar pelo Firebase Cloud Messaging

   Manda, uma vez por dia (a partir das 9h de Brasília), a cotação do
   dólar comercial do Banco Central para os aparelhos que ligaram o
   tópico "dolar". Só dado público: nenhum valor, nome ou conta da
   pessoa sai daqui. Os avisos pessoais (vencimentos, orçamento, metas)
   são criados no próprio aparelho.

   Quem chama: pg_cron (9h05), ou qualquer um — a função é idempotente:
   antes das 9h não faz nada e, no mesmo dia, não envia duas vezes.

   Segredo necessário (Edge Function Secrets), criado por Jonatham:
     FIREBASE_SERVICE_ACCOUNT  JSON da conta de serviço do projeto
                               oaze-finance (Firebase › Contas de serviço
                               › Gerar nova chave privada). Nunca no Git.
   ============================================================= */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

function b64url(dados: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof dados === 'string' ? new TextEncoder().encode(dados) : new Uint8Array(dados as ArrayBuffer);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function tokenGoogle(conta: { client_email: string; private_key: string }): Promise<string> {
  const pem = conta.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const chave = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const corpo = b64url(JSON.stringify({
    iss: conta.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: agora, exp: agora + 3600
  }));
  const assinatura = b64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chave, new TextEncoder().encode(cabecalho + '.' + corpo)));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: cabecalho + '.' + corpo + '.' + assinatura }),
    signal: AbortSignal.timeout(10000)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('oauth_' + r.status);
  return j.access_token;
}

async function dolar(): Promise<{ data: string; valor: number; anterior: number | null } | null> {
  const r = await fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.1/dados/ultimos/2?formato=json', { signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const linhas = await r.json();
  if (!Array.isArray(linhas) || !linhas.length) return null;
  const ultima = linhas[linhas.length - 1];
  const anterior = linhas.length > 1 ? Number(linhas[linhas.length - 2].valor) : null;
  const valor = Number(ultima.valor);
  if (!Number.isFinite(valor)) return null;
  return { data: String(ultima.data), valor, anterior: Number.isFinite(anterior as number) ? anterior : null };
}

Deno.serve(async (req: Request) => {
  if (!['GET', 'POST'].includes(req.method)) return resposta({ ok: false }, 405);
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const contaBruta = Deno.env.get('FIREBASE_SERVICE_ACCOUNT') ?? '';
  if (!url || !servico) return resposta({ ok: false, motivo: 'config' }, 503);
  if (!contaBruta) return resposta({ ok: false, motivo: 'firebase_nao_configurado' }, 503);

  const agoraBR = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  if (agoraBR.getHours() < 9) return resposta({ ok: true, motivo: 'cedo' });
  const dia = agoraBR.getFullYear() + '-' + String(agoraBR.getMonth() + 1).padStart(2, '0') + '-' + String(agoraBR.getDate()).padStart(2, '0');

  const admin = createClient(url, servico, { auth: { persistSession: false, autoRefreshToken: false } });
  /* A linha do dia é a trava: quem chegar depois não envia de novo. */
  const { error: travaErro } = await admin.from('push_envios').insert({ dia, tipo: 'dolar' });
  if (travaErro) return resposta({ ok: true, motivo: 'ja_enviado' });

  let conta: { client_email: string; private_key: string; project_id: string };
  try { conta = JSON.parse(contaBruta); } catch { return resposta({ ok: false, motivo: 'conta_invalida' }, 503); }

  const cotacao = await dolar().catch(() => null);
  if (!cotacao) {
    await admin.from('push_envios').delete().eq('dia', dia).eq('tipo', 'dolar');
    return resposta({ ok: false, motivo: 'sem_cotacao' }, 502);
  }
  const variacao = cotacao.anterior ? (cotacao.valor - cotacao.anterior) / cotacao.anterior * 100 : null;
  const titulo = 'Dólar: R$ ' + cotacao.valor.toFixed(4).replace('.', ',')
    + (variacao != null ? ' (' + (variacao >= 0 ? '+' : '') + variacao.toFixed(2).replace('.', ',') + '%)' : '');
  const texto = 'Dólar comercial (venda) de ' + cotacao.data.slice(0, 5) + ', Banco Central.';

  const { data: tokens } = await admin.from('oaze2_push_tokens').select('user_id,device_id,token').contains('topicos', ['dolar']).limit(5000);
  let acesso: string;
  try { acesso = await tokenGoogle(conta); } catch (e) {
    await admin.from('push_envios').delete().eq('dia', dia).eq('tipo', 'dolar');
    return resposta({ ok: false, motivo: (e as Error).message }, 502);
  }

  let enviados = 0, falhas = 0;
  for (const t of tokens ?? []) {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${conta.project_id}/messages:send`, {
      method: 'POST', headers: { authorization: 'Bearer ' + acesso, 'content-type': 'application/json' },
      body: JSON.stringify({ message: { token: t.token,
        notification: { title: titulo, body: texto },
        android: { priority: 'normal', notification: { channel_id: 'oaze-insights' } } } }),
      signal: AbortSignal.timeout(10000)
    }).catch(() => null);
    if (r && r.ok) { enviados++; continue; }
    falhas++;
    /* Token que o Google diz não existir mais sai da lista. */
    const erro = r ? await r.json().catch(() => ({})) : {};
    const codigo = JSON.stringify(erro);
    if (r && (r.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(codigo))) {
      await admin.from('oaze2_push_tokens').delete().eq('user_id', t.user_id).eq('device_id', t.device_id);
    }
  }
  await admin.from('push_envios').update({ enviados, falhas }).eq('dia', dia).eq('tipo', 'dolar');
  return resposta({ ok: true, enviados, falhas });
});
