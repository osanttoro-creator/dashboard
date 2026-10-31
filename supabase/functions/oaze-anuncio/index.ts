/* =============================================================
   oaze-anuncio — recompensa de anúncio premiado (Google AdMob)

   O app Android mostra um anúncio premiado no plano Semente. Quem
   libera os +10 lançamentos NÃO é o aparelho: é o Google, que chama
   esta função (verificação do lado do servidor, SSV) com a URL
   assinada em ECDSA P-256. Sem assinatura válida, nada é creditado.

   Configuração na AdMob (uma vez, no bloco de anúncio premiado):
     URL de callback: https://<projeto>.supabase.co/functions/v1/oaze-anuncio
   O app envia o id do usuário OAZE em ServerSideVerificationOptions.

   Segredos opcionais (Edge Function Secrets):
     OAZE_ADMOB_AD_UNITS   lista de ad_unit aceitos (separados por vírgula)
     OAZE_ANUNCIO_TESTE=1  aceita POST {acao:'teste'} autenticado — só
                           para validar o fluxo com anúncios de teste,
                           que não disparam SSV. Nunca ligar em produção.
   ============================================================= */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CHAVES_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
let chavesCache: { quando: number; chaves: Map<string, CryptoKey> } | null = null;

function b64ParaBytes(b64: string): Uint8Array {
  const normal = b64.replace(/-/g, '+').replace(/_/g, '/');
  const cheio = normal + '='.repeat((4 - (normal.length % 4)) % 4);
  const bin = atob(cheio);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function chavesDoGoogle(): Promise<Map<string, CryptoKey>> {
  if (chavesCache && Date.now() - chavesCache.quando < 6 * 3600_000) return chavesCache.chaves;
  const r = await fetch(CHAVES_URL, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('chaves_indisponiveis');
  const j = await r.json();
  const mapa = new Map<string, CryptoKey>();
  for (const k of j?.keys ?? []) {
    if (!k?.keyId || typeof k.base64 !== 'string') continue;
    const chave = await crypto.subtle.importKey('spki', b64ParaBytes(k.base64),
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    mapa.set(String(k.keyId), chave);
  }
  if (!mapa.size) throw new Error('chaves_vazias');
  chavesCache = { quando: Date.now(), chaves: mapa };
  return mapa;
}

/* A AdMob assina em DER (ASN.1); o WebCrypto espera r||s com 32 bytes cada. */
function derParaBruto(der: Uint8Array): Uint8Array {
  if (der[0] !== 0x30) throw new Error('assinatura');
  let i = 2;
  if (der[1] & 0x80) i = 2 + (der[1] & 0x7f);
  const ler = () => {
    if (der[i] !== 0x02) throw new Error('assinatura');
    const tam = der[i + 1];
    let v = der.slice(i + 2, i + 2 + tam);
    i += 2 + tam;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    if (v.length > 32) throw new Error('assinatura');
    const p = new Uint8Array(32);
    p.set(v, 32 - v.length);
    return p;
  };
  const r = ler();
  const s = ler();
  const out = new Uint8Array(64);
  out.set(r, 0); out.set(s, 32);
  return out;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

Deno.serve(async (req: Request) => {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !servico) return resposta({ ok: false }, 503);
  const admin = createClient(url, servico, { auth: { persistSession: false, autoRefreshToken: false } });

  /* ---- callback assinado da AdMob ---- */
  if (req.method === 'GET') {
    const bruto = new URL(req.url).search.slice(1);
    const corte = bruto.indexOf('&signature=');
    if (corte < 0) return resposta({ ok: false, motivo: 'sem_assinatura' }, 400);
    const conteudo = bruto.slice(0, corte);
    const q = new URLSearchParams(bruto);
    const assinatura = q.get('signature') ?? '';
    const keyId = q.get('key_id') ?? '';
    const transacao = q.get('transaction_id') ?? '';
    const usuario = q.get('user_id') ?? '';
    const adUnit = q.get('ad_unit') ?? '';
    const quando = Number(q.get('timestamp') ?? '0');

    try {
      const chave = (await chavesDoGoogle()).get(keyId);
      if (!chave) return resposta({ ok: false, motivo: 'chave' }, 400);
      const valida = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, chave,
        derParaBruto(b64ParaBytes(assinatura)), new TextEncoder().encode(conteudo));
      if (!valida) return resposta({ ok: false, motivo: 'assinatura' }, 400);
    } catch {
      return resposta({ ok: false, motivo: 'verificacao' }, 400);
    }

    /* A partir daqui a URL veio do Google. Ainda assim: usuário bem
       formado, chamada recente e bloco de anúncio esperado. */
    if (!uuid.test(usuario) || !/^[\w.:-]{4,200}$/.test(transacao)) return resposta({ ok: false, motivo: 'dados' }, 400);
    if (!Number.isFinite(quando) || Math.abs(Date.now() - quando) > 3600_000) return resposta({ ok: false, motivo: 'antigo' }, 400);
    const unidades = (Deno.env.get('OAZE_ADMOB_AD_UNITS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (unidades.length && !unidades.includes(adUnit)) return resposta({ ok: false, motivo: 'bloco' }, 400);

    const { data, error } = await admin.rpc('creditar_anuncio', { p_user: usuario, p_transacao: 'admob:' + transacao, p_origem: 'admob' });
    const r = Array.isArray(data) ? data[0] : data;
    if (error || !r) return resposta({ ok: false, motivo: 'banco' }, 500);
    /* 200 mesmo quando o limite do dia já foi atingido: a AdMob repete
       callbacks que não recebem 200, e repetir não muda a resposta. */
    return resposta({ ok: r.out_ok, motivo: r.out_motivo, hoje: r.out_hoje });
  }

  /* ---- modo de teste (desligado em produção) ---- */
  if (req.method === 'POST') {
    if (Deno.env.get('OAZE_ANUNCIO_TESTE') !== '1') return resposta({ ok: false, motivo: 'desligado' }, 404);
    const autorizacao = req.headers.get('Authorization') ?? '';
    if (!autorizacao.startsWith('Bearer ')) return resposta({ ok: false, motivo: 'sessao' }, 401);
    const cliente = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: autorizacao } }, auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: auth } = await cliente.auth.getUser();
    if (!auth?.user?.id) return resposta({ ok: false, motivo: 'sessao' }, 401);
    const { data, error } = await admin.rpc('creditar_anuncio', {
      p_user: auth.user.id, p_transacao: 'teste:' + crypto.randomUUID(), p_origem: 'teste'
    });
    const r = Array.isArray(data) ? data[0] : data;
    if (error || !r) return resposta({ ok: false, motivo: 'banco' }, 500);
    return resposta({ ok: r.out_ok, motivo: r.out_motivo, hoje: r.out_hoje });
  }

  return resposta({ ok: false }, 405);
});
