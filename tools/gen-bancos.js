/* =============================================================
   gen-bancos.js — vendoriza @edusites/bancos-brasil
   ------------------------------------------------------------
   Por que vendorizar em vez de importar o pacote:
   o app roda como HTML solto (file://) e como arquivo único no
   iPhone. Não há bundler nem CDN em runtime. Este script lê o
   pacote instalado e cospe um script clássico que expõe
   window.BancosBR = { ICONES, PRESETS }.

   Uso (a partir da raiz do projeto):
     npm --prefix tools install
     node tools/gen-bancos.js
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const pkg = path.join(__dirname, 'node_modules', '@edusites', 'bancos-brasil', 'src');
const saida = path.join(raiz, 'assets', 'vendor', 'bancos.js');

if (!fs.existsSync(pkg)) {
  console.error('Pacote nao encontrado. Rode antes:  npm --prefix tools install');
  process.exit(1);
}

const src = (f) => fs.readFileSync(path.join(pkg, f), 'utf8');

/* Os arquivos são ESM. Em vez de transpilar, extraímos os dois
   objetos literais que interessam — é o que o app consome. */
function objetoLiteral(texto, abertura) {
  const i = texto.indexOf(abertura);
  if (i < 0) throw new Error('Nao achei: ' + abertura);
  const inicio = texto.indexOf('{', i);
  let nivel = 0, dentro = null, escape = false;
  for (let j = inicio; j < texto.length; j++) {
    const ch = texto[j];
    if (dentro) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === dentro) dentro = null;
      continue;
    }
    if (ch === '`' || ch === '"' || ch === "'") { dentro = ch; continue; }
    if (ch === '{') nivel++;
    else if (ch === '}') { nivel--; if (nivel === 0) return texto.slice(inicio, j + 1); }
  }
  throw new Error('Objeto nao fechado: ' + abertura);
}

const icones = objetoLiteral(src('icones.js'), 'export const ICONES');
const presets = objetoLiteral(src('core.js'), 'const PRESETS');

/* Cada ícone vem com fill="none" no <svg> e paths sem fill próprio:
   a cor é aplicada pelo app. Guardamos só viewBox + miolo, que é
   o que precisamos para montar o <svg> em runtime. */
const cabecalho = `/* =============================================================
   bancos.js — GERADO por tools/gen-bancos.js. Nao edite a mao.
   ------------------------------------------------------------
   Fonte: @edusites/bancos-brasil (MIT) — https://lecdt.com/libs/bancos-brasil
   Silhuetas monocromaticas + a cor de marca de cada banco.
   ============================================================= */
(function (global) {
  'use strict';
  var ICONES = `;

const rodape = `;
  global.BancosBR = { ICONES: ICONES, PRESETS: PRESETS };
})(window);
`;

const conteudo = cabecalho + icones + ';\n  var PRESETS = ' + presets + rodape;
fs.mkdirSync(path.dirname(saida), { recursive: true });
fs.writeFileSync(saida, conteudo, 'utf8');

const n = (icones.match(/^\s{2}[a-z0-9_]+:/gm) || []).length;
console.log('OK - assets/vendor/bancos.js  (' + n + ' bancos, ' +
  Math.round(Buffer.byteLength(conteudo) / 1024) + ' KB)');
