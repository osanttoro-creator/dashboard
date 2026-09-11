/* =============================================================
   gen-fonte.js — embute as fontes da identidade como CSS base64
   ------------------------------------------------------------
   Por que embutir em base64 em vez de apontar para um .woff2:

   · o app roda em file:// e como arquivo único no iPhone. Fonte
     em arquivo separado é bloqueada por CORS em file:// na
     maioria dos navegadores — o texto cairia para a fonte do
     sistema justamente no cenário offline;
   · o build-arquivo-unico.ps1 inlina CSS, então a fonte vai
     junto sem nenhum passo extra.

   As fontes vêm de assets/vendor/fontes/ (subconjunto "latin",
   que cobre todos os acentos do português). O site público usa os
   mesmos arquivos por URL; só o app precisa do base64.

   Entram três: IBM Plex Sans (interface), Newsreader (títulos) e
   IBM Plex Mono (rótulos). O itálico da Newsreader fica de fora do
   app — ele só aparece nos títulos do site — e economiza ~190 KB.

   Uso (a partir da raiz do projeto):
     node tools/gen-fonte.js
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const pasta = path.join(raiz, 'assets', 'vendor', 'fontes');
const saida = path.join(raiz, 'assets', 'vendor', 'fonte.css');

/* unicode-range do subconjunto "latin" do Google Fonts. Fora dele o
   navegador nem baixa a fonte: setas (▲▼⇄) e símbolos (✎ 🗑 ⚙) caem
   para a fonte do sistema de propósito. */
const range = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,' +
  'U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,' +
  'U+2212,U+2215,U+FEFF,U+FFFD';

const faces = [
  { familia: 'IBM Plex Sans', estilo: 'normal', peso: '400 600', arquivo: 'ibm-plex-sans-latin.woff2' },
  { familia: 'Newsreader',    estilo: 'normal', peso: '400 600', arquivo: 'newsreader-latin.woff2' },
  { familia: 'IBM Plex Mono', estilo: 'normal', peso: '400',     arquivo: 'ibm-plex-mono-400-latin.woff2' }
];

let css = `/* =============================================================
   fonte.css — GERADO por tools/gen-fonte.js. Nao edite a mao.
   ------------------------------------------------------------
   IBM Plex Sans, Newsreader e IBM Plex Mono (SIL Open Font
   License 1.1) — subconjunto latin, embutidas em base64 para
   funcionar offline e em file://. Ver o porque no gerador.
   ============================================================= */
`;

for (const f of faces) {
  const arquivo = path.join(pasta, f.arquivo);
  if (!fs.existsSync(arquivo)) {
    console.error('Fonte nao encontrada: assets/vendor/fontes/' + f.arquivo);
    process.exit(1);
  }
  css += `@font-face {
  font-family: '${f.familia}';
  font-style: ${f.estilo};
  font-display: swap;   /* o texto aparece na hora, na fonte do sistema */
  font-weight: ${f.peso};
  src: url(data:font/woff2;base64,${fs.readFileSync(arquivo).toString('base64')}) format('woff2');
  unicode-range: ${range};
}
`;
}

fs.writeFileSync(saida, css, 'utf8');
console.log('OK - assets/vendor/fonte.css  (' + Math.round(Buffer.byteLength(css) / 1024) + ' KB)');
