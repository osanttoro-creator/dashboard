/* =============================================================
   LIMITE SÓ APARECE NA HORA DA AÇÃO
   -------------------------------------------------------------
   Houve uma faixa permanente no topo dizendo "você tem mais itens
   do que o plano permite". Ela não dava o que fazer e estava lá
   todo dia, inclusive nos dias em que a pessoa não ia criar nada —
   um aviso que não vira ação vira paisagem, e paisagem ninguém lê.

   O contrato é o contrário: o app não fala de limite até a pessoa
   tentar passar de um. Aí ele fala, diz quanto está usando de
   quanto, e abre a porta para os planos.

   O AVISO MUDOU DE DONO. Antes o próprio módulo montava um modal
   com o UI do painel anterior. Com aquele painel apagado, isso
   quebraria no meio da ação que já ia parar — e a pessoa leria
   "não acontece nada". Agora o módulo descreve e a interface
   desenha, por um gancho; este teste guarda as duas pontas.
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const limites = ler('assets/js/limites.js');
const app = ler('preview-v3/app.js');

const falhas = [];

if (/faixaExcedente|pintarExcedente/.test(app)) {
  falhas.push('o aviso permanente de excedente voltou para a interface');
}
if (limites.includes('Você tem mais itens do que o plano')) {
  falhas.push('a mensagem permanente de excedente ainda existe');
}

/* O módulo não pode voltar a desenhar: ele não tem como saber que
   interface está na tela, e foi exatamente isso que quebrou quando
   o painel anterior saiu. */
if (/UI\.openModal|U\.el\(|\bel\(/.test(limites)) {
  falhas.push('limites.js voltou a montar a própria tela');
}
if (!/Limites\.avisar = function/.test(limites)) {
  falhas.push('o gancho do aviso sumiu: o limite pararia a ação em silêncio');
}
for (const funcao of ['exigirEspaco', 'exigirRecurso']) {
  if (!new RegExp('Limites\\.' + funcao + ' = function[\\s\\S]{0,2200}?Limites\\.avisar\\(').test(limites)) {
    falhas.push(funcao + ' deixou de avisar quem tentou passar do teto');
  }
}
if (!/Limites\.avisar\s*=\s*\(aviso\)\s*=>\s*openSheet\(/.test(app)) {
  falhas.push('a interface não liga a própria tela ao gancho do aviso');
}

/* E a criação continua perguntando antes de criar. */
for (const tipo of ['accounts', 'credit_cards', 'recurring_items', 'transactions_per_month']) {
  if (!app.includes(`'${tipo}'`)) {
    falhas.push('a criação de ' + tipo + ' não confere o limite');
  }
}
if (!/function canAdd\(limit,ym\)/.test(app)) {
  falhas.push('a interface perdeu a conferência de espaço antes de criar');
}

if (falhas.length) {
  console.error('Experiência de limites quebrada:');
  falhas.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}

console.log('OK — limites aparecem somente durante a ação, e quem desenha o aviso é a interface.');
