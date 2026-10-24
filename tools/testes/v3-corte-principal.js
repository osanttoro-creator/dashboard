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
const vm = require('node:vm');
const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const htaccess = read('deploy/hostinger/.htaccess');
const v3 = read('app-v3.html');
const workflow = read('.github/workflows/deploy-hostinger.yml');
const app = read('assets/app/app.js');
const backend = read('assets/app/live-backend.js');
const css = read('assets/app/app.css');
const landing = read('index.html');
const siteAuth = read('assets/js/site-auth.js');

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

/* O provedor pode usar a Site URL padrão / como fallback. Só callbacks
   autenticados seguem para /app; uma visita comum continua na apresentação. */
const callbackScript = landing.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(callbackScript, 'a landing precisa entregar callbacks de autenticação ao app');
function callback(search = '', hash = '') {
  let target = null;
  const location = { search, hash, replace(url) { target = url; } };
  vm.runInNewContext(callbackScript, { location, URLSearchParams });
  return target;
}
assert.equal(callback(), null, 'a landing normal continua pública');
assert.equal(callback('?code=exemplo'), '/app?code=exemplo');
assert.equal(callback('', '#access_token=a&refresh_token=b'), '/app#access_token=a&refresh_token=b');
assert.equal(callback('?error=access_denied&error_description=cancelado'),
  '/app?error=access_denied&error_description=cancelado');

function loginDestination(search) {
  const window = { location: { search }, localStorage: { setItem() {} } };
  vm.runInNewContext(siteAuth, {
    window, document: { documentElement: { lang: 'pt-BR' } }, URLSearchParams,
    localStorage: window.localStorage,
  });
  return window.SiteAuth.destino();
}
assert.equal(loginDestination(''), '/app');
assert.equal(loginDestination('?destino=/'), '/app', 'entrar não pode voltar à landing');
assert.equal(loginDestination('?destino=/app/carteira'), '/app/carteira');
assert.equal(loginDestination('?destino=https%3A%2F%2Foutro.site'), '/app');

/* Privacidade antes de dado, sempre. */
assert.match(backend, /\.from\('privacy_acceptances'\)/);
assert.match(backend, /await requireConsent\(\)/);
assert.match(backend, /app_bloqueio/);

assert.match(app, /const initialPaths = /);
assert.match(app, /OazeCookies\.mostrar\(\)/);
assert.match(css, /\.aviso-cookies\{/);
console.log('OK — /app é a V3, sem rota nem link de volta; consentimento e cookies no lugar.');
