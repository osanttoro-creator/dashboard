/* Cobertura do lote de lançamento que não depende de rede. */
'use strict';
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..', '..');
const caminho = (a) => path.join(raiz, a);
const ler = (a) => fs.readFileSync(caminho(a), 'utf8');
const falhas = [];
const exige = (ok, msg) => { if (!ok) falhas.push(msg); };

const htmls = fs.readdirSync(raiz).filter((f) => f.endsWith('.html'));
for (const arquivo of htmls) {
  const c = ler(arquivo);
  exige(!/hostingersite\.com|@gmail\.com/i.test(c), arquivo + ': domínio ou suporte antigo');
  exige(/assets\/js\/cookies\.js/.test(c), arquivo + ': aviso de cookies não carregado');
  if (!['app.html', 'confirmar-email.html', 'redefinir-senha.html'].includes(arquivo)) {
    exige(/<meta name="description" content="[^"]+"/.test(c), arquivo + ': sem meta description');
  }
}

const ht = ler('deploy/hostinger/.htaccess');
['Content-Security-Policy', 'Strict-Transport-Security', 'X-Content-Type-Options',
  'Referrer-Policy', 'Permissions-Policy', 'frame-ancestors'].forEach((h) =>
  exige(ht.includes(h), '.htaccess sem ' + h));
exige(/RewriteRule \^ https:\/\//.test(ht), '.htaccess não força HTTPS');

/* A importação de extratos saiu em 16/09/2026 e, com ela, o único
   ponto de upload do aplicativo. O teste passou a garantir a
   ausência: nenhum campo de arquivo é mais fácil de defender do que
   um leitor de arquivo bem trancado. */
exige(!fs.existsSync(caminho('assets/js/importer.js')), 'o importador de extratos voltou a existir');
exige(!/type="file"/.test(ler('app.html')), 'o app voltou a aceitar upload de arquivo');

const assistant = ler('supabase/functions/oaze-assistant/index.ts');
exige(/reservarRateLimit/.test(assistant), 'assistente sem limite por minuto/dia');
exige(/store:\s*false/.test(assistant), 'OpenAI pode armazenar a resposta');
exige(/slice\(0, 12_000\)/.test(assistant), 'resposta da API não é limitada');
exige(/Object\.keys\(corpo/.test(ler('supabase/functions/oaze-pagamento/index.ts')), 'pagamento aceita mass assignment');

if (falhas.length) { console.error(falhas.join('\n')); process.exit(1); }
console.log('OK - domínio, metadados, upload, rate limit e headers cobertos');
