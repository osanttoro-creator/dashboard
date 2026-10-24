'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('tools/fixtures/app-demo.html');
const app = read('assets/app/app.js');
const packageScript = read('deploy/hostinger/montar-pacote.ps1');
const workflow = read('.github/workflows/deploy-hostinger.yml');
const routes = read('deploy/hostinger/.htaccess');

assert.match(html, /name="robots" content="noindex, nofollow"/);
assert.match(html, /Prévia · dados de exemplo · nenhuma gravação/);
assert.doesNotMatch(html, /<script[^>]+(?:supabase-config|sync\.js|supabase-auth|ai\.js)/i);
assert.doesNotMatch(html, /data-oaze-mode="live"/);
assert.match(app, /const demo = document\.documentElement\.dataset\.oazeMode !== 'live';/);
assert.match(app, /if\(!demo\)\{try \{ if\(!global\.V3Backend \|\| !await V3Backend\.start\(\)\) return;/);
assert.doesNotMatch(packageScript, /'preview-v3'/);
assert.doesNotMatch(workflow, /- 'preview-v3\/\*\*'/);
assert.match(routes, /RewriteRule \^preview-v3\(\/\.\*\)\?\$ - \[G,L\]/);
assert.ok(!fs.existsSync(path.join(root, 'preview-v3')), 'prévia pública ainda existe');
for (const file of ['app.css', 'app.js']) {
  assert.ok(fs.existsSync(path.join(root, 'assets/app', file)), `${file} ausente do app`);
}
