/* =============================================================
   uglez-camara.js — contrato da experiência UGLEZ
   -------------------------------------------------------------
   Mantém a peça visual ligada ao produto: os dados e os estados
   precisam existir em texto, WebGL precisa ter fallback e o layout
   precisa continuar explícito para desktop e celular, sempre dentro
   de uma única tela e sem uma segunda seção abaixo da câmara.
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
if (!/body\[data-page="uglez"\]\s*\{[^}]*height:\s*100dvh[^}]*overflow:\s*hidden/.test(css)) {
  falhas.push('rota UGLEZ não bloqueia a rolagem da página');
}
if (!/\.uglez-page\s*\{[^}]*height:\s*100%[^}]*overflow:\s*hidden/.test(css)) {
  falhas.push('câmara UGLEZ não ocupa somente a área disponível');
}
/* A faixa do topo no celular era de 132px e passou a 104px em
   20/09/2026. Na tela de 390×844 sobravam 162px de conversa — menos
   que uma pergunta e uma resposta curta — porque a maior parte da
   altura estava no cabeçalho. O número continua fixado aqui de
   propósito: ele é o que sobra para a conversa, e mudá-lo sem medir
   o que resta é exatamente o erro que este teste existe para pegar. */
if (!/@media\s*\(max-width:\s*820px\)[\s\S]*?\.uglez-stage\s*\{[^}]*grid-template-rows:\s*104px\s+minmax\(0,\s*1fr\)/.test(css)) {
  falhas.push('layout móvel da câmara não está declarado');
}
if (/id=["']uglez(?:Leitura|Insights)["']/.test(html)) {
  falhas.push('uma seção de sinais ainda existe abaixo da câmara');
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

console.log('OK — UGLEZ mantém estados, fallback e experiência responsiva em tela única.');
