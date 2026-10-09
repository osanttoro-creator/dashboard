/* Sessão curta de voz da Coco. A chave principal nunca chega ao navegador. */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corpoCabeNoLimite, reservarRateLimit, sha256 } from '../_shared/security.ts';
import { BACKEND_INSTRUCTIONS, COCO_TOOLS, LIVE_INSTRUCTIONS } from './prompts.ts';

const origins = (Deno.env.get('OAZE_ALLOWED_ORIGINS') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const headers = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && origins.includes(origin) ? origin : 'null',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', Vary: 'Origin'
});
const reply = (origin: string | null, status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { ...headers(origin), 'Content-Type': 'application/json; charset=utf-8' }
});
async function lerPedido(req: Request): Promise<unknown> {
  const reader = req.body?.getReader();
  if (!reader) throw new Error('corpo_invalido');
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 64_000) { await reader.cancel(); throw new Error('corpo_excedido'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: headers(origin) });
  if (req.method !== 'POST') return reply(origin, 405, { mensagem: 'Método não permitido.' });
  if (origin && !origins.includes(origin)) return reply(origin, 403, { mensagem: 'Origem não autorizada.' });
  if (!corpoCabeNoLimite(req, 64_000)) return reply(origin, 413, { mensagem: 'Pedido inválido.' });
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const key = Deno.env.get('OPENAI_API_KEY') ?? '';
  if (!url || !anon || !service || !key) return reply(origin, 503, { mensagem: 'Voz indisponível agora.' });
  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return reply(origin, 401, { mensagem: 'Entre na sua conta.' });
  const auth = createClient(url, anon, { global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await auth.auth.getUser();
  if (error || !data?.user?.email_confirmed_at) return reply(origin, 401, { mensagem: 'Confirme seu e-mail e entre novamente.' });
  const { data: settings, error: settingsError } = await auth.from('coco_settings')
    .select('consented_at,revoked_at').eq('user_id', data.user.id).maybeSingle();
  if (settingsError || !settings?.consented_at || settings.revoked_at)
    return reply(origin, 403, { mensagem: 'Autorize a Coco antes de iniciar a voz.' });
  let input: unknown;
  try { input = await lerPedido(req); }
  catch (error) { return reply(origin, error instanceof Error && error.message === 'corpo_excedido' ? 413 : 400,
    { mensagem: 'Pedido inválido.' }); }
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const sdp = typeof raw.sdp === 'string' ? raw.sdp.trim() : '';
  if (!sdp.startsWith('v=0') || !sdp.includes('m=audio') || sdp.length > 48_000)
    return reply(origin, 400, { mensagem: 'Conexão de voz inválida.' });
  const history = Array.isArray(raw.history) ? raw.history.slice(-6).flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as Record<string, unknown>;
    const role = row.role === 'assistant' ? 'assistant' : row.role === 'user' ? 'user' : null;
    const text = typeof row.text === 'string' ? row.text.trim().slice(0, 500) : '';
    if (!role || !text) return [];
    return [{ type: 'message', role, content: [{ type: role === 'assistant' ? 'output_text' : 'input_text', text }] }];
  }) : [];
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const hour = await reservarRateLimit(admin, 'coco_realtime:hora', data.user.id, 6, 3600);
    const day = await reservarRateLimit(admin, 'coco_realtime:dia', data.user.id, 20, 86400);
    if (!hour.permitido || !day.permitido) return reply(origin, 429, { mensagem: 'Limite de sessões de voz atingido. Use a conversa por texto.' });
  } catch { return reply(origin, 503, { mensagem: 'Voz indisponível agora.' }); }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const safety = await sha256(data.user.id);
    const provider = await fetch('https://api.openai.com/v1/live/sessions', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
        'OpenAI-Safety-Identifier': safety },
      body: JSON.stringify({
        session: {
          model: 'gpt-live-1',
          store: false,
          instructions: LIVE_INSTRUCTIONS,
          input: history,
          audio: { output: { voice: Deno.env.get('OAZE_COCO_VOICE') || 'bossa' } },
          client: { data_channel: {
            allowed_client_events: ['response.item.create', 'response.create', 'session.close',
              'session.input_audio.mute', 'session.input_audio.unmute'],
            allowed_server_events: [
              ...['session.started', 'session.closed', 'session.input_transcript.delta', 'session.output_transcript.delta',
                'session.input_audio.muted', 'session.input_audio.unmuted', 'session.delegation.created',
                'session.usage.updated', 'error'].map((type) => ({ type })),
              ...['response.created', 'response.output_item.done', 'response.completed', 'response.failed',
                'response.incomplete', 'response.error'].map((response_event) => ({ type: 'response.event', response_event }))
            ]
          } },
          delegation: {
            type: 'responses',
            responses: {
              model: Deno.env.get('OAZE_COCO_BRAIN_MODEL') || 'gpt-6-luna',
              instructions: BACKEND_INSTRUCTIONS,
              tools: COCO_TOOLS,
              tool_choice: 'auto', parallel_tool_calls: false,
              reasoning: { effort: 'medium' }, text: { verbosity: 'low' },
              max_output_tokens: 1600
            }
          }
        },
        transport: { type: 'webrtc', sdp }
      })
    });
    if (!provider.ok) {
      console.error(JSON.stringify({ evento: 'coco_live_falhou', status: provider.status }));
      return reply(origin, 502, { mensagem: 'A sessão de voz não pôde ser aberta. Use a conversa por texto.' });
    }
    const live = await provider.json();
    if (typeof live?.transport?.sdp !== 'string' || typeof live?.session?.id !== 'string')
      return reply(origin, 502, { mensagem: 'A sessão de voz não pôde ser aberta.' });
    return reply(origin, 200, { sdp: live.transport.sdp, session_id: live.session.id });
  } catch { return reply(origin, 504, { mensagem: 'A voz demorou a conectar. Tente novamente.' }); }
  finally { clearTimeout(timer); }
});
