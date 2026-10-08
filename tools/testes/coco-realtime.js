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
const edge = read('supabase/functions/oaze-coco-realtime/index.ts');
const config = read('supabase/config.toml');
const privacy = read('privacidade.html');
const csp = read('deploy/hostinger/.htaccess');

assert.match(edge, /client_secrets/);
assert.match(edge, /auth\.auth\.getUser\(\)/);
assert.match(edge, /settings\.revoked_at/);
assert.match(edge, /reservarRateLimit/);
assert.match(edge, /OpenAI-Safety-Identifier/);
assert.match(config, /\[functions\.oaze-coco-realtime\]\s+verify_jwt = true/);
assert.match(backend, /\/functions\/v1\/oaze-coco-realtime/);
assert.doesNotMatch(app + backend, /api\.openai\.com|OPENAI_API_KEY/);
assert.match(app, /data-action="voice-stop"/);
assert.match(app, /voiceSession\.sendText\(q\)/);
assert.match(app, /AI\.chamarFuncao\(body\)/);
assert.match(privacy, /conversa por voz em tempo real/);
assert.match(csp, /connect-src[^\n]+https:\/\/api\.openai\.com/);

let trackStopped = 0, pcClosed = 0, dcClosed = 0;
const sent = [], status = [], user = [], answer = [], tools = [];
const track = { enabled: true, stop() { trackStopped++; } };
const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
let channel;
class FakePeer {
  createDataChannel() { channel = { readyState: 'open', send(x) { sent.push(JSON.parse(x)); }, close() { dcClosed++; } }; return channel; }
  addTrack() {}
  async createOffer() { return { sdp: 'offer' }; }
  async setLocalDescription() {}
  async setRemoteDescription() {}
  close() { pcClosed++; }
}
const ctx = {
  navigator: { mediaDevices: { getUserMedia: async () => stream } },
  RTCPeerConnection: FakePeer,
  document: { createElement: () => ({ play: async () => {}, pause() {}, remove() {}, muted: false }) },
  fetch: async () => ({ ok: true, text: async () => 'answer' }),
  AbortController, setTimeout, clearTimeout, setInterval, clearInterval
};
ctx.window = ctx;
vm.runInNewContext(moduleCode, ctx, { filename: 'coco-realtime.js' });
const voice = new ctx.CocoRealtime({
  onState: (x) => status.push(x), onUser: (x) => user.push(x),
  onAnswer: (x) => answer.push(x), onTool: async (name, args) => { tools.push([name, args]); return { ok: true }; }
});
(async () => {
  assert.equal(trackStopped, 0, 'microfone não abre silenciosamente');
  await voice.start({ token: 'ek_test', mode: 'push', history: [{ who: 'user', text: 'Oi' }] });
  channel.onopen();
  assert.equal(track.enabled, false, 'push-to-talk começa sem enviar áudio');
  voice.beginPush(); assert.equal(track.enabled, true);
  voice.endPush(); assert.equal(track.enabled, false);
  assert.ok(sent.some((x) => x.type === 'input_audio_buffer.commit'));
  voice.setReplyMuted(true);
  assert.ok(sent.some((x) => x.type === 'session.update' && x.session?.output_modalities?.[0] === 'text'));
  voice.handle({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'one', transcript: 'Hoje' });
  voice.handle({ type: 'response.output_audio_transcript.delta', delta: 'Tudo ' });
  voice.handle({ type: 'response.output_audio_transcript.delta', delta: 'bem.' });
  voice.handle({ type: 'response.output_audio_transcript.done' });
  assert.deepEqual(user, ['Hoje']); assert.deepEqual(answer, ['Tudo bem.']);
  voice.handle({ type: 'response.done', response: { output: [{ type: 'function_call', name: 'navegar_oaze', call_id: 'c1', arguments: '{"tela":"home"}' }] } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(tools[0][0], 'navegar_oaze');
  assert.ok(sent.some((x) => x.item?.type === 'function_call_output' && x.item.call_id === 'c1'));
  voice.stop();
  assert.equal(trackStopped, 1); assert.equal(pcClosed, 1); assert.equal(dcClosed, 1);
  assert.equal(status.at(-1), 'IDLE');
  console.log('Coco Realtime: sessão, transcrição, tools e encerramento limpo.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
