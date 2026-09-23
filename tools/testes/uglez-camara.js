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
const flutuante = ler('assets', 'js', 'uglez-flutuante.js');
const estadoSync = ler('assets', 'js', 'estado-sync.js');
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
/* ------------------------------------------------------------
   A GEOMETRIA DO CELULAR MORA NUM LUGAR SÓ
   ------------------------------------------------------------
   Esta rota já teve TRÊS passes de celular em pontos diferentes do
   style.css, e eles se desfaziam: um compactava o cabeçalho, o
   seguinte devolvia busca e avisos ("volta a ter o cabeçalho
   completo do app"), um terceiro fixava a faixa de identidade por
   cima do valor que valia com a conversa aberta. Medido num 390×844
   real, sobravam 248px de conversa — menos de um terço da tela.

   O contrato agora é: UMA seção (27.13, no fim do style.css) decide
   a altura da faixa, e o cabeçalho do app cabe em uma linha nesta
   rota. Os números ficam fixados aqui porque cada pixel que eles
   crescem sai da conversa — mudá-los sem medir o que resta é
   exatamente o erro que este teste existe para pegar. */
/* No celular a faixa de identidade NÃO existe mais: o console ocupa
   a peça inteira e a marca é o orbe de 24px do cabeçalho. Se a faixa
   voltar, volta com ela o hemisfério que comia metade da conversa. */
if (!/@media\s*\(max-width:\s*820px\)[\s\S]*?\.uglez-presenca\s*\{\s*display:\s*none/.test(css)) {
  falhas.push('a faixa de identidade voltou ao celular');
}
if (!/@media\s*\(max-width:\s*820px\)[\s\S]*?\.uglez-stage\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)/.test(css)) {
  falhas.push('o console não ocupa a peça inteira no celular');
}
/* A presença precisa continuar existindo em ALGUM lugar: sem o
   hemisfério, o orbe é a única marca da UGLEZ na tela. */
if (!/\.uglez-orbe\s*\{/.test(css) || !/id="uglezOrbe"/.test(html)) {
  falhas.push('a presença de 24px (orbe) sumiu do cabeçalho');
}
/* Uma decisão, um controle: o alcance mora na folha, e não também
   num segundo seletor no cabeçalho. */
if (/id="uglezEscopo"/.test(html)) {
  falhas.push('voltou um segundo seletor de alcance ao cabeçalho');
}
if (!/id="uglezFolha"/.test(html) || !/id="btnUglezContexto"/.test(html)) {
  falhas.push('a linha de contexto ou a folha do alcance sumiram');
}
/* A tira de números é o retrato do que foi enviado, e vem do Calc —
   nunca do texto do modelo. */
if (!/uglez-numeros/.test(css) || !/uglez-numeros/.test(pagina)) {
  falhas.push('a tira do que foi lido sumiu da resposta');
}
if (!/matchMedia\('\(max-width: 820px\)'\)/.test(pagina) || !/noCelular\(\)/.test(pagina)) {
  falhas.push('a esfera WebGL voltou a ser montada no celular');
}
if (!/body\[data-page="uglez"\]\s*\.topnav-brand[^{]*#btnNotif\s*\{\s*display:\s*none/.test(css)) {
  falhas.push('o cabeçalho do app voltou a ocupar duas linhas na câmara');
}
if (/#btnNotif\s*\{\s*display:\s*inline-flex/.test(css)) {
  falhas.push('um segundo passe está devolvendo busca e avisos ao cabeçalho');
}
if (!/body\[data-page="uglez"\]\s+\.aviso-conta\s*\{\s*display:\s*none\s*!important/.test(css)) {
  falhas.push('o aviso de conta voltou a ocupar a conversa no celular');
}
/* O envelope da segunda frase precisa existir no JS: sem ele o CSS
   acima só poderia esconder o parágrafo inteiro, e sobrariam dois
   botões sem dizer do que se tratam. */
if (!/aviso-conta-detalhe/.test(estadoSync)) {
  falhas.push('a segunda frase do aviso de conta perdeu o envelope próprio');
}
if (!/page\s*!==\s*['"]uglez['"]/.test(flutuante) ||
    !/body\[data-page=["']uglez["']\]\s+\.uglez-flut\s*\{\s*display:\s*none\s*!important/.test(css)) {
  falhas.push('o botão flutuante do UGLEZ ainda pode aparecer dentro da própria UGLEZ');
}
if (!/\.uglez-cartoes\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s.test(css) ||
    !/\.uglez-cartao\s*\{[^}]*grid-template-columns:\s*28px minmax\(0,\s*1fr\)/s.test(css) ||
    !/\.uglez-cartao-s\s*\{\s*display:\s*none/s.test(css) ||
    !/\.uglez-campo-texto\s*\{[^}]*font-size:\s*16px/s.test(css)) {
  falhas.push('a conversa não está compactada e protegida contra zoom no celular');
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
