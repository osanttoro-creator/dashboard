/* =============================================================
   tools/idiomas-preencher.js — grava traduções num dicionário
   -------------------------------------------------------------
     node tools/idiomas-preencher.js <pagina> <arquivo-de-traducoes.json>

   O arquivo de traduções é uma lista na MESMA ORDEM do dicionário
   da página: [ ["começo do pt", "en", "fr", "es"], ... ].
   O "começo do pt" é uma trava: se a lista escorregar uma linha, a
   gravação para em vez de pôr a tradução de um trecho no outro.
   ============================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const [pagina, arquivo] = process.argv.slice(2);
const dicPath = path.join(__dirname, '..', 'i18n', 'site', pagina + '.json');
const dic = JSON.parse(fs.readFileSync(dicPath, 'utf8'));
const trad = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

if (trad.length !== dic.length) {
  console.error(pagina + ': o dicionário tem ' + dic.length + ' trechos e vieram ' + trad.length + ' traduções.');
  process.exit(1);
}
trad.forEach((t, i) => {
  if (!norm(dic[i].pt).startsWith(norm(t[0]))) {
    console.error(pagina + ' #' + i + ': a trava "' + t[0] + '" não bate com "' + dic[i].pt.slice(0, 60) + '"');
    process.exit(1);
  }
  dic[i].en = t[1]; dic[i].fr = t[2]; dic[i].es = t[3];
});
fs.writeFileSync(dicPath, JSON.stringify(dic, null, 1) + '\n');
console.log(pagina + ': ' + trad.length + ' trechos gravados.');
