'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const moduleCode = read('preview-v3/coco-realtime.js');
const app = read('preview-v3/app.js');
const backend = read('preview-v3/live-backend.js');
const ai = read('assets/js/ai.js');
const edge = read('supabase/functions/oaze-coco-realtime/index.ts');
const prompts = read('supabase/functions/oaze-coco-realtime/prompts.ts');
const config = read('supabase/config.toml');
const privacy = read('privacidade.html');

assert.match(edge, /\/v1\/live\/sessions/);
assert.match(edge, /const sdp = typeof raw\.sdp === 'string' \? raw\.sdp : ''/);
assert.doesNotMatch(edge, /raw\.sdp\.trim\(\)/);
assert.match(edge, /model: 'gpt-live-1'/);
assert.match(edge, /store: false/);
assert.match(edge, /OAZE_COCO_BRAIN_MODEL/);
assert.doesNotMatch(edge, /client_secrets/);
assert.match(edge, /auth\.auth\.getUser\(\)/);
assert.match(edge, /settings\.revoked_at/);
assert.match(edge, /reservarRateLimit/);
assert.match(edge, /OpenAI-Safety-Identifier/);
assert.match(prompts, /analisar_dividas/);
assert.match(prompts, /Compra já paga é despesa histórica, não dívida atual/);
assert.match(prompts, /taxa\/CET/);
assert.match(config, /\[functions\.oaze-coco-realtime\]\s+verify_jwt = true/);
assert.match(backend, /V3Backend\.cocoLiveSession/);
assert.match(backend, /\/functions\/v1\/oaze-coco-realtime/);
assert.doesNotMatch(app + backend, /api\.openai\.com|OPENAI_API_KEY/);
assert.match(app, /name==='analisar_dividas'/);
assert.match(app, /AI\.resumoDividas\(\)/);
assert.match(ai, /AI\.resumoDividas = function/);
assert.match(ai, /taxa de juros ou CET das obrigações/);
assert.match(privacy, /conversa por voz em tempo real/);

let trackStopped = 0, pcClosed = 0, dcClosed = 0;
const sent = [], status = [], user = [], answer = [], tools = [];
const track = { enabled: true, stop() { trackStopped++; } };
const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
let channel;
class FakePeer {
  constructor() { this.iceGatheringState = 'complete'; }
  createDataChannel() {
    channel = { readyState: 'open', send(x) { sent.push(JSON.parse(x)); }, close() { dcClosed++; } };
    return channel;
  }
  addTrack() {}
  async createOffer() { return { sdp: 'v=0\r\no=local' }; }
  async setLocalDescription() {}
  async setRemoteDescription(value) { assert.equal(value.sdp, 'v=0\r\no=server'); }
  close() { pcClosed++; }
}
const ctx = {
  navigator: { mediaDevices: { getUserMedia: async () => stream } },
  RTCPeerConnection: FakePeer,
  document: { createElement: () => ({ play: async () => {}, pause() {}, remove() {}, muted: false }) },
  AbortController, setTimeout, clearTimeout, setInterval, clearInterval
};
ctx.window = ctx;
vm.runInNewContext(moduleCode, ctx, { filename: 'coco-realtime.js' });
const voice = new ctx.CocoRealtime({
  onState: (x) => status.push(x), onUser: (x) => user.push(x),
  onAnswer: (x) => answer.push(x),
  onTool: async (name, args) => { tools.push([name, args]); return { ok: true }; }
});

(async () => {
  assert.equal(trackStopped, 0, 'microfone não abre silenciosamente');
  let offerSent = '';
  await voice.start({
    connect: async (sdp, history) => {
      offerSent = sdp;
      assert.equal(history[0].role, 'user');
      return { sdp: 'v=0\r\no=server', sessionId: 'live_test' };
    },
    mode: 'push', history: [{ who: 'user', text: 'Oi' }]
  });
  assert.match(offerSent, /^v=0/);
  voice.handle({ type: 'session.started', session: { id: 'live_test' } });
  assert.equal(track.enabled, false, 'push-to-talk começa sem enviar áudio');
  voice.beginPush(); assert.equal(track.enabled, true);
  voice.endPush(); assert.equal(track.enabled, false);
  voice.setReplyMuted(true);
  assert.equal(voice.audio.muted, true);
  assert.ok(!sent.some((x) => x.type === 'session.update'), 'silenciar saída é local');

  voice.handle({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'Hoje' });
  voice.handle({ type: 'response.output_audio_transcript.delta', delta: 'Tudo ' });
  voice.handle({ type: 'response.output_audio_transcript.delta', delta: 'bem.' });
  voice.handle({ type: 'response.output_audio_transcript.done' });
  assert.deepEqual(user, ['Hoje']); assert.deepEqual(answer, ['Tudo bem.']);

  voice.handle({ type: 'response.event', delegation_id: 'd1', event: { type: 'response.created', response: { id: 'r1' } } });
  voice.handle({ type: 'response.event', delegation_id: 'd1', event: { type: 'response.output_item.done', item: {
    type: 'function_call', name: 'analisar_dividas', call_id: 'c1',
    arguments: '{"objetivo":"priorizar","valor_extra_mensal":300}'
  } } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(!sent.some((x) => x.item?.call_id === 'c1'), 'resultado aguarda fechamento do lote');
  voice.handle({ type: 'response.event', delegation_id: 'd1', event: { type: 'response.completed', response: { id: 'r1', output: [] } } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(tools[0][0], 'analisar_dividas');
  assert.ok(sent.some((x) => x.type === 'response.item.create' && x.item?.call_id === 'c1'));
  assert.ok(sent.some((x) => x.type === 'response.create'));
  voice.stop();
  assert.equal(trackStopped, 1); assert.equal(pcClosed, 1); assert.equal(dcClosed, 1);
  assert.equal(status.at(-1), 'IDLE');
  let attempts = 0, fallback = 0;
  ctx.navigator.mediaDevices.getUserMedia = async (request) => {
    attempts++;
    if (request.audio.deviceId) throw Object.assign(new Error('Requested device not found'), { name: 'NotFoundError' });
    return stream;
  };
  const recovered = new ctx.CocoRealtime({ onDeviceFallback: () => fallback++ });
  await recovered.start({ deviceId: 'microfone-antigo', connect: async () => ({ sdp: 'v=0\r\no=server' }) });
  assert.equal(attempts, 2, 'tenta o microfone padrão uma vez após dispositivo antigo desaparecer');
  assert.equal(fallback, 1);
  recovered.stop();
  console.log('Coco Live: WebRTC servidor, transcrição, dívida, tools e encerramento limpo.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
