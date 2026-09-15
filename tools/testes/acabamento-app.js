/* Regressões dos ajustes finais de uso e acabamento do app. */
'use strict';

const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..', '..');
const ler = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');

const html = ler('app.html');
const app = ler('assets/js/app.js');
const css = ler('assets/css/style.css');
const importer = ler('assets/js/importer.js');
const settings = ler('assets/js/pages/settings.js');
const falhas = [];
const exigir = (cond, msg) => { if (!cond) falhas.push(msg); };

exigir(!/Registrato/i.test(html + importer), 'a função/propaganda do Registrato ainda existe');
exigir(!/accept=[^>]*\.pdf/i.test(html), 'o seletor ainda oferece PDF');
exigir(/PDF não é aceito/.test(html), 'falta explicar por que PDF não é aceito');
exigir(/uso-detalhes/.test(settings) && /uso-resumo/.test(css), 'consumo do plano não está recolhível');
exigir(/prepararSeletoresContexto/.test(app) && /oaze-select-menu/.test(css), 'menus de contexto próprios não foram ligados');
exigir(/limitarEntradasNumericas/.test(app) && /\[inputmode="decimal"\]/.test(app), 'campos de valor não têm filtro numérico');
exigir(/grid-template-columns:\s*30px minmax\(0, 1fr\)/.test(css), 'categoria ainda não reserva espaço para o ícone');
exigir(/\.pill-btn > \[data-ico\]/.test(css) && /\.notif-count\s*\{[^}]*position:\s*absolute/s.test(css),
  'ícones ou contador do cabeçalho continuam sem alinhamento explícito');

console.log('\n  acabamento final do app');
if (falhas.length) {
  falhas.forEach((f) => console.log('  FALHA  ' + f));
  process.exit(1);
}
console.log('  ok     importação, plano, seletores, valores, categorias e cabeçalho\n');
