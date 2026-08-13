/* =============================================================
   gen-fonte.js — vendoriza a Inter como CSS com a fonte embutida
   ------------------------------------------------------------
   Por que embutir em base64 em vez de apontar para um .woff2:

   · o app roda em file:// e como arquivo único no iPhone. Fonte
     em arquivo separado é bloqueada por CORS em file:// na
     maioria dos navegadores — o texto cairia para a fonte do
     sistema justamente no cenário offline;
   · o build-arquivo-unico.ps1 inlina CSS, então a fonte vai
     junto sem nenhum passo extra.

   Custo: ~63 KB de base64 (47 KB de woff2). É o subconjunto
   "latin", que cobre todos os acentos do português.

   Uso (a partir da raiz do projeto):
     npm --prefix tools install
     node tools/gen-fonte.js
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const fonte = path.join(__dirname, 'node_modules', '@fontsource-variable', 'inter',
  'files', 'inter-latin-wght-normal.woff2');
const saida = path.join(raiz, 'assets', 'vendor', 'fonte.css');

if (!fs.existsSync(fonte)) {
  console.error('Fonte nao encontrada. Rode antes:  npm --prefix tools install');
  process.exit(1);
}

const b64 = fs.readFileSync(fonte).toString('base64');

/* unicode-range do subconjunto "latin" do Google Fonts. Fora dele o
   navegador nem baixa a fonte: setas (▲▼⇄) e símbolos (✎ 🗑 ⚙) caem
   para a fonte do sistema de propósito — a Inter não os tem. */
const range = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,' +
  'U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,' +
  'U+2212,U+2215,U+FEFF,U+FFFD';

const css = `/* =============================================================
   fonte.css — GERADO por tools/gen-fonte.js. Nao edite a mao.
   ------------------------------------------------------------
   Inter Variable (SIL Open Font License 1.1) — subconjunto latin,
   eixo de peso 100-900, embutida em base64 para funcionar offline
   e em file://. Ver o porque no cabecalho do gerador.
   ============================================================= */
@font-face {
  font-family: 'Inter Variable';
  font-style: normal;
  font-display: swap;   /* o texto aparece na hora, na fonte do sistema */
  font-weight: 100 900;
  src: url(data:font/woff2;base64,${b64}) format('woff2');
  unicode-range: ${range};
}
`;

fs.mkdirSync(path.dirname(saida), { recursive: true });
fs.writeFileSync(saida, css, 'utf8');
console.log('OK - assets/vendor/fonte.css  (' + Math.round(Buffer.byteLength(css) / 1024) + ' KB)');
