/* =============================================================
   tools/varrer-segredos.js — nada secreto vai para o navegador
   -------------------------------------------------------------
   Roda com: node tools/varrer-segredos.js
   Sai com código 1 quando encontra algo — serve para CI.

   VARRE O QUE VAI PARA O NAVEGADOR, e só isso: HTML, CSS, JS e o
   pacote de deploy. As Edge Functions (supabase/functions) NÃO são
   varridas de propósito — elas leem Deno.env e é exatamente lá que
   os segredos devem estar. Varrê-las junto produziria um alerta
   para o comportamento correto, e um alerta que sempre grita é um
   alerta que ninguém lê.

   O QUE PROCURA
     · OPENAI_API_KEY e chaves sk-… da OpenAI
     · a service_role do Supabase (JWT com esse papel, e sb_secret_)
     · chaves privadas em PEM
     · segredos de webhook do provedor de pagamento

   O QUE NÃO É SEGREDO, e por isso não é acusado
   A chave publicável do Supabase (sb_publishable_… / a anon em
   JWT). Ela é feita para o front-end; quem protege os dados é o
   RLS. Confundir as duas leva a esconder a errada e publicar a
   outra.
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

/* Diretórios que NÃO chegam ao navegador. */
const IGNORAR = new Set([
  'supabase',   // Edge Functions e SQL: é o lado do servidor
  'docs',
  'tools',
  '.git',
  '.agents',
  '.claude',
  '.github',
  'node_modules',
  '.tmp-preview'
]);

const EXTENSOES = ['.html', '.js', '.css', '.json', '.webmanifest', '.txt', '.xml'];

const PADROES = [
  { nome: 'chave da OpenAI', re: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { nome: 'variável OPENAI_API_KEY com valor', re: /OPENAI_API_KEY\s*[:=]\s*['"][^'"]{8,}/ },
  { nome: 'service_role do Supabase (JWT)', re: /"role"\s*:\s*"service_role"/ },
  { nome: 'service_role do Supabase (JWT em base64)', re: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]*c2VydmljZV9yb2xl/ },
  { nome: 'segredo do Supabase (sb_secret_)', re: /\bsb_secret_[A-Za-z0-9_-]+/ },
  { nome: 'chave privada em PEM', re: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { nome: 'segredo de webhook com valor', re: /WEBHOOK_SECRET\s*[:=]\s*['"][^'"]{8,}/ }
];

const achados = [];

function varrer(dir) {
  for (const nome of fs.readdirSync(dir)) {
    if (IGNORAR.has(nome)) continue;
    const completo = path.join(dir, nome);
    const st = fs.statSync(completo);
    if (st.isDirectory()) { varrer(completo); continue; }
    if (!EXTENSOES.includes(path.extname(nome).toLowerCase())) continue;

    const conteudo = fs.readFileSync(completo, 'utf8');
    for (const { nome: rotulo, re } of PADROES) {
      const m = conteudo.match(re);
      if (!m) continue;
      /* Mostra só o começo do achado: imprimir a chave inteira no
         log de CI seria vazá-la de novo, agora num lugar público. */
      achados.push({
        arquivo: path.relative(RAIZ, completo),
        tipo: rotulo,
        trecho: m[0].slice(0, 12) + '…'
      });
    }
  }
}

varrer(RAIZ);

if (!achados.length) {
  console.log('OK — nenhum segredo no que vai para o navegador.');
  process.exit(0);
}

console.log('SEGREDOS EXPOSTOS (' + achados.length + '):\n');
for (const a of achados) {
  console.log('  ' + a.arquivo + '\n    ' + a.tipo + ': ' + a.trecho + '\n');
}
console.log('Revogue cada uma no provedor. Uma chave que esteve num arquivo');
console.log('do front-end deve ser considerada comprometida, mesmo que o');
console.log('arquivo nunca tenha sido publicado.');
process.exit(1);
