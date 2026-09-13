/* Procura formatos de credencial em TODOS os commits sem imprimir
   o conteúdo encontrado. Se acusar algo, revogue a chave antes de
   reescrever histórico: apagar um commit não descompromete segredo. */
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

const PADROES = [
  ['OpenAI', 'sk-(proj-|svcacct-)?[A-Za-z0-9_-]{20,}'],
  ['Stripe secreta', '[rs]k_(live|test)_[A-Za-z0-9]{20,}'],
  ['Stripe webhook', 'whsec_[A-Za-z0-9]{20,}'],
  ['Supabase secreta', 'sb_secret_[A-Za-z0-9_-]{20,}'],
  ['Asaas', '\\$aact_[A-Za-z0-9_-]{20,}'],
  ['chave privada', 'BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY']
];

const achados = [];
for (const [nome, padrao] of PADROES) {
  let saida = '';
  try {
    saida = execFileSync('git', [
      'log', '--all', '--format=%H', '--extended-regexp', '-G', padrao, '--',
      '.', ':(exclude)tools/varrer-historico-segredos.js'
    ], { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    console.error('Não foi possível examinar o histórico do Git.');
    process.exit(1);
  }
  const commits = [...new Set(saida.split(/\r?\n/).filter((v) => /^[a-f0-9]{40}$/.test(v)))];
  if (commits.length) achados.push({ nome, commits: commits.map((c) => c.slice(0, 12)) });
}

if (achados.length) {
  console.error('Possíveis segredos no histórico:');
  achados.forEach((a) => console.error('  ' + a.nome + ': commits ' + a.commits.join(', ')));
  console.error('Nenhum valor foi impresso. Revogue primeiro; depois avalie git-filter-repo com backup.');
  process.exit(1);
}

console.log('OK - nenhum formato conhecido de segredo no histórico do Git');
