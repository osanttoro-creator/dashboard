/* Dados complementares de contas. PIN nunca vai para public.dados nem para o navegador após a resposta. */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corpoCabeNoLimite, reservarRateLimit } from '../_shared/security.ts';

const origins = (Deno.env.get('OAZE_ALLOWED_ORIGINS') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && origins.includes(origin) ? origin : 'null',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
  'Cache-Control': 'no-store'
});
const reply = (origin: string | null, status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { ...cors(origin), 'content-type': 'application/json; charset=utf-8' }
});
const pinOk = (pin: unknown): pin is string => {
  if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) return false;
  if (/(\d)\1{3}/.test(pin) || /^(\d{2})\1{2}$/.test(pin) || /^123456$|^654321$|^012345$|^987654$/.test(pin)) return false;
  const n = [...pin].map(Number);
  if (n.every((x, i) => i === 0 || x === (n[i - 1] + 1) % 10)
    || n.every((x, i) => i === 0 || x === (n[i - 1] + 9) % 10)) return false;
  const day = Number(pin.slice(0, 2)), month = Number(pin.slice(2, 4));
  const dayUS = Number(pin.slice(2, 4)), monthUS = Number(pin.slice(0, 2));
  if ((day >= 1 && day <= 31 && month >= 1 && month <= 12)
    || (dayUS >= 1 && dayUS <= 31 && monthUS >= 1 && monthUS <= 12)) return false;
  return true;
};
const bytes = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
const base64 = (value: Uint8Array) => btoa(String.fromCharCode(...value));

async function key() {
  const raw = Deno.env.get('OAZE_COFRE_KEY') ?? '';
  let material: Uint8Array;
  try { material = bytes(raw); } catch { throw new Error('config'); }
  if (material.length !== 32) throw new Error('config');
  return crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function encrypt(value: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), plain);
  return { cipher_text: base64(new Uint8Array(encrypted)), nonce: base64(iv) };
}
async function decrypt(cipher: string | null, nonce: string | null): Promise<Record<string, unknown>> {
  if (!cipher || !nonce) return {};
  const decoded = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(nonce) }, await key(), bytes(cipher));
  const value = JSON.parse(new TextDecoder().decode(decoded));
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'POST') return reply(origin, 405, { erro: 'Método não permitido.' });
  if (origin && !origins.includes(origin)) return reply(origin, 403, { erro: 'Origem não autorizada.' });
  if (!corpoCabeNoLimite(req, 4096)) return reply(origin, 413, { erro: 'Requisição grande demais.' });
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !anon || !service || !Deno.env.get('OAZE_COFRE_KEY'))
    return reply(origin, 503, { erro: 'Cofre indisponível.' });
  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return reply(origin, 401, { erro: 'Sessão inválida.' });
  const auth = createClient(url, anon, { global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false } });
  const { data: verified, error: authError } = await auth.auth.getUser();
  const user = verified?.user;
  if (authError || !user || !user.email_confirmed_at) return reply(origin, 401, { erro: 'Confirme o e-mail primeiro.' });
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 4096) return reply(origin, 413, { erro: 'Requisição grande demais.' });
    body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('body');
  } catch { return reply(origin, 400, { erro: 'Requisição inválida.' }); }
  try {
    const limit = await reservarRateLimit(admin, 'cofre', user.id, 40, 3600);
    if (!limit.permitido) return reply(origin, 429, { erro: 'Muitas tentativas. Aguarde e tente novamente.' });
    const action = body.action;
    const { data: current, error: dbError } = await admin.from('oaze_cofre')
      .select('user_id,cipher_text,nonce,updated_at').eq('user_id', user.id).maybeSingle();
    if (dbError) throw dbError;
    if (action === 'status') return reply(origin, 200, { configured: !!current });
    if (action === 'setup') {
      if (current) return reply(origin, 409, { erro: 'PIN já configurado.' });
      if (!pinOk(body.pin)) return reply(origin, 400, { erro: 'Escolha seis dígitos sem datas ou sequências fáceis.' });
      const { data, error } = await admin.rpc('oaze_cofre_configurar', { p_user_id: user.id, p_pin: body.pin });
      if (error) throw error;
      return reply(origin, data ? 200 : 409, data ? { ok: true } : { erro: 'PIN já configurado.' });
    }
    if (!current) return reply(origin, 409, { erro: 'Crie o PIN primeiro.' });
    if (typeof body.pin !== 'string' || !/^\d{6}$/.test(body.pin)) return reply(origin, 400, { erro: 'Informe o PIN de seis dígitos.' });
    const { data: unlocked, error: pinError } = await admin.rpc('oaze_cofre_verificar', {
      p_user_id: user.id, p_pin: body.pin
    });
    if (pinError) throw pinError;
    if (!unlocked) return reply(origin, 423, { erro: 'PIN incorreto ou temporariamente bloqueado.' });
    if (action !== 'reveal' && action !== 'save') return reply(origin, 400, { erro: 'Ação inválida.' });
    const accountId = String(body.accountId || '');
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(accountId)) return reply(origin, 400, { erro: 'Conta inválida.' });
    const vault = await decrypt(current.cipher_text, current.nonce);
    if (action === 'reveal') return reply(origin, 200, { data: vault[accountId] || {} });
    const input = body.data;
    if (!input || typeof input !== 'object' || Array.isArray(input)) return reply(origin, 400, { erro: 'Dados inválidos.' });
    const source = input as Record<string, unknown>;
    const entry = {
      pixKey: String(source.pixKey || '').trim().slice(0, 120),
      agency: String(source.agency || '').trim().slice(0, 40),
      accountNumber: String(source.accountNumber || '').trim().slice(0, 40),
      note: String(source.note || '').trim().slice(0, 300)
    };
    vault[accountId] = entry;
    const encrypted = await encrypt(vault);
    const { data: saved, error: saveError } = await admin.from('oaze_cofre').update({ ...encrypted,
      updated_at: new Date().toISOString() }).eq('user_id', user.id)
      .eq('updated_at', current.updated_at).select('user_id').maybeSingle();
    if (saveError) throw saveError;
    if (!saved) return reply(origin, 409, { erro: 'Dados alterados em outro aparelho. Abra o cofre de novo antes de salvar.' });
    return reply(origin, 200, { ok: true });
  } catch (error) {
    console.error('oaze-cofre: falha', error instanceof Error ? error.name : 'unknown');
    return reply(origin, 503, { erro: 'Cofre indisponível. Nenhum dado foi alterado.' });
  }
});
