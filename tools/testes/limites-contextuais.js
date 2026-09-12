/* =============================================================
   limites-contextuais.js — limites só aparecem durante a ação
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(RAIZ, 'app.html'), 'utf8');
const app = fs.readFileSync(path.join(RAIZ, 'assets', 'js', 'app.js'), 'utf8');
const limites = fs.readFileSync(path.join(RAIZ, 'assets', 'js', 'limites.js'), 'utf8');
const forms = fs.readFileSync(path.join(RAIZ, 'assets', 'js', 'forms.js'), 'utf8');
const css = fs.readFileSync(path.join(RAIZ, 'assets', 'css', 'style.css'), 'utf8');

const falhas = [];

if (html.includes('faixaExcedente') || app.includes('pintarExcedente')) {
  falhas.push('o aviso permanente de excedente voltou para a interface');
}
if (limites.includes('Você tem mais itens do que o plano')) {
  falhas.push('a mensagem permanente de excedente ainda existe');
}
if (!/Limites\.exigirEspaco\s*=\s*function[\s\S]*?UI\.openModal/.test(limites)) {
  falhas.push('o alerta contextual de limite deixou de abrir no momento da ação');
}
for (const tipo of ['accounts', 'credit_cards', 'custom_categories', 'workspaces']) {
  if (!forms.includes(`Limites.exigirEspaco('${tipo}')`)) {
    falhas.push('a criação de ' + tipo + ' não confere o limite');
  }
}

const inicioBaralho = css.indexOf('.wallet-deck-stack {');
const fimBaralho = css.indexOf('/* Canto direito do cartão', inicioBaralho);
const blocoBaralho = inicioBaralho >= 0 && fimBaralho > inicioBaralho
  ? css.slice(inicioBaralho, fimBaralho)
  : '';
if (!blocoBaralho) falhas.push('as regras do baralho de cartões estão ausentes');
else if (/scale\(/.test(blocoBaralho)) {
  falhas.push('os cartões do baralho voltaram a usar tamanhos diferentes');
}

if (falhas.length) {
  console.error('Experiência de limites ou cartões quebrada:');
  falhas.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}

console.log('OK — cartões mantêm a mesma escala e limites aparecem somente durante a ação.');
