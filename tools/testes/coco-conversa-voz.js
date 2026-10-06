'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('preview-v3/app.js');
const backend = read('preview-v3/live-backend.js');
const voice = read('supabase/functions/oaze-coco-voz/index.ts');
const privacy = read('privacidade.html');
const config = read('supabase/config.toml');

assert.match(app, /coco:renderCoco/);
assert.match(app, /data-coco-view="conversation"/);
assert.match(app, /data-coco-view="analysis"/);
assert.match(app, /function renderCocoAnalysis\(\)/);
assert.match(app, /navigator\.mediaDevices\.getUserMedia/);
assert.match(app, /data-action="record-audio" aria-label="Gravar áudio"/);
assert.doesNotMatch(app, /data-action="choose-coco-audio"/);
assert.match(app, /type="file" hidden/, 'o anexo permite selecionar qualquer arquivo');
assert.match(app, /readCocoMedia\(file,true\)/, 'a gravação entra na conversa automaticamente após confirmação');
assert.match(app, /state\.voiceDraft=audio/);
assert.match(app, /Revise o texto antes de enviar à Coco/);
assert.match(app, /if \(speakAfter && answered\) playCocoAnswer/);
assert.match(app, /data-action="review-proposal"/);
assert.match(backend, /\/functions\/v1\/oaze-coco-voz/);
assert.match(voice, /client\.auth\.getUser\(\)/);
assert.match(voice, /settings\.revoked_at/);
assert.match(voice, /reservarRateLimit/);
assert.match(voice, /limitedJson\(req\)/);
assert.match(voice, /\/v1\/audio\/speech/);
assert.match(voice, /cache-control': 'no-store'/);
assert.match(config, /\[functions\.oaze-coco-voz\]\s+verify_jwt = true/);
assert.match(privacy, /voz sintética/);
assert.doesNotMatch(app + backend, /api\.openai\.com/);

console.log('Coco: conversa e análises separadas, áudio revisado, voz autenticada e limitada.');
