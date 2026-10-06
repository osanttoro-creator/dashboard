/* Resposta falada da Coco: texto curto, sessão válida, consentimento e limite por usuário.
   O áudio fica só na resposta HTTP; não vai para o banco nem para o Storage. */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { reservarRateLimit } from '../_shared/security.ts';

function cors(origin: string | null) {
  const allowed = (Deno.env.get('OAZE_ALLOWED_ORIGINS') || '').split(',').map((x) => x.trim());
  return {
    'Access-Control-Allow-Origin': origin && allowed.includes(origin) ? origin : 'null',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin'
  };
}
function fail(message: string, status: number, origin: string | null) {
  return new Response(JSON.stringify({ erro: true, mensagem: message }), { status,
    headers: { ...cors(origin), 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
async function limitedJson(req: Request): Promise<{ text?: unknown } | null> {
  const reader = req.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4500) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { return null; }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'POST') return fail('Método não permitido.', 405, origin);
  if (origin && cors(origin)['Access-Control-Allow-Origin'] === 'null') return fail('Origem não autorizada.', 403, origin);
  if (Number(req.headers.get('content-length') || 0) > 4500) return fail('Resposta muito longa.', 413, origin);
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return fail('Entre na sua conta para ouvir a Coco.', 401, origin);
  const url = Deno.env.get('SUPABASE_URL') || '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const key = Deno.env.get('OPENAI_API_KEY') || '';
  if (!url || !anon || !service || !key) return fail('Voz indisponível agora.', 503, origin);
  const client = createClient(url, anon, { global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false } });
  const { data: who, error: authError } = await client.auth.getUser();
  if (authError || !who?.user) return fail('Sua sessão expirou.', 401, origin);
  const { data: settings, error: settingsError } = await client.from('coco_settings')
    .select('consented_at,revoked_at').eq('user_id', who.user.id).maybeSingle();
  if (settingsError || !settings?.consented_at || settings.revoked_at) return fail('Autorize a Coco antes de ouvir respostas.', 403, origin);
  const body = await limitedJson(req);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Pedido inválido.', 400, origin);
  const text = String(body.text || '').trim();
  if (!text || text.length > 1200) return fail('A resposta falada deve ter até 1.200 caracteres.', 400, origin);
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const minute = await reservarRateLimit(admin, 'coco_voz:minuto', who.user.id, 3, 60);
    const day = await reservarRateLimit(admin, 'coco_voz:dia', who.user.id, 30, 86400);
    if (!minute.permitido || !day.permitido) return fail('Limite de respostas faladas atingido. Tente mais tarde.', 429, origin);
  } catch { return fail('Voz indisponível agora.', 503, origin); }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: 'coral', input: text,
        instructions: 'Fale em português brasileiro, com clareza, naturalidade e calma. Não acrescente nenhuma informação ao texto.', response_format: 'mp3' })
    });
    if (!response.ok) return fail('Não consegui gerar o áudio agora.', 502, origin);
    const audio = await response.arrayBuffer();
    if (audio.byteLength > 3_000_000) return fail('Áudio acima do limite.', 502, origin);
    return new Response(audio, { status: 200, headers: { ...cors(origin), 'content-type': 'audio/mpeg', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
  } catch { return fail('A voz demorou a responder. Tente novamente.', 504, origin); }
  finally { clearTimeout(timer); }
});
