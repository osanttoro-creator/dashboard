/* =============================================================
   tools/idiomas-preencher.js — grava traduções num dicionário
   -------------------------------------------------------------
     node tools/idiomas-preencher.js <pagina> <arquivo-de-traducoes.json>

   DOIS FORMATOS, E O SEGUNDO EXISTE POR NECESSIDADE.

   1 · LISTA, na MESMA ORDEM do dicionário da página:
       [ ["começo do pt", "en", "fr", "es"], ... ]
       O "começo do pt" é uma trava: se a lista escorregar uma linha,
       a gravação para em vez de pôr a tradução de um trecho no
       outro. É o formato de quando se traduz a página inteira.

   2 · MAPA, por texto: { "pt exato": ["en", "fr", "es"] }
       Quando a página ganha três frases novas, a lista obriga a
       reescrever as outras 139 só para chegar até elas — e cada
       reescrita é uma chance de deslocar uma linha. O mapa casa pelo
       TEXTO: não depende de ordem, não toca em quem já está
       traduzido e falha alto se um texto não existir mais, que é
       exatamente o aviso de que a frase mudou no HTML.
   ============================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const [pagina, arquivo] = process.argv.slice(2);
if (!pagina || !arquivo) {
  console.error('uso: node tools/idiomas-preencher.js <pagina> <traducoes.json>');
  process.exit(1);
}
const dicPath = path.join(__dirname, '..', 'i18n', 'site', pagina + '.json');
const dic = JSON.parse(fs.readFileSync(dicPath, 'utf8'));
const trad = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

if (Array.isArray(trad)) {
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
} else {
  const porTexto = new Map(dic.map((e) => [norm(e.pt), e]));
  let gravados = 0;
  for (const [pt, linguas] of Object.entries(trad)) {
    const alvo = porTexto.get(norm(pt));
    if (!alvo) {
      console.error(pagina + ': não existe no dicionário — "' + pt.slice(0, 70) + '"');
      process.exit(1);
    }
    alvo.en = linguas[0]; alvo.fr = linguas[1]; alvo.es = linguas[2];
    gravados++;
  }
  fs.writeFileSync(dicPath, JSON.stringify(dic, null, 1) + '\n');
  console.log(pagina + ': ' + gravados + ' trecho(s) gravado(s) por texto.');
}
