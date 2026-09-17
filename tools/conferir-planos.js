/* =============================================================
   tools/conferir-planos.js — o site público não pode mentir
   -------------------------------------------------------------
   Roda com: node tools/conferir-planos.js
   Sai com código 1 quando encontra divergência — serve para CI.

   O PROBLEMA QUE ELE RESOLVE
   assets/js/planos.js é a fonte única de preço e limite DO
   APLICATIVO. As páginas públicas (index.html, precos.html) não
   carregam esse arquivo: elas precisam do preço dentro do HTML,
   porque é isso que o buscador lê e o que aparece na descrição do
   link compartilhado.

   Então o número existe em dois lugares por um motivo legítimo — e
   dois lugares divergem. Divergiram: o app anunciava um preço e a
   landing outro, e a diferença só apareceria na hora da cobrança.

   Esta ferramenta não elimina a duplicação; ela a torna
   IMPOSSÍVEL DE ESQUECER. Mudou o preço em planos.js e não mudou
   no HTML? O build quebra aqui, e não no extrato de alguém.
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

/* planos.js é um IIFE que escreve em window.Planos. Para lê-lo no
   Node basta oferecer um objeto global falso — mais honesto do que
   reimplementar um parser, que seria uma terceira fonte. */
function carregarPlanos() {
  const fonte = fs.readFileSync(path.join(RAIZ, 'assets/js/planos.js'), 'utf8');
  const janela = {};
  new Function('window', fonte)(janela);
  if (!janela.Planos) throw new Error('planos.js não expôs window.Planos');
  return janela.Planos;
}

const Planos = carregarPlanos();

const brl = (centavos) =>
  'R$ ' + (centavos / 100).toFixed(2).replace('.', ',');

const problemas = [];

function conferir(arquivo, esperado, rotulo) {
  const html = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
  if (!html.includes(esperado)) {
    problemas.push(arquivo + ': não encontrei "' + esperado + '" (' + rotulo + ')');
  }
}

/* ---- 1 · os preços aparecem, com o valor certo ---- */
for (const id of ['basic', 'pro']) {
  const p = Planos.get(id);
  const mensal = brl(p.mensalCentavos);
  const anual = brl(p.anualCentavos);
  const equivalente = brl(Planos.mensalEquivalente(p));
  const economia = brl(Planos.economiaAnual(p));

  for (const arquivo of ['index.html', 'precos.html']) {
    conferir(arquivo, mensal, id + ' mensal');
    conferir(arquivo, anual, id + ' anual');
    conferir(arquivo, equivalente, id + ' equivalente mensal do anual');
    conferir(arquivo, economia, id + ' economia anual');
  }
}

/* ---- 1a · o mesmo, nas páginas em outras línguas ----
   Desde 17/09/2026 o site vende em dólar e em euro. As páginas de
   /en, /fr e /es são geradas, mas "gerado" não quer dizer "certo": um
   erro na troca de preço publica um valor que a Stripe não vai cobrar.
   Aqui a conferência é a mesma de cima, na moeda de cada idioma. */
const MOEDA_DO_IDIOMA = { en: 'USD', fr: 'EUR', es: 'USD' };

for (const [lang, moeda] of Object.entries(MOEDA_DO_IDIOMA)) {
  for (const id of ['basic', 'pro']) {
    const p = Planos.get(id);
    const esperados = [
      [Planos.moeda(Planos.preco(p, 'monthly', moeda), moeda), 'mensal'],
      [Planos.moeda(Planos.preco(p, 'annual', moeda), moeda), 'anual'],
      [Planos.moeda(Planos.mensalEquivalente(p, moeda), moeda), 'equivalente mensal do anual'],
      [Planos.moeda(Planos.economiaAnual(p, moeda), moeda), 'economia anual']
    ];
    for (const arquivo of [lang + '/index.html', lang + '/precos.html']) {
      if (!fs.existsSync(path.join(RAIZ, arquivo))) {
        problemas.push(arquivo + ': página traduzida não existe (rode node tools/gen-idiomas.js)');
        continue;
      }
      esperados.forEach(([texto, rotulo]) => conferir(arquivo, texto, id + ' ' + rotulo + ' em ' + moeda));
      /* e nenhum preço do Brasil sobrando na página de fora */
      const html = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
      for (const real of [brl(p.mensalCentavos), brl(p.anualCentavos)]) {
        if (new RegExp(real.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\d.,])').test(html)) {
          problemas.push(arquivo + ': ainda anuncia o preço em real "' + real + '"');
        }
      }
    }
  }
}

/* ---- 1b · os dados estruturados (JSON-LD) ----
   O buscador lê o preço daqui, não do texto da página. Em 11/09/2026
   o index.html ainda anunciava Basic 14.90 e Pro 29.90 no JSON-LD,
   meses depois da troca -- e a conferência acima, que procura
   "R$ 24,90", não enxergava "24.90". */
{
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const bloco = (html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1];
  if (!bloco) {
    problemas.push('index.html: não achei o bloco JSON-LD');
  } else {
    for (const oferta of JSON.parse(bloco).offers || []) {
      const plano = Planos.LISTA.find((p) => p.nome === oferta.name);
      if (!plano) {
        problemas.push('index.html: o JSON-LD anuncia um plano que não existe: ' + oferta.name);
      } else if (oferta.price !== (plano.mensalCentavos / 100).toFixed(2)) {
        problemas.push('index.html: o JSON-LD diz ' + oferta.name + ' a ' + oferta.price +
          '; o preço vigente é ' + (plano.mensalCentavos / 100).toFixed(2));
      }
    }
  }
}

