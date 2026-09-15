/* Contrato mínimo das páginas legais e das escolhas de privacidade. */
'use strict';

const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..', '..');
const ler = (arquivo) => fs.readFileSync(path.join(raiz, arquivo), 'utf8');
const falhas = [];
const exige = (ok, mensagem) => { if (!ok) falhas.push(mensagem); };

const termos = ler('termos.html');
const privacidade = ler('privacidade.html');
const cookies = ler('assets/js/cookies.js');

exige(termos.includes('id="sla"') && termos.includes('99,5%'), 'Termos sem SLA publicado');
exige(termos.includes('id="acessibilidade"') && termos.includes('WCAG 2.2'), 'Termos sem compromisso de acessibilidade');
exige(privacidade.includes('id="cookies"'), 'Privacidade sem política de cookies');
exige(privacidade.includes('id="incidentes"') && privacidade.includes('3 dias úteis'), 'Privacidade sem resposta a incidentes');
exige(privacidade.includes('Supabase') && privacidade.includes('Hostinger') && privacidade.includes('Stripe') && privacidade.includes('OpenAI'), 'Lista de fornecedores incompleta');
exige(cookies.includes("'aceitos'") && cookies.includes("'recusados'"), 'Banner não guarda as duas escolhas');
exige(cookies.includes('Recusar opcionais') && cookies.includes('Aceitar opcionais'), 'Banner sem aceitar e recusar opcionais');
exige(fs.existsSync(path.join(raiz, 'docs', 'BASE-LEGAL-SAAS-LGPD-ACESSIBILIDADE.md')), 'Base jurídica reutilizável ausente');

if (falhas.length) {
  console.error('Publicação legal incompleta:');
  falhas.forEach((falha) => console.error('  - ' + falha));
  process.exit(1);
}

console.log('OK - SLA, incidentes, fornecedores, cookies e acessibilidade publicados como minuta');
