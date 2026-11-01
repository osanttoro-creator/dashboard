/* =============================================================
   oaze-nfce — lê o cupom fiscal eletrônico (NFC-e) pelo QR Code

   O app manda o endereço que está no QR do cupom. Esta função abre a
   página PÚBLICA de consulta da Sefaz (só hosts *.gov.br de fazenda/
   sefaz/nfce, nada mais) e devolve loja, data, total e itens. Não
   grava nada: a pessoa revisa e lança no app. (01/11/2026)
   ============================================================= */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corpoCabeNoLimite, reservarRateLimit } from '../_shared/security.ts';

const origins = (Deno.env.get('OAZE_ALLOWED_ORIGINS') || '').split(',').map((x) => x.trim()).filter(Boolean);
const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && origins.includes(origin) ? origin : 'null',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin', 'Cache-Control': 'no-store'
});
const reply = (origin: string | null, status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { ...cors(origin), 'content-type': 'application/json; charset=utf-8' }
});

/* Só a consulta pública das Sefaz. Bloqueia IP, porta e qualquer outro host. */
export function urlPermitida(raw: string): URL | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (!['https:', 'http:'].includes(u.protocol) || u.port || u.username || u.password) return null;
  const h = u.hostname.toLowerCase();
  if (!h.endsWith('.gov.br') || !/(sefaz|fazenda|nfce|nfe)/.test(h)) return null;
  return u;
}

const limpar = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const dinheiro = (s: string) => { const n = Number(String(s).replace(/[^\d,]/g, '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };

/* Layout padrão do portal nacional (SVRS, SP, MG, PR e a maioria): txtTopo,
   tabResult com txtTit/Rqtd/RUN/valor e totalNumb. */
export function lerPagina(html: string) {
  const loja = limpar((html.match(/class="txtTopo"[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '');
  const itens: { nome: string; qtd: number; un: string; valor: number }[] = [];
  const linhas = html.match(/<tr[^>]*id="Item[\s\S]*?<\/tr>/gi) || html.match(/<tr[\s\S]*?class="txtTit[\s\S]*?<\/tr>/gi) || [];
  for (const l of linhas.slice(0, 200)) {
    const nome = limpar((l.match(/class="txtTit[^"]*"[^>]*>([\s\S]*?)<\/span>/i) || [])[1] || '');
    const qtd = dinheiro(limpar((l.match(/class="Rqtd"[^>]*>([\s\S]*?)<\/span>/i) || [])[1] || '').replace(/qtde\.?:?/i, '')) || 1;
    const un = limpar((l.match(/class="RUN"[^>]*>([\s\S]*?)<\/span>/i) || [])[1] || '').replace(/UN:?/i, '').trim();
    const valor = dinheiro(limpar((l.match(/class="valor"[^>]*>([\s\S]*?)<\/span>/i) || [])[1] || ''));
    if (nome && valor) itens.push({ nome: nome.slice(0, 80), qtd, un: un.slice(0, 6), valor });
  }
  let total = dinheiro(limpar((html.match(/class="totalNumb txtMax"[^>]*>([\s\S]*?)<\/span>/i) || [])[1] || ''));
  if (!total) total = dinheiro((limpar(html).match(/Valor a pagar R\$:?\s*([\d.,]+)/i) || [])[1] || '');
  if (!total && itens.length) total = Math.round(itens.reduce((s, i) => s + i.valor, 0) * 100) / 100;
  const em = limpar(html).match(/Emiss[aã]o:?\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  const data = em ? `${em[3]}-${em[2]}-${em[1]}` : null;
  return { loja: loja.slice(0, 90), data, total, itens };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'POST') return reply(origin, 405, { mensagem: 'Método não permitido.' });
  if (origin && !origins.includes(origin)) return reply(origin, 403, { mensagem: 'Origem não autorizada.' });
  if (!corpoCabeNoLimite(req, 2048)) return reply(origin, 413, { mensagem: 'Requisição grande demais.' });
  const url = Deno.env.get('SUPABASE_URL') || '', anon = Deno.env.get('SUPABASE_ANON_KEY') || '', service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const authorization = req.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) return reply(origin, 401, { mensagem: 'Entre na conta.' });
  const client = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: verified, error } = await client.auth.getUser();
  if (error || !verified?.user) return reply(origin, 401, { mensagem: 'Sessão inválida.' });
  let alvo: URL | null = null;
  try { const body = await req.json(); alvo = urlPermitida(String(body?.url || '')); } catch { /* inválido */ }
  if (!alvo) return reply(origin, 400, { mensagem: 'Esse QR não é de uma NFC-e.' });
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const limite = await reservarRateLimit(admin, 'nfce:hora', verified.user.id, 30, 3600).catch(() => ({ permitido: false }));
  if (!limite.permitido) return reply(origin, 429, { mensagem: 'Muitas notas em pouco tempo. Tente mais tarde.' });
  try {
    const r = await fetch(alvo.toString(), { redirect: 'manual', signal: AbortSignal.timeout(9000), headers: { 'user-agent': 'Mozilla/5.0 (OAZE NFC-e)' } });
    let resposta = r;
    if (r.status >= 300 && r.status < 400) {
      const proximo = urlPermitida(new URL(r.headers.get('location') || '', alvo).toString());
      if (!proximo) return reply(origin, 502, { mensagem: 'A Sefaz redirecionou para um endereço não reconhecido.' });
      resposta = await fetch(proximo.toString(), { redirect: 'manual', signal: AbortSignal.timeout(9000) });
    }
    if (!resposta.ok) return reply(origin, 502, { mensagem: 'A Sefaz não respondeu agora. Tente em alguns minutos.' });
    const html = (await resposta.text()).slice(0, 600_000);
    const nota = lerPagina(html);
    if (!(nota.total > 0)) return reply(origin, 422, { mensagem: 'Não consegui ler o total desta nota. O layout da Sefaz deste estado ainda não é suportado.' });
    return reply(origin, 200, nota);
  } catch {
    return reply(origin, 502, { mensagem: 'A Sefaz não respondeu agora.' });
  }
});
