'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('preview-v3/index.html');
const app = read('preview-v3/app.js');
const packageScript = read('deploy/hostinger/montar-pacote.ps1');
const workflow = read('.github/workflows/deploy-hostinger.yml');

assert.match(html, /name="robots" content="noindex, nofollow"/);
assert.match(html, /Prévia · dados de exemplo · nenhuma gravação/);
assert.doesNotMatch(html, /<script[^>]+(?:supabase-config|sync\.js|supabase-auth|ai\.js)/i);
assert.match(app, /const demo = true;/);
assert.match(app, /if\(!demo\)\{try \{ Store\.load\(\)/);
assert.match(packageScript, /\$pastas\s*=\s*@\([^\n]*'preview-v3'/);
assert.match(workflow, /- 'preview-v3\/\*\*'/);
assert.match(read('robots.txt'), /Disallow: \/preview-v3/);
for (const file of ['index.html', 'app.css', 'app.js']) {
  assert.ok(fs.existsSync(path.join(root, 'preview-v3', file)), `${file} ausente da prévia`);
}
