/* =============================================================
   tools/gen-idiomas.js — o site público em inglês, francês e espanhol
   -------------------------------------------------------------
     node tools/gen-idiomas.js            gera en/, fr/ e es/
     node tools/gen-idiomas.js --extrair  atualiza os dicionários
     node tools/gen-idiomas.js --conferir sai com 1 se faltar tradução
                                          ou se o gerado estiver velho

   O PORTUGUÊS É A FONTE. As páginas em pt-BR continuam sendo
   escritas à mão, na raiz, como sempre. As outras línguas NÃO são
   editadas: são geradas a partir delas, trocando cada trecho de
   texto pela tradução que está em i18n/site/<pagina>.json.

   Por que gerar em vez de copiar e traduzir à mão: três cópias de
   cada página divergem na primeira correção de preço. Aqui, mudou um
   texto em português, o --conferir falha dizendo qual trecho ficou
   sem tradução — e o deploy não sai com a página meio traduzida.

   O QUE É UM "TRECHO"
   O menor bloco que contém texto corrido: um <p>, um <h2>, um <li>.
   Etiquetas de ênfase dentro dele (<em>, <strong>, <a>, <br>) vão
   junto na chave e na tradução, porque a ordem das palavras muda de
   uma língua para outra e a ênfase precisa acompanhar. Ícones <svg>
   viram marcadores ⟦s0⟧ na chave — o desenho não se traduz.
   Atributos que alguém lê também entram: alt, title, aria-label,
   placeholder, data-dica e o content das metas de descrição.
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const DIC = path.join(RAIZ, 'i18n', 'site');
const SITE = 'https://oaze.site';

const IDIOMAS = {
  en: { html: 'en', og: 'en_US', nome: 'English' },
  fr: { html: 'fr', og: 'fr_FR', nome: 'Français' },
  es: { html: 'es', og: 'es_ES', nome: 'Español' }
};

/* página → caminho público (sem .html) */
const PAGINAS = {
  'index.html': '/',
  'recursos.html': '/recursos',
  'precos.html': '/precos',
  'suporte.html': '/suporte',
  'termos.html': '/termos',
  'privacidade.html': '/privacidade',
  'entrar.html': '/entrar',
  'cadastro.html': '/cadastro',
  'recuperar-senha.html': '/recuperar-senha',
  'redefinir-senha.html': '/redefinir-senha',
  'confirmar-email.html': '/confirmar-email',
  '404.html': null
};
const ROTAS = Object.values(PAGINAS).filter(Boolean);

/* ---------------------------------------------------------------
   1 · um analisador de HTML pequeno e literal
   ---------------------------------------------------------------
   O HTML do site é escrito à mão e bem formado; um parser completo
   seria dependência sem necessidade. Este guarda as posições de cada
   nó no texto original, para trocar só o trecho e deixar o resto do
   arquivo byte a byte igual. */
const VAZIOS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'use', 'stop']);
const CRUS = new Set(['script', 'style']);
const INLINE = new Set(['a', 'em', 'strong', 'b', 'i', 'span', 'br', 'small', 'sup', 'sub', 'time', 'abbr', 'code', 's', 'u', 'mark', 'svg', 'kbd', 'wbr', 'data', 'q', 'cite', 'bdi']);
const IGNORAR = new Set(['script', 'style', 'svg', 'noscript', 'template', 'code', 'pre']);
const ATRIBUTOS = ['alt', 'title', 'aria-label', 'placeholder', 'data-dica'];

function analisar(html) {
  const raiz = { tag: '#raiz', filhos: [], ini: 0, fimIni: 0 };
  const pilha = [raiz];
  const re = /<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
  let m, ultimo = 0;
  const texto = (a, b) => { if (b > a) pilha[pilha.length - 1].filhos.push({ tag: '#texto', ini: a, fim: b }); };
  while ((m = re.exec(html))) {
    texto(ultimo, m.index);
    ultimo = re.lastIndex;
    if (m[0].startsWith('<!')) continue;
    if (m[1]) {                                   // fechamento
      const tag = m[1].toLowerCase();
      for (let k = pilha.length - 1; k > 0; k--) {
        if (pilha[k].tag === tag) {
          pilha[k].fimIni = m.index; pilha[k].fim = re.lastIndex;
          pilha.length = k;
          break;
        }
      }
      continue;
    }
    const tag = m[2].toLowerCase();
    const no = { tag, attrs: m[3] || '', ini: m.index, abreFim: re.lastIndex, filhos: [] };
    pilha[pilha.length - 1].filhos.push(no);
    if (m[4] === '/' || VAZIOS.has(tag)) { no.fim = no.abreFim; no.fimIni = no.abreFim; continue; }
    if (CRUS.has(tag)) {
      const fecha = html.toLowerCase().indexOf('</' + tag, re.lastIndex);
      no.fimIni = fecha; no.fim = html.indexOf('>', fecha) + 1;
      re.lastIndex = no.fim; ultimo = no.fim;
      continue;
    }
    pilha.push(no);
  }
  texto(ultimo, html.length);
  return raiz;
}

