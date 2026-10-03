/* Impede que o modelo de cobrança removido volte ao produto por acidente. */
'use strict';

const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..', '..');
const arquivos = [
  '.env.example', 'index.html', 'precos.html', 'termos.html',
  'privacidade.html', 'suporte.html', 'robots.txt',
  'assets/js/site.js', 'assets/js/planos.js',
  'preview-v3/app.js', 'preview-v3/live-backend.js',
  'deploy/hostinger/.htaccess',
  'supabase/migrations/20260902_ai_limites_e_assinatura.sql',
  'supabase/migrations/20260902_planos.sql',
  'supabase/migrations/20260902_planos_funcoes_rls.sql'
];
const proibidos = [
  /mercado\s*pago/i, /mercadopago/i,
  /data-link-plano/i, /oaze-(checkout|mp-webhook|assinatura)/i,
  /external_(price|customer|subscription|event)_id/i,
  /provedor\s+(externo\s+)?de\s+pagamento/i
];

/* A interface do aplicativo tem um catálogo de instituições para a
   pessoa dizer de que banco é a conta, e nele existem fintechs cujo
   nome coincide com o do provedor removido. Dizer "Mercado Pago" ali
   é oferecer um banco, não voltar a cobrar por ele — então o nome do
   provedor não é procurado neste arquivo; o resto é. */
const catalogoDeBancos = new Set(['preview-v3/app.js']);
const nomesDoProvedor = new Set([/mercado\s*pago/i, /mercadopago/i].map((re) => re.source));

const falhas = [];
for (const arquivo of arquivos) {
  const conteudo = fs.readFileSync(path.join(raiz, arquivo), 'utf8');
  for (const re of proibidos) {
    if (catalogoDeBancos.has(arquivo) && nomesDoProvedor.has(re.source)) continue;
    if (re.test(conteudo)) falhas.push(`${arquivo}: ${re}`);
  }
}

const funcaoAntiga = path.join(raiz, 'supabase', 'functions', 'oaze-assinatura', 'index.ts');
if (fs.existsSync(funcaoAntiga)) falhas.push('a Edge Function oaze-assinatura ainda existe');

if (falhas.length) {
  console.error(falhas.join('\n'));
  process.exit(1);
}
console.log('OK - nenhum provedor de pagamento antigo no produto');
