/* =============================================================
   tools/auditar-cliques.js — nenhum botão sem ação
   -------------------------------------------------------------
   Roda com: node tools/auditar-cliques.js
   Sai com código 1 quando encontra algo — serve para CI.

   O QUE ELE PROCURA
   Todo <button> e <a> das páginas do projeto que não tenha
   NENHUMA das formas conhecidas de ter ação:

     · href de verdade (e não "#", que não leva a lugar nenhum)
     · um data-* que a delegação de eventos escuta
     · onclick inline
     · um id citado em algum arquivo .js

   O QUE ELE NÃO PROVA
   Que a ação FUNCIONA. Um id citado num addEventListener que
   nunca roda continua passando aqui. Isto é uma rede contra o
   descuido comum — botão colado no HTML e esquecido —, não uma
   verificação de comportamento; para isso, o navegador.

   FALSO POSITIVO É PIOR QUE FALSO NEGATIVO NESTE TIPO DE ferramenta:
   uma lista que grita por engano é uma lista que ninguém lê. Por
   isso as classes com comportamento por delegação (nav-item,
   topnav-trigger, fab-item...) são reconhecidas explicitamente.
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

/* A lista de gerados existia por causa do financas.html, o build de
   arquivo único. Ele saiu do repositório, e com ele a exceção --
   toda página aqui é fonte. Se algum dia voltar a haver artefato
   gerado na raiz, ele precisa ser excluído daqui: JavaScript
   minificado produz dezenas de falsos positivos, porque expressões
   como "for(o=0;o<a;++o)" casam com a busca por tags. */
const PAGINAS = fs.readdirSync(RAIZ).filter((f) => f.endsWith('.html'));

const FONTES = ['assets/js', 'assets/js/pages']
  .flatMap((d) => fs.readdirSync(path.join(RAIZ, d))
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join(RAIZ, d, f)))
  .map((f) => fs.readFileSync(f, 'utf8'))
  .join('\n');

/* data-* que o projeto trata por delegação. Cada um destes é
   escutado num document.addEventListener, então o elemento não
   precisa de id nem de ouvinte próprio. */
const DADOS_COM_ACAO = [
  'page', 'goto', 'quick', 'newcat', 'ciclo', 'tab', 'rectab',
  'method', 'close-search', 'close-modal', 'ai-q', 'novo'
];

/* Classes cujo comportamento é ligado em lote, pelo seletor. */
const CLASSES_COM_ACAO = [
  'nav-item', 'topnav-trigger', 'topnav-brand', 'brand', 'pill-ico',
  'fab-item', 'fab', 'pop-item', 'ciclo-btn', 'tab', 'icon-btn',
  'ai-chip', 'seg', 'hamburguer'
];

function temDataComAcao(tag) {
  return DADOS_COM_ACAO.some((d) => tag.includes('data-' + d + '='));
}

function temClasseComAcao(tag) {
  const m = tag.match(/class="([^"]+)"/);
  if (!m) return false;
  const classes = m[1].split(/\s+/);
  return CLASSES_COM_ACAO.some((c) => classes.includes(c));
}

function idCitadoNoJs(id) {
  return FONTES.includes("'" + id + "'") || FONTES.includes('"' + id + '"');
}

const achados = [];

for (const pagina of PAGINAS) {
  const bruto = fs.readFileSync(path.join(RAIZ, pagina), 'utf8');
  const scriptInline = (bruto.match(/<script\b[^>]*>([\s\S]*?)<\/script>/g) || []).join('\n');

  /* Comentários fora, ANTES de procurar tags. Este arquivo comenta
     muito, e um comentário que menciona "<a>" ao explicar por que
     um item é link virava um achado — a ferramenta acusando a
     documentação da própria decisão que ela deveria aprovar. */
  const html = bruto.replace(/<!--[\s\S]*?-->/g, '');

  const tags = html.match(/<(?:button|a)\b[^>]*>/g) || [];
  for (const tag of tags) {
    if (/onclick=/.test(tag)) continue;
    if (temDataComAcao(tag)) continue;

    const href = (tag.match(/href="([^"]*)"/) || [])[1];
    if (href !== undefined) {
      /* href="#" e href="" são links que não levam a lugar
         nenhum — exatamente o que o brief manda eliminar. */
      if (href && href !== '#') continue;
      achados.push({ pagina, tag: tag.slice(0, 120), motivo: 'href vazio ou "#"' });
      continue;
    }

    const id = (tag.match(/id="([^"]+)"/) || [])[1];
    if (id && (idCitadoNoJs(id) || scriptInline.includes(id))) continue;
    if (!id && temClasseComAcao(tag)) continue;
    if (id && temClasseComAcao(tag)) continue;

    /* Botão de submit dentro de <form> tem ação: o próprio envio. */
    if (/type="submit"/.test(tag)) continue;

    achados.push({
      pagina,
      tag: tag.slice(0, 120),
      motivo: id ? 'id "' + id + '" não aparece em nenhum .js' : 'sem id, sem href, sem data-*'
    });
  }
}

if (!achados.length) {
  console.log('OK — nenhum botão ou link sem ação em ' + PAGINAS.length + ' páginas.');
  process.exit(0);
}

console.log('Clicáveis sem ação (' + achados.length + '):\n');
for (const a of achados) {
  console.log('  ' + a.pagina + '  [' + a.motivo + ']');
  console.log('    ' + a.tag + '\n');
}
process.exit(1);
