/* =============================================================
   uglez-camara.js — contrato da experiência UGLEZ
   -------------------------------------------------------------
   Mantém a peça visual ligada ao produto: os dados e os estados
   precisam existir em texto, WebGL precisa ter fallback e o layout
   precisa continuar explícito para desktop e celular.
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..');
const ler = (...partes) => fs.readFileSync(path.join(RAIZ, ...partes), 'utf8');
const html = ler('app.html');
const css = ler('assets', 'css', 'style.css');
const pagina = ler('assets', 'js', 'pages', 'uglez.js');
const erosao = ler('assets', 'js', 'uglez-erosao.js');
const falhas = [];

const ids = [
  'uglezFormacao', 'uglezMesOrbita', 'uglezMovimentos', 'uglezFonteLocal',
  'uglezPeriodo', 'uglezEstadoTexto', 'uglezHistorico', 'aiQuestion', 'btnAiAsk'
];
ids.forEach((id) => {
  const qtd = (html.match(new RegExp(`id=["']${id}["']`, 'g')) || []).length;
  if (qtd !== 1) falhas.push(`#${id} aparece ${qtd} vez(es), deveria aparecer uma`);
});

const posParticulas = html.indexOf('/assets/js/uglez-particulas.js');
const posErosao = html.indexOf('/assets/js/uglez-erosao.js');
const posPagina = html.indexOf('/assets/js/pages/uglez.js');
if (!(posParticulas >= 0 && posParticulas < posErosao && posErosao < posPagina)) {
  falhas.push('scripts do UGLEZ não carregam na ordem fallback → WebGL → página');
}
if (!/UglezErosao\.montar\(caixa\)/.test(pagina)) falhas.push('página não monta a esfera WebGL');
if (!/UglezParticulas\.montar\(caixa/.test(pagina)) falhas.push('página perdeu o fallback 2D');
if (!/repouso:\s*'Pronto para analisar'/.test(pagina)) falhas.push('estado de repouso não tem texto acessível');
if (!/global\.UglezErosao\s*=\s*E/.test(erosao)) falhas.push('módulo WebGL não é exposto');
if (!/prefers-reduced-motion:\s*reduce/.test(erosao)) falhas.push('WebGL ignora movimento reduzido');
if (!/body\[data-page="uglez"\]\s+\.page-head\s*\{\s*display:\s*none/.test(css)) {
  falhas.push('câmara não assume o primeiro plano na rota UGLEZ');
}
if (!/@media\s*\(max-width:\s*700px\)[\s\S]*?\.uglez-stage\s*\{[^}]*border-radius/.test(css)) {
  falhas.push('layout móvel da câmara não está declarado');
}
if (/(?:purple|violet|magenta|#8b5cf6|#7c3aed|#9333ea)/i.test(
  css.slice(css.indexOf('UGLEZ — câmara de análise'), css.indexOf('IDENTIFICAÇÃO DOS CONTROLES'))
)) {
  falhas.push('a câmara introduziu roxo e rompeu a paleta do OAZE');
}

if (falhas.length) {
  console.error('Contrato visual do UGLEZ quebrado:');
  falhas.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}

console.log('OK — UGLEZ mantém estados acessíveis, fallback e layout responsivo.');
