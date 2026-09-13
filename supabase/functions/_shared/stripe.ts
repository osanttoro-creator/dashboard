/* =============================================================
   Stripe — única porta do servidor para a API de pagamentos.

   SEGREDOS (Supabase Edge Function Secrets, nunca no Git):
     STRIPE_SECRET_KEY       sk_test_... ou sk_live_...
     STRIPE_WEBHOOK_SECRET   whsec_...

   A integração usa o Checkout hospedado. O navegador recebe apenas
   uma URL https://checkout.stripe.com; número de cartão e CVC nunca
   passam pelo OAZE.
   ============================================================= */

export class StripeErro extends Error {
  constructor(public status: number, public codigo: string) {
    super('stripe ' + status + ' ' + codigo);
  }
}

export function stripeConfigurada(): boolean {
  return /^(sk|rk)_(test|live)_/.test(Deno.env.get('STRIPE_SECRET_KEY') ?? '');
}

export async function stripe(
  metodo: string,
  caminho: string,
  corpo?: URLSearchParams,
  idempotencyKey?: string
): Promise<any> {
  const chave = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
  if (!/^(sk|rk)_(test|live)_/.test(chave)) throw new StripeErro(503, 'nao_configurada');

  const headers: Record<string, string> = {
    Authorization: 'Bearer ' + chave
  };
  if (corpo) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey.slice(0, 255);

  const resposta = await fetch('https://api.stripe.com/v1' + caminho, {
    method: metodo,
    headers,
    body: corpo?.toString(),
    signal: AbortSignal.timeout(20_000)
  });
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    /* O corpo pode conter dado enviado pelo usuário. O log e a tela
       recebem só o código curto definido pela Stripe. */
    throw new StripeErro(resposta.status, String(dados?.error?.code || dados?.error?.type || 'falhou').slice(0, 80));
  }
  return dados;
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

function iguais(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a.toLowerCase());
  const y = new TextEncoder().encode(b.toLowerCase());
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

export async function assinaturaStripeValida(
  corpoCru: string,
  cabecalho: string,
  toleranciaSegundos = 300
): Promise<boolean> {
  const segredo = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
  if (!segredo.startsWith('whsec_') || corpoCru.length > 262_144) return false;

  let timestamp = 0;
  const assinaturas: string[] = [];
  for (const parte of cabecalho.split(',')) {
    const [chave, valor] = parte.trim().split('=', 2);
    if (chave === 't') timestamp = Number(valor);
    if (chave === 'v1' && valor) assinaturas.push(valor);
  }
  if (!Number.isFinite(timestamp) || !assinaturas.length) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > toleranciaSegundos) return false;

  const chaveHmac = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(segredo),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const resumo = hex(await crypto.subtle.sign(
    'HMAC', chaveHmac, new TextEncoder().encode(timestamp + '.' + corpoCru)
  ));
  return assinaturas.some((recebida) => iguais(recebida, resumo));
}
