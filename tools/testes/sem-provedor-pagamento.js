/* Impede que o modelo de cobrança removido volte ao produto por acidente. */
'use strict';

const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..', '..');
const arquivos = [
  '.env.example', 'index.html', 'precos.html', 'termos.html',
  'privacidade.html', 'suporte.html', 'robots.txt',
  'assets/js/site.js', 'assets/js/conta.js',
  'assets/js/pages/precos.js', 'assets/js/pages/settings.js',
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

const falhas = [];
for (const arquivo of arquivos) {
  const conteudo = fs.readFileSync(path.join(raiz, arquivo), 'utf8');
  for (const re of proibidos) {
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
