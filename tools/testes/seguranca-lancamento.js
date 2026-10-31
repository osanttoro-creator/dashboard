/* Cobertura do lote de lançamento que não depende de rede. */
'use strict';
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..', '..');
const caminho = (a) => path.join(raiz, a);
const ler = (a) => fs.readFileSync(caminho(a), 'utf8');
const falhas = [];
const exige = (ok, msg) => { if (!ok) falhas.push(msg); };

/* Página de passagem: só repassa o retorno da Stripe ao app instalado
   (oaze://billing). Não guarda nada no navegador nem é indexada. */
const passagem = ['retorno-app.html'];
const htmls = fs.readdirSync(raiz).filter((f) => f.endsWith('.html'));
for (const arquivo of htmls) {
  const c = ler(arquivo);
  exige(!/hostingersite\.com|@gmail\.com/i.test(c), arquivo + ': domínio ou suporte antigo');
  if (passagem.includes(arquivo)) {
    exige(/noindex/.test(c) && !/localStorage|document\.cookie/.test(c), arquivo + ': página de passagem indexável ou guardando dados');
    continue;
  }
  exige(/assets\/js\/cookies\.js/.test(c), arquivo + ': aviso de cookies não carregado');
  if (!['app-v3.html', 'confirmar-email.html', 'redefinir-senha.html'].includes(arquivo)) {
    exige(/<meta name="description" content="[^"]+"/.test(c), arquivo + ': sem meta description');
  }
}

const ht = ler('deploy/hostinger/.htaccess');
['Content-Security-Policy', 'Strict-Transport-Security', 'X-Content-Type-Options',
  'Referrer-Policy', 'Permissions-Policy', 'frame-ancestors'].forEach((h) =>
  exige(ht.includes(h), '.htaccess sem ' + h));
exige(/RewriteRule \^ https:\/\//.test(ht), '.htaccess não força HTTPS');

/* O importador automático de extratos saiu em 16/09/2026 e não
   voltou: ele lia arquivo e gravava sozinho. O que existe hoje é
   outro contrato — a pessoa escolhe o arquivo, a leitura acontece
   NESTE aparelho e cada linha passa por revisão antes de virar
   lançamento. Por isso o teste deixou de exigir a ausência de
   campo de arquivo e passou a exigir a presença das duas travas
   que tornam esse campo defensável. */
exige(!fs.existsSync(caminho('assets/js/importer.js')), 'o importador automático voltou a existir');
const importador = ler('assets/app/coco-import.js');
exige(/FileReader|readAsText|arrayBuffer/.test(importador), 'a leitura do extrato saiu do aparelho');
exige(/data-action="review-import-row"/.test(ler('assets/app/app.js')), 'o extrato deixou de passar por revisão');

const assistant = ler('supabase/functions/oaze-assistant/index.ts');
exige(/reservarRateLimit/.test(assistant), 'assistente sem limite por minuto/dia');
exige(/store:\s*false/.test(assistant), 'OpenAI pode armazenar a resposta');
exige(/slice\(0, 12_000\)/.test(assistant), 'resposta da API não é limitada');
exige(/Object\.keys\(corpo/.test(ler('supabase/functions/oaze-pagamento/index.ts')), 'pagamento aceita mass assignment');

if (falhas.length) { console.error(falhas.join('\n')); process.exit(1); }
console.log('OK - domínio, metadados, upload, rate limit e headers cobertos');
