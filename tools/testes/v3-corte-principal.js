'use strict';

/* =============================================================
   /APP É A V3, E AGORA NÃO HÁ MAIS PARA ONDE VOLTAR
   -------------------------------------------------------------
   Este teste nasceu guardando o contrário: que a rota de
   recuperação `?classic=1` tivesse prioridade sobre a V3, para que
   um defeito no painel novo não deixasse ninguém sem aplicativo.

   O painel anterior foi apagado. Guardar uma rota para um arquivo
   que não existe seria guardar um 404 — e, pior, uma promessa: um
   link escrito na tela dizendo "abrir ferramentas completas" que
   não abre nada. Então o contrato se inverte: a saída não pode
   voltar por acidente, nem na rota, nem num link esquecido.

   O que continua valendo é o resto, que não tinha nada a ver com a
   versão: /app entrega HTML, o consentimento de privacidade é
   exigido antes de qualquer dado, e o aviso de cookies tem onde
   aparecer.
   ============================================================= */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const htaccess = read('deploy/hostinger/.htaccess');
const v3 = read('app-v3.html');
const workflow = read('.github/workflows/deploy-hostinger.yml');
const app = read('preview-v3/app.js');
const backend = read('preview-v3/live-backend.js');
const css = read('preview-v3/app.css');

/* A rota: /app e /onboarding entregam a V3, e só ela. */
assert.ok(htaccess.includes('RewriteRule ^app(/.*)?$         /app-v3.html [L]'),
  '/app precisa entregar a V3');
assert.ok(htaccess.includes('RewriteRule ^onboarding(/.*)?$  /app-v3.html [L]'),
  '/onboarding precisa entregar a V3');
assert.doesNotMatch(htaccess, /classic=1/, 'a rota do painel anterior não pode voltar');
assert.ok(!fs.existsSync(path.join(root, 'app.html')), 'o painel anterior foi apagado');
assert.ok(!fs.existsSync(path.join(root, 'assets', 'js', 'pages')),
  'as telas do painel anterior foram apagadas');
assert.ok(!fs.existsSync(path.join(root, 'assets', 'css', 'style.css')),
  'a folha de estilo do painel anterior foi apagada');

/* E nenhum link para ele, que é como um painel apagado continua
   aparecendo para quem usa. */
assert.doesNotMatch(app, /classic/, 'nenhuma saída para o painel anterior na interface');

assert.match(v3, /data-oaze-mode="live" data-cookies-no-aceite/);
assert.match(workflow, /checar \/app\s+200/);
assert.match(v3, /class="v3-logo" href="\/app"/);

/* Privacidade antes de dado, sempre. */
assert.match(backend, /\.from\('privacy_acceptances'\)/);
assert.match(backend, /await requirePrivacyAcceptance\(\)/);
assert.match(backend, /source: 'app_bloqueio'/);

assert.match(app, /const initialPaths = /);
assert.match(app, /OazeCookies\.mostrar\(\)/);
assert.match(css, /\.aviso-cookies\{/);
console.log('OK — /app é a V3, sem rota nem link de volta; consentimento e cookies no lugar.');
