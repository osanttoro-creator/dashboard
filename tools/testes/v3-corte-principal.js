'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const htaccess = read('deploy/hostinger/.htaccess');
const v3 = read('app-v3.html');
const oldHtml = read('app.html');
const workflow = read('.github/workflows/deploy-hostinger.yml');
const app = read('preview-v3/app.js');
const backend = read('preview-v3/live-backend.js');
const classic = read('assets/js/app.js');
const css = read('preview-v3/app.css');

const classicRule = htaccess.indexOf('RewriteCond %{QUERY_STRING} (^|&)classic=1(&|$)');
const oldTarget = htaccess.indexOf('RewriteRule ^app(/.*)?$         /app.html [L]');
const newTarget = htaccess.indexOf('RewriteRule ^app(/.*)?$         /app-v3.html [L]');
assert.ok(classicRule >= 0 && classicRule < oldTarget && oldTarget < newTarget,
  'a rota de recuperação deve ter prioridade sobre a V3');
assert.match(classic, /new URLSearchParams\(location\.search\)\.get\('classic'\) === '1'/);
assert.match(v3, /data-oaze-mode="live" data-cookies-no-aceite/);
assert.match(oldHtml, /class="app-vnext"/);
assert.match(workflow, /checar \/app\s+200/);
assert.match(workflow, /class="app-vnext"/);
assert.match(v3, /class="v3-logo" href="\/app"/);
assert.match(backend, /\.from\('privacy_acceptances'\)/);
assert.match(backend, /if \(!acceptance\) \{ global\.location\.replace\('\/app\?classic=1'\)/);
assert.match(app, /const initialPaths = /);
assert.match(app, /const classicPaths = /);
assert.match(app, /OazeCookies\.mostrar\(\)/);
assert.match(app, /\/app\?classic=1/);
assert.match(css, /\.aviso-cookies\{/);
console.log('OK — /app usa V3; painel anterior, consentimento e cookies têm caminho seguro.');