/* ---- 2 · nenhum preço ANTIGO sobrou ----
   Encontrar o preço novo não basta: o antigo pode ter ficado numa
   outra seção da mesma página. Foi assim que a tabela de
   comparação continuou anunciando o valor de antes por semanas,
   com o cartão do plano já correto logo acima. */
const PRECOS_APOSENTADOS = [
  'R$ 14,90', 'R$ 149,90', 'R$ 12,49', 'R$ 28,90',
  'R$ 29,90', 'R$ 299,90', 'R$ 24,99',
  'R$ 178,80', 'R$ 358,80',
  // v2 (24,90 e 49,90), aposentada em 13/09/2026
  'R$ 24,90', 'R$ 239,90', 'R$ 19,99', 'R$ 49,90', 'R$ 479,90', 'R$ 39,99', 'R$ 118,90'
];

for (const arquivo of ['index.html', 'precos.html']) {
  const html = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
  for (const velho of PRECOS_APOSENTADOS) {
    /* Um preço aposentado pode voltar a ser válido: se o Pro passar
       a custar R$ 29,90 de novo, ele sai desta lista. Por isso a
       comparação é contra os preços VIGENTES, e não cega. */
    const vigente = Planos.LISTA.some((p) =>
      brl(p.mensalCentavos) === velho || brl(p.anualCentavos) === velho ||
      brl(Planos.mensalEquivalente(p)) === velho || brl(Planos.economiaAnual(p)) === velho);
    if (vigente) continue;
    if (html.includes(velho)) {
      problemas.push(arquivo + ': ainda contém o preço aposentado "' + velho + '"');
    }
  }
}

/* ---- 3 · os limites anunciados batem com o catálogo ---- */
const LIMITES_NA_TABELA = [
  { chave: 'ai_queries_per_month', rotulo: 'consultas ao UGLEZ' },
  { chave: 'accounts', rotulo: 'contas' },
  { chave: 'credit_cards', rotulo: 'cartões' },
  { chave: 'workspaces', rotulo: 'espaços financeiros' }
];

const precos = fs.readFileSync(path.join(RAIZ, 'precos.html'), 'utf8');
for (const { chave, rotulo } of LIMITES_NA_TABELA) {
  for (const p of Planos.LISTA) {
    const v = p.limites[chave];
    if (v === null) continue;                 // "Ilimitado" é texto, não número
    if (!new RegExp('>\\s*' + v + '\\s*<').test(precos)) {
      problemas.push('precos.html: não achei o limite ' + v + ' (' + rotulo + ' do ' + p.nome + ')');
    }
  }
}

/* ---- 4 · o selo de desconto do ciclo anual ----
   Ele é um arredondamento e por isso escapa da conferência de
   preço: os valores podiam estar todos certos com o selo ainda
   dizendo −16%, que era o desconto da tabela anterior. Um selo
   errado no botão é a primeira coisa que a pessoa lê.

   ARREDONDA PARA BAIXO, e é o MENOR desconto entre os planos. O
   selo vale para os dois botões ao mesmo tempo, então prometer o
   desconto do plano melhor seria prometer a mais para quem escolhe
   o outro. 19,7% vira "19%": entregar um pouco mais do que o
   anunciado é o único lado seguro de errar num número de venda. */
{
  const descontos = Planos.LISTA
    .filter((p) => p.mensalCentavos > 0)
    .map((p) => Planos.economiaAnual(p) / (p.mensalCentavos * 12));
  const menor = Math.floor(Math.min.apply(null, descontos) * 100);
  for (const arquivo of ['index.html', 'precos.html']) {
    const html = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
    const achado = (html.match(/class="economia">[^\d]*(\d+)%/) || [])[1];
    if (achado !== String(menor)) {
      problemas.push(arquivo + ': o selo do anual diz ' + achado + '% e o desconto real é ' + menor + '%');
    }
  }

  /* O mesmo selo, nas páginas de fora, onde o desconto anual é outro. */
  for (const [lang, moeda] of Object.entries(MOEDA_DO_IDIOMA)) {
    const fora = Planos.LISTA
      .filter((p) => Planos.preco(p, 'monthly', moeda) > 0)
      .map((p) => Planos.economiaAnual(p, moeda) / (Planos.preco(p, 'monthly', moeda) * 12));
    const menorFora = Math.floor(Math.min.apply(null, fora) * 100);
    for (const arquivo of [lang + '/index.html', lang + '/precos.html']) {
      const caminho = path.join(RAIZ, arquivo);
      if (!fs.existsSync(caminho)) continue;        // já reclamado acima
      const achado = (fs.readFileSync(caminho, 'utf8').match(/class="economia">[^\d]*(\d+)%/) || [])[1];
      if (achado !== String(menorFora)) {
        problemas.push(arquivo + ': o selo do anual diz ' + achado + '% e o desconto em ' + moeda + ' é ' + menorFora + '%');
      }
    }
  }
}

if (!problemas.length) {
  console.log('OK — site público e planos.js dizem a mesma coisa.');
  process.exit(0);
}

console.log('Divergências entre o site público e planos.js (' + problemas.length + '):\n');
problemas.forEach((p) => console.log('  · ' + p));
process.exit(1);
