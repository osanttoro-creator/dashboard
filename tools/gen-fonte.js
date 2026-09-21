/* =============================================================
   gen-fonte.js — as fontes da identidade para o app
   ------------------------------------------------------------
   ATÉ 21/09/2026 este gerador embutia as fontes em base64 dentro
   do CSS, pelo motivo abaixo:

     · o app precisa funcionar aberto em file://, e fonte em
       arquivo separado é bloqueada por CORS nesse esquema na
       maioria dos navegadores.

   O motivo caducou. O app.html usa caminhos absolutos (/assets/…)
   e carrega o Supabase por CDN: aberto em file:// ele já não
   funciona, com ou sem fonte. E o preço do base64 ficou alto:

     · o fonte.css tinha 190 KB comprimidos e bloqueava a primeira
       pintura. Medido num 4G lento (1,6 Mbps, processador 4×), o
       app levava 7,5 SEGUNDOS para pintar alguma coisa;
     · a fonte embutida não é cacheada à parte: cada mudança no
       CSS obrigava a baixar as três fontes de novo;
     · o site público já usa os MESMOS .woff2 por URL. Quem chegava
       pela página de vendas baixava as fontes duas vezes.

   Agora o gerador escreve @font-face apontando para os .woff2 —
   o CSS cai para ~1 KB, as fontes baixam em paralelo, ficam em
   cache por sete dias e são compartilhadas com o site.

   As fontes vêm de assets/vendor/fontes/ (subconjunto "latin",
   que cobre todos os acentos do português). O itálico da
   Newsreader continua de fora do app: ele só aparece nos títulos
   do site.

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
   License 1.1) — subconjunto latin, por URL. Ate 21/09/2026 eram
   embutidas em base64 (190 KB bloqueando a primeira pintura);
   o porque da mudanca esta no gerador.
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
  src: url('/assets/vendor/fontes/${f.arquivo}') format('woff2');
  unicode-range: ${range};
}
`;
}

fs.writeFileSync(saida, css, 'utf8');
console.log('OK - assets/vendor/fonte.css  (' + (Buffer.byteLength(css) / 1024).toFixed(1) + ' KB)');