const temTexto = (s) => /[A-Za-zÀ-ÿ]/.test(s.replace(/&[a-z]+;|&#\d+;/gi, ''));

/** O elemento só tem texto e etiquetas de linha dentro? */
function soLinha(no) {
  return no.filhos.every((f) => f.tag === '#texto' || (INLINE.has(f.tag) && (f.tag === 'svg' || soLinha(f))));
}
/** Tem texto de verdade fora de ícones? */
function textoDireto(no, html) {
  return no.filhos.some((f) => (f.tag === '#texto' && temTexto(html.slice(f.ini, f.fim)))
    || (INLINE.has(f.tag) && f.tag !== 'svg' && textoDireto(f, html)));
}

/* ---------------------------------------------------------------
   2 · chaves: normalização e marcadores de ícone
   --------------------------------------------------------------- */
function paraChave(bruto) {
  const svgs = [];
  const chave = bruto
    .replace(/<svg[\s\S]*?<\/svg>/gi, (s) => { svgs.push(s); return '⟦s' + (svgs.length - 1) + '⟧'; })
    .replace(/\s+/g, ' ').trim();
  return { chave, svgs };
}

/* ---------------------------------------------------------------
   3 · coleta de trechos de uma página
   --------------------------------------------------------------- */
function trechos(html) {
  const out = [];          // { tipo: 'bloco'|'texto'|'attr'|'meta'|'title', ini, fim, bruto }
  const arvore = analisar(html);

  function atributos(no) {
    const re = /\s([^\s=>\/]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let a;
    const base = no.ini + 1 + no.tag.length;
    while ((a = re.exec(no.attrs))) {
      const nome = a[1].toLowerCase();
      const valor = a[3] !== undefined ? a[3] : a[4];
      let traduzivel = ATRIBUTOS.includes(nome);
      if (no.tag === 'meta' && nome === 'content') {
        traduzivel = /name="(description|twitter:title|twitter:description)"|property="og:(title|description|image:alt)"|name="apple-mobile-web-app-title"/.test(no.attrs)
          && !/apple-mobile/.test(no.attrs);
      }
      if (no.tag === 'input' && nome === 'value') traduzivel = /type="(submit|button)"/.test(no.attrs);
      if (!traduzivel || !temTexto(valor)) continue;
      const iniValor = base + a.index + a[0].indexOf(a[2]) + 1;
      out.push({ tipo: 'attr', ini: iniValor, fim: iniValor + valor.length, bruto: valor });
    }
  }

  function andar(no, dentroDeBloco) {
    for (const f of no.filhos) {
      if (f.tag === '#texto') {
        const t = html.slice(f.ini, f.fim);
        if (!dentroDeBloco && temTexto(t)) out.push({ tipo: 'texto', ini: f.ini, fim: f.fim, bruto: t });
        continue;
      }
      /* o seletor de idioma é do gerador, não se traduz */
      if (/data-idiomas/.test(f.attrs)) continue;
      atributos(f);
      if (f.tag === 'script' && /application\/ld\+json/.test(f.attrs)) {
        out.push({ tipo: 'jsonld', ini: f.abreFim, fim: f.fimIni, bruto: html.slice(f.abreFim, f.fimIni) });
        continue;
      }
      /* Mensagens dos formulários moram no <script> da própria página
         ("Enviamos um link para "). Cada literal com frase vira trecho,
         com os espaços das pontas: eles emendam com o e-mail. */
      if (f.tag === 'script' && !/\ssrc=/.test(f.attrs) && f.fimIni > f.abreFim) {
        /* Comentários viram espaço (mesmo comprimento, para as posições
           continuarem valendo): uma aspa dentro de comentário desalinharia
           todas as strings seguintes, e frase de comentário não é texto
           de tela. Só "//" no começo da linha: dentro de string ele é
           endereço, não comentário. */
        const corpo = html.slice(f.abreFim, f.fimIni)
          .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
          .replace(/^[ \t]*\/\/[^\n]*/gm, (c) => ' '.repeat(c.length));
        const re = /(['"])((?:(?!\1)[^\\\n]|\\.)*)\1/g;
        let s;
        while ((s = re.exec(corpo))) {
          const v = s[2];
          /* Texto de tela: frase com espaço, palavra acentuada ou com
             reticências ("Enviando…"). Fora: identificador ('erro'),
             seletor ('#email', '.campo input'), código e endereço.
             Frase que começa com ponto (". Abra a mensagem") é texto. */
          const pareceTexto = /[a-zà-ÿ]{2,}\s+[A-Za-zÀ-ÿ]/.test(v) || /[à-ÿ…]/i.test(v);
          const pareceCodigo = v === 'use strict' || /[{}=<>]/.test(v) || /^[\w$:\/-]*$/.test(v)
            || /^[#.][\w-]+([\s.#\[>:]|$)/.test(v) || /^(https?:)?\/\//.test(v);
          if (!pareceTexto || pareceCodigo) continue;
          const ini = f.abreFim + s.index + 1;
          out.push({ tipo: 'js', aspas: s[1], ini, fim: ini + v.length, bruto: v });
        }
        continue;
      }
      /* o seletor de idioma é do gerador, não se traduz */
      if (/data-idiomas/.test(f.attrs)) continue;
      if (IGNORAR.has(f.tag) || f.fim === undefined) continue;
      if (dentroDeBloco) { andar(f, true); continue; }
      if (f.tag === 'title') {
        out.push({ tipo: 'bloco', ini: f.abreFim, fim: f.fimIni, bruto: html.slice(f.abreFim, f.fimIni) });
        continue;
      }
      /* Um bloco só-de-linha com texto direto é UM trecho. Se só tem
         links soltos (um <nav> com vários <a>), cada link vira trecho. */
      if (f.filhos.length && soLinha(f) && f.filhos.some((c) => c.tag === '#texto' && temTexto(html.slice(c.ini, c.fim)))) {
        out.push({ tipo: 'bloco', ini: f.abreFim, fim: f.fimIni, bruto: html.slice(f.abreFim, f.fimIni) });
        andar(f, true);                           // atributos dos filhos
        continue;
      }
      andar(f, false);
    }
  }
  andar(arvore, false);
  return out.sort((a, b) => a.ini - b.ini);
}

/* ---------------------------------------------------------------
   4 · dicionários
   --------------------------------------------------------------- */
const arquivoDic = (pagina) => path.join(DIC, pagina.replace(/\.html$/, '.json'));

function lerDic(pagina) {
  const f = arquivoDic(pagina);
  if (!fs.existsSync(f)) return [];
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

function mapaDoDic(lista) {
  const m = new Map();
  lista.forEach((e) => m.set(e.pt, e));
  return m;
}

/* partes traduzíveis de um JSON-LD: só descrições e textos de oferta */
function textosJsonLd(bruto) {
  const achados = [];
  const re = /"(description|alternateName|name|inLanguage)"\s*:\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(bruto))) {
    if (m[1] === 'description' && temTexto(m[2])) achados.push(m[2]);
  }
  return achados;
}

function chavesDaPagina(pagina) {
  const html = fs.readFileSync(path.join(RAIZ, pagina), 'utf8');
  const chaves = [];
  for (const t of trechos(html)) {
    if (t.tipo === 'jsonld') { textosJsonLd(t.bruto).forEach((d) => chaves.push(d)); continue; }
    if (t.tipo === 'js') { chaves.push(t.bruto); continue; }
    chaves.push(paraChave(t.bruto).chave);
  }
  return [...new Set(chaves)];
}

/* ---------------------------------------------------------------
   5 · geração
   --------------------------------------------------------------- */
function caminhoTraduzido(lang, rota) {
  if (rota === '/') return '/' + lang + '/';
  return '/' + lang + rota;
}

function reescreverLinks(html, lang) {
  /* href interno de página pública → versão no idioma. Assets, app,
     âncoras e externos ficam como estão. O seletor de idioma marca
     os próprios links com data-idioma e não é reescrito. */
  return html.replace(/(<a\b[^>]*?\shref=")([^"]*)(")/g, (tudo, a, href, b) => {
    if (/data-idioma/.test(tudo)) return tudo;
    const [base, resto] = href.split(/(?=[#?])/);
    if (base === '/') return a + '/' + lang + '/' + (resto || '') + b;
    if (ROTAS.includes(base)) return a + '/' + lang + base + (resto || '') + b;
    return tudo;
  });
}

function aplicar(pagina, lang, dic, faltas) {
  const html = fs.readFileSync(path.join(RAIZ, pagina), 'utf8');
  const lista = trechos(html);
  let saida = '';
  let cursor = 0;
  const traduz = (pt) => {
    const e = dic.get(pt);
    if (!e || typeof e[lang] !== 'string' || !e[lang].trim()) { faltas.add(pagina + ' [' + lang + ']: ' + pt.slice(0, 90)); return null; }
    return e[lang];
  };

  for (const t of lista) {
    if (t.ini < cursor) continue;              // trecho dentro de outro já traduzido
    saida += html.slice(cursor, t.ini);
    let novo = t.bruto;
    if (t.tipo === 'jsonld') {
      novo = t.bruto.replace(/"description"\s*:\s*"([^"]*)"/g, (tudo, d) => {
        const tr = temTexto(d) ? traduz(d) : null;
        return tr ? '"description": ' + JSON.stringify(tr) : tudo;
      }).replace(/"inLanguage"\s*:\s*"pt-BR"/g, '"inLanguage": "' + lang + '"');
    } else if (t.tipo === 'js') {
      /* dentro de uma string JS: a tradução não pode fechar a aspa */
      const tr = traduz(t.bruto);
      if (tr !== null) novo = tr.split('\\').join('\\\\').split(t.aspas).join('\\' + t.aspas);
    } else {
      const { chave, svgs } = paraChave(t.bruto);
      const tr = traduz(chave);
      if (tr !== null) {
        const lead = (t.bruto.match(/^\s*/) || [''])[0];
        const trail = (t.bruto.match(/\s*$/) || [''])[0];
        novo = lead + tr.replace(/⟦s(\d+)⟧/g, (x, i) => svgs[+i] || '') + trail;
      }
    }
    saida += novo;
    cursor = t.fim;
  }
  saida += html.slice(cursor);

  const rota = PAGINAS[pagina];
  saida = saida.replace(/<html lang="pt-BR"/, '<html lang="' + IDIOMAS[lang].html + '"');
  saida = saida.replace(/(<meta property="og:locale" content=")pt_BR(")/, '$1' + IDIOMAS[lang].og + '$2');
  if (rota) {
    const url = SITE + caminhoTraduzido(lang, rota);
    saida = saida.replace(/(<link rel="canonical" href=")[^"]*(")/, '$1' + url + '$2');
    saida = saida.replace(/(<meta property="og:url" content=")[^"]*(")/, '$1' + url + '$2');
  }
  saida = reescreverLinks(saida, lang);
  return saida;
}

/* ---------------------------------------------------------------
   seletor de idioma — no rodapé, ou solto no fim da página quando ela
   não tem rodapé (entrar, cadastro). Cada idioma com o próprio nome,
   porque quem procura "English" não lê "Inglês".
   --------------------------------------------------------------- */
const ROTULO_SELETOR = { pt: 'Idioma', en: 'Language', fr: 'Langue', es: 'Idioma' };
function seletor(rota, atual) {
  const alvo = rota === null ? '/' : rota;
  const itens = [['pt', 'Português', alvo]]
    .concat(Object.keys(IDIOMAS).map((l) => [l, IDIOMAS[l].nome, caminhoTraduzido(l, alvo)]));
  return '<!-- seletor-idioma: gerado -->'
    + '<nav class="idiomas" data-idiomas aria-label="' + ROTULO_SELETOR[atual] + '">'
    + itens.map(([l, nome, href]) => {
      const cod = l === 'pt' ? 'pt-BR' : l;
      return '<a data-idioma href="' + href + '" hreflang="' + cod + '" lang="' + cod + '"'
        + (l === atual ? ' aria-current="true"' : '') + '>' + nome + '</a>';
    }).join('')
    + '</nav><!-- /seletor-idioma -->';
}
function comSeletor(html, rota, atual) {
  const sem = html
    .replace(/<div class="idiomas-solto"><!-- seletor-idioma: gerado -->[\s\S]*?<!-- \/seletor-idioma --><\/div>\n?/g, '')
    .replace(/<!-- seletor-idioma: gerado -->[\s\S]*?<!-- \/seletor-idioma -->/g, '');
  const bloco = seletor(rota, atual);
  const k = sem.indexOf('<div class="rodape-fim">');
  if (k >= 0) {
    const fecha = sem.indexOf('</div>', k);
    return sem.slice(0, fecha) + bloco + sem.slice(fecha);
  }
  return sem.replace('</body>', '<div class="idiomas-solto">' + bloco + '</div>\n</body>');
}

/* hreflang: o mesmo bloco em todas as versões, inclusive a portuguesa */
function blocoHreflang(rota) {
  if (!rota) return '';
  const linhas = ['<link rel="alternate" hreflang="pt-BR" href="' + SITE + (rota === '/' ? '/' : rota) + '">']
    .concat(Object.keys(IDIOMAS).map((l) => '<link rel="alternate" hreflang="' + l + '" href="' + SITE + caminhoTraduzido(l, rota) + '">'))
    .concat(['<link rel="alternate" hreflang="x-default" href="' + SITE + (rota === '/' ? '/' : rota) + '">']);
  return '<!-- idiomas: gerado por tools/gen-idiomas.js -->\n' + linhas.join('\n') + '\n<!-- /idiomas -->';
}

function comHreflang(html, rota) {
  const bloco = blocoHreflang(rota);
  const sem = html.replace(/<!-- idiomas: gerado por tools\/gen-idiomas\.js -->[\s\S]*?<!-- \/idiomas -->\n?/, '');
  if (!bloco) return sem;
  return sem.replace(/(<link rel="canonical"[^>]*>\n)/, '$1' + bloco + '\n');
}

/* ---------------------------------------------------------------
   6 · comandos
   --------------------------------------------------------------- */
function extrair() {
  fs.mkdirSync(DIC, { recursive: true });
  for (const pagina of Object.keys(PAGINAS)) {
    const antigo = mapaDoDic(lerDic(pagina));
    const novo = chavesDaPagina(pagina).map((pt) => {
      const e = antigo.get(pt) || {};
      return { pt, en: e.en || '', fr: e.fr || '', es: e.es || '' };
    });
    fs.writeFileSync(arquivoDic(pagina), JSON.stringify(novo, null, 1) + '\n');
    const faltam = novo.filter((e) => !e.en || !e.fr || !e.es).length;
    console.log(pagina.padEnd(22) + String(novo.length).padStart(4) + ' trechos, ' + faltam + ' sem tradução completa');
  }
}

function gerar(soConferir) {
  const faltas = new Set();
  const diferentes = [];
  for (const pagina of Object.keys(PAGINAS)) {
    const rota = PAGINAS[pagina];
    /* a portuguesa ganha (ou mantém) os hreflang */
    const origem = path.join(RAIZ, pagina);
    const pt = fs.readFileSync(origem, 'utf8');
    const ptNovo = comSeletor(comHreflang(pt, rota), rota, 'pt');
    if (ptNovo !== pt) { if (soConferir) diferentes.push(pagina); else fs.writeFileSync(origem, ptNovo); }

    const dic = mapaDoDic(lerDic(pagina));
    for (const lang of Object.keys(IDIOMAS)) {
      const html = comSeletor(comHreflang(aplicar(pagina, lang, dic, faltas), rota), rota, lang);
      const destino = path.join(RAIZ, lang, pagina);
      const atual = fs.existsSync(destino) ? fs.readFileSync(destino, 'utf8') : null;
      if (atual !== html) {
        if (soConferir) diferentes.push(lang + '/' + pagina);
        else { fs.mkdirSync(path.dirname(destino), { recursive: true }); fs.writeFileSync(destino, html); }
      }
    }
  }
  return { faltas: [...faltas], diferentes };
}

const arg = process.argv[2];
if (arg === '--extrair') {
  extrair();
} else if (arg === '--conferir') {
  const r = gerar(true);
  if (r.faltas.length) {
    console.log('\n  ' + r.faltas.length + ' trecho(s) sem tradução:');
    r.faltas.slice(0, 40).forEach((f) => console.log('    - ' + f));
  }
  if (r.diferentes.length) {
    console.log('\n  gerado desatualizado (rode node tools/gen-idiomas.js):');
    r.diferentes.forEach((f) => console.log('    - ' + f));
  }
  if (r.faltas.length || r.diferentes.length) process.exit(1);
  console.log('OK — en, fr e es completos e em dia com o português.');
} else {
  const r = gerar(false);
  console.log('gerado: ' + Object.keys(IDIOMAS).join(', ') + (r.faltas.length ? ' — ' + r.faltas.length + ' trecho(s) ficaram em português' : ''));
}

module.exports = { trechos, paraChave };
