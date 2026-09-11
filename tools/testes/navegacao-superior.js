/* =============================================================
   navegacao-superior.js — os menus agrupados precisam ser visíveis
   -------------------------------------------------------------
   Planejar e Mais abrem painéis posicionados abaixo da fita. Se um
   ancestral voltar a usar overflow:hidden, o estado e a árvore de
   acessibilidade mudam, mas o painel é recortado visualmente.
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(RAIZ, 'app.html'), 'utf8');
const css = fs.readFileSync(path.join(RAIZ, 'assets', 'css', 'style.css'), 'utf8');
const shell = fs.readFileSync(path.join(RAIZ, 'assets', 'js', 'shell.js'), 'utf8');

const falhas = [];

for (const grupo of ['planejar', 'mais']) {
  if (!html.includes(`data-group="${grupo}"`)) falhas.push(`grupo ${grupo} ausente`);
  const gatilho = new RegExp(`<button[^>]*id="trg-${grupo}"[^>]*>`, 'i').exec(html);
  if (!gatilho) falhas.push(`gatilho ${grupo} ausente`);
  else if (!/aria-label="[^"]+"/i.test(gatilho[0])) {
    falhas.push(`gatilho ${grupo} perde o nome quando o rótulo visual é ocultado`);
  }
  if (!html.includes(`id="drop-${grupo}"`)) falhas.push(`painel ${grupo} ausente`);
}

const regrasMenu = [...css.matchAll(/\.topnav-menu\s*\{([^}]*)\}/g)].map((m) => m[1]);
if (regrasMenu.some((corpo) => /overflow\s*:\s*hidden\b/.test(corpo))) {
  falhas.push('.topnav-menu recorta os painéis com overflow:hidden');
}
if (!regrasMenu.some((corpo) => /overflow\s*:\s*visible\b/.test(corpo))) {
  falhas.push('.topnav-menu não libera o transbordo dos painéis');
}
if (!/\.topnav-drop\s*\{[^}]*position\s*:\s*absolute\b/s.test(css)) {
  falhas.push('.topnav-drop deixou de ser um painel posicionado');
}
if (!/drop\.hidden\s*=\s*false/.test(shell) || !/drop[^;\n]*\.hidden\s*=\s*true/.test(shell)) {
  falhas.push('shell.js não abre e fecha o painel pelo atributo hidden');
}

if (falhas.length) {
  console.error('Navegação superior quebrada:');
  falhas.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}

console.log('OK — Planejar e Mais podem abrir painéis visíveis.');
