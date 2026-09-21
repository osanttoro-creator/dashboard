/* =============================================================
   tools/gen-idiomas-app.js — o app em inglês, francês e espanhol
   -------------------------------------------------------------
     node tools/gen-idiomas-app.js --extrair   atualiza i18n/app/*.json
     node tools/gen-idiomas-app.js             gera assets/js/i18n/app-*.js
     node tools/gen-idiomas-app.js --conferir  falha se faltar tradução
                                               ou se o gerado estiver velho

   POR QUE NÃO É IGUAL AO SITE
   O site é HTML parado: dá para gerar /en/precos.html pronto. O app é
   um arquivo só (app.html) e quase tudo o que ele mostra é desenhado
   por JavaScript — 1.500 frases espalhadas em 40 arquivos, muitas
   montadas com valores ("R$ 120,00 recebidos e R$ 80,00 pagos").
   Reescrever cada uma com t('...') seria mexer em 1.500 pontos de um
   código que funciona. Em vez disso, o app continua escrevendo em
   português e assets/js/idioma.js traduz o que chega à tela, com o
   dicionário que este arquivo gera.

   QUATRO TIPOS DE ENTRADA
     bloco      parágrafo fixo do app.html, com negrito e link dentro.
                Traduzido inteiro na abertura, antes de qualquer script
                tocar nele — frase inteira traduz melhor que pedaço.
     exato      texto que aparece sozinho num nó: "Salvar", "Receitas
                do mês", um title, um placeholder.
     padrao     texto com valores: "{0} recebidos e {1} pagos". Sai de
                template literal (`${a} recebidos...`) sem ninguém
                precisar escrevê-lo à mão.
     fragmento  pedaço colado com +: 'Economia de ' + valor. Trocado
                dentro do texto quando nada acima casou.

   O QUE NÃO SE TRADUZ
   Dado da pessoa — nome de conta, categoria, descrição de lançamento.
   Quem desenha esses valores marca o elemento com translate="no" (é o
   atributo padrão do HTML para isso, e os tradutores dos navegadores
   também o respeitam). A entrada que não é texto de tela — nome de
   evento, classe, chave — fica com "ignorar": true no dicionário.
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const { trechos, paraChave } = require('./gen-idiomas.js');

const RAIZ = path.join(__dirname, '..');
const DIC = path.join(RAIZ, 'i18n', 'app');
const SAIDA = path.join(RAIZ, 'assets', 'js', 'i18n');
const LINGUAS = ['en', 'fr', 'es'];

/* Arquivos do app, na ordem em que um texto repetido fica com o
   primeiro que o disser. Site, landing, cookies e contato ficam de fora: têm o
   próprio dicionário (gen-idiomas.js) ou o próprio mapa (cookies.js). */
const FORA = new Set(['site.js', 'site-auth.js', 'narrativa.js', 'cookies.js', 'contato.js', 'idioma.js',
  'supabase-config.js', 'icons.js', 'uglez-particulas.js', 'uglez-erosao.js', 'uglez-neon.js']);

function arquivosDoApp() {
  const lista = ['app.html'];
  const js = path.join(RAIZ, 'assets', 'js');
  for (const f of fs.readdirSync(js).sort()) {
    if (f.endsWith('.js') && !FORA.has(f)) lista.push('assets/js/' + f);
  }
  for (const f of fs.readdirSync(path.join(js, 'pages')).sort()) {
    if (f.endsWith('.js')) lista.push('assets/js/pages/' + f);
  }
  return lista;
}

const nomeDoDic = (arquivo) => arquivo === 'app.html' ? 'app-html'
  : arquivo.replace(/^assets\/js\//, '').replace(/\//g, '-').replace(/\.js$/, '');

/* ---------------------------------------------------------------
   1 · varredura de JavaScript
   ---------------------------------------------------------------
   Um leitor de caracteres que conhece comentário, string, template
   (com ${} aninhado) e expressão regular. O único ponto delicado é a
   barra: ela abre regex quando vem onde cabe um valor — depois de
   "(", ",", "=", "return"... — e é divisão depois de um valor. */
const PALAVRAS_ANTES_DE_VALOR = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of',
  'new', 'delete', 'void', 'throw', 'yield', 'await', 'instanceof']);

function varrerJS(src, base = 0, out = []) {
  let i = 0;
  let ultimo = '';          // último token significativo: '(' ',' 'x' (valor) ...
  let ultimaPalavra = '';
  const n = src.length;

  const regexPode = () => ultimo === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(ultimo)
    || (ultimo === 'w' && PALAVRAS_ANTES_DE_VALOR.has(ultimaPalavra));

  const vizinho = (de, passo) => {
    let k = de;
    while (k >= 0 && k < n && /\s/.test(src[k])) k += passo;
    return k >= 0 && k < n ? src[k] : '';
  };

  while (i < n) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const f = src.indexOf('*/', i + 2); i = f < 0 ? n : f + 2; continue; }

    if (c === '\'' || c === '"') {
      const ini = i;
      let j = i + 1, valor = '';
      while (j < n && src[j] !== c && src[j] !== '\n') {
        if (src[j] === '\\') { valor += src.slice(j, j + 2); j += 2; continue; }
        valor += src[j]; j++;
      }
      out.push({
        tipo: 'str', valor: desescapar(valor), ini: base + ini, fim: base + j + 1,
        antes: ultimo === '+' ? '+' : '', depois: vizinho(j + 1, 1) === '+' ? '+' : ''
      });
      i = j + 1; ultimo = 'x'; continue;
    }

    if (c === '`') {
      const ini = i;
      const partes = [''];
      const exprs = [];
      let j = i + 1;
      while (j < n && src[j] !== '`') {
        if (src[j] === '\\') { partes[partes.length - 1] += src.slice(j, j + 2); j += 2; continue; }
        if (src[j] === '$' && src[j + 1] === '{') {
          /* acha o } que fecha, atravessando strings e templates internos */
          let k = j + 2, prof = 1;
          while (k < n && prof > 0) {
            const d = src[k];
            if (d === '\'' || d === '"') { k++; while (k < n && src[k] !== d) { if (src[k] === '\\') k++; k++; } k++; continue; }
            if (d === '`') { k = fimDoTemplate(src, k); continue; }
            if (d === '{') prof++;
            else if (d === '}') prof--;
            k++;
          }
          const expr = src.slice(j + 2, k - 1);
          exprs.push(expr);
          varrerJS(expr, base + j + 2, out);        // strings dentro da expressão
          partes.push('');
          j = k; continue;
        }
        partes[partes.length - 1] += src[j]; j++;
      }
      out.push({
        tipo: 'tpl', partes: partes.map(desescapar), exprs, ini: base + ini, fim: base + j + 1,
        antes: ultimo === '+' ? '+' : '', depois: vizinho(j + 1, 1) === '+' ? '+' : ''
      });
      i = j + 1; ultimo = 'x'; continue;
    }

    if (c === '/' && regexPode()) {
      let j = i + 1, classe = false;
      while (j < n) {
        const d = src[j];
        if (d === '\\') { j += 2; continue; }
        if (d === '[') classe = true;
        else if (d === ']') classe = false;
        else if (d === '/' && !classe) break;
        else if (d === '\n') break;
        j++;
      }
      j++;
      while (j < n && /[a-z]/i.test(src[j])) j++;   // flags
      i = j; ultimo = 'x'; continue;
    }

    if (/[A-Za-z_$0-9À-ÿ]/.test(c)) {
      let j = i;
      while (j < n && /[\w$À-ÿ]/.test(src[j])) j++;
      ultimaPalavra = src.slice(i, j);
      ultimo = PALAVRAS_ANTES_DE_VALOR.has(ultimaPalavra) ? 'w' : 'x';
      i = j; continue;
    }

    /* ")" e "]" encerram um valor: a barra seguinte é divisão */
    ultimo = (c === ')' || c === ']') ? 'x' : c;
    i++;
  }
  return out;
}

function fimDoTemplate(src, i) {
  let j = i + 1;
  while (j < src.length && src[j] !== '`') {
    if (src[j] === '\\') { j += 2; continue; }
    if (src[j] === '$' && src[j + 1] === '{') {
      let prof = 1; j += 2;
      while (j < src.length && prof > 0) {
        if (src[j] === '`') { j = fimDoTemplate(src, j); continue; }
        if (src[j] === '{') prof++;
        else if (src[j] === '}') prof--;
        j++;
      }
      continue;
    }
    j++;
  }
  return j + 1;
}

function desescapar(s) {
  return s.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (t, e) => {
    if (e[0] === 'u') return String.fromCodePoint(parseInt(e.replace(/[u{}]/g, ''), 16));
    if (e[0] === 'x') return String.fromCharCode(parseInt(e.slice(1), 16));
    return { n: '\n', t: '\t', r: '' }[e] ?? e;
  });
}

/* ---------------------------------------------------------------
   2 · de literal para entrada
   --------------------------------------------------------------- */
const temLetra = (s) => /[A-Za-zÀ-ÿ]{2,}/.test(s);
const norm = (s) => String(s).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

/* Texto de tela ou código? Na dúvida, entra: o que não é de tela nunca
   vira nó de texto, então traduzir não quebra nada — só custa uma
   linha no dicionário. Fica de fora o que é inequivocamente código. */
function pareceCodigo(v) {
  const t = v.trim();
  if (!temLetra(t)) return true;
  if (/^(https?:|mailto:|data:|\/[\w/-]|\.\.?\/|#[\w-]|\.[a-z][\w-]*|\[[\w-]+)/.test(t)) return true;
  if (/^[a-z][\w$-]*$/.test(t)) return true;                    // palavra-chave, classe, evento
  if (/^[a-z][\w-]*( [a-z][\w-]*)+$/.test(t) && !/[à-ÿ]/.test(t) && /-/.test(t)) return true;  // lista de classes
  if (/^[\w-]+:\s*[^;]+;?$/.test(t) && /(px|rem|em|%|var\(|#[0-9a-f]{3})/i.test(t)) return true;  // CSS
  if (/^(rgba?|hsla?|var|calc|linear-gradient|url)\(/i.test(t)) return true;
  if (/^[\d.\s,-]+(px|rem|em|%|ms|s|deg)?$/.test(t)) return true;
  if (/^[A-Z_][A-Z0-9_]+$/.test(t)) return true;                 // CONSTANTE
  if (/^[a-z]+\.[a-z.]+$/i.test(t)) return true;                  // oaze.chave
  if (/^\w+(\.\w+)*\(/.test(t)) return true;                      // chamada
  if (/^(select|insert|update|delete)\b/i.test(t)) return true;   // SQL
  if (/^--[\w-]+$/.test(t) || /^__\w+__$/.test(t)) return true;   // variável CSS, sentinela
  if (/^[\w-]+\|/.test(t)) return true;                            // chave de cache "mt|..."
  if (/:not\(|\[[\w-]+(=|\])|^\(prefers-|^h[1-6],\s/.test(t)) return true;  // seletor, media query
  if (/\.\d+s\b|;charset=|-apple-system|sans-serif/.test(t)) return true;   // CSS
  if (/^&[#\w]+;$/.test(t)) return true;                          // entidade HTML
  if (/^[\w./-]+\.(js|css|json|png|svg|webp|jpg|html|sql)$/.test(t)) return true;  // arquivo
  if (/^[\w-]+(,\s*[\w-]+)+$/.test(t) && !/[A-ZÀ-ÿ]/.test(t)) return true;         // lista de colunas
  return false;
}

/* Divide um texto com HTML em pedaços de tela: o que fica entre as
   etiquetas e os atributos que a pessoa lê. */
const ATTRS_TELA = /\s(title|aria-label|placeholder|alt|data-dica)\s*=\s*"([^"]*)"/g;
function pedacosDeHTML(texto) {
  const out = [];
  if (!/<[a-z!/]/i.test(texto)) return [{ tipo: 'texto', valor: texto }];
  const re = /<[^>]*>/g;
  let m, ultimo = 0;
  while ((m = re.exec(texto))) {
    out.push({ tipo: 'texto', valor: texto.slice(ultimo, m.index) });
    let a; ATTRS_TELA.lastIndex = 0;
    while ((a = ATTRS_TELA.exec(m[0]))) out.push({ tipo: 'attr', valor: a[2] });
    ultimo = re.lastIndex;
  }
  out.push({ tipo: 'texto', valor: texto.slice(ultimo) });
  return out;
}

/* ---------------------------------------------------------------
   Somas de texto: 'desde o fim de ' + U.monthLabel(ym)
   ---------------------------------------------------------------
   Trocar pedaços soltos na tela é perigoso: " de fatura" também
   aparece dentro de "Pagamento de fatura", que alguém digitou. Então a
   soma inteira vira um padrão — "desde o fim de {0}" —, ancorado do
   começo ao fim do texto. Para isso é preciso achar onde a soma começa
   e termina, andando pelos operandos: string, template, (…), chamada
   a.b(c).d e o que mais vier até um operador que não seja "+". */
const PARA = /[,;:?)\]}]/;

function operandoParaFrente(src, i) {
  const n = src.length;
  while (i < n && /\s/.test(src[i])) i++;
  const ini = i;
  const c = src[i];
  if (c === '\'' || c === '"') {
    let j = i + 1;
    while (j < n && src[j] !== c) { if (src[j] === '\\') j++; j++; }
    return { ini, fim: j + 1, literal: desescapar(src.slice(i + 1, j)) };
  }
  if (c === '`') {
    const fim = fimDoTemplate(src, i);
    const corpo = src.slice(i + 1, fim - 1);
    if (!/\$\{/.test(corpo)) return { ini, fim, literal: desescapar(corpo) };
    return { ini, fim, literal: null };
  }
  /* qualquer outra coisa: vai até um "+" ou um fim de expressão no
     mesmo nível de parênteses */
  let j = i, prof = 0;
  while (j < n) {
    const d = src[j];
    if (d === '\'' || d === '"') { j++; while (j < n && src[j] !== d) { if (src[j] === '\\') j++; j++; } j++; continue; }
    if (d === '`') { j = fimDoTemplate(src, j); continue; }
    if ('([{'.includes(d)) prof++;
    else if (')]}'.includes(d)) { if (prof === 0) break; prof--; }
    else if (prof === 0 && (d === '+' || PARA.test(d) || d === '\n' && /^\s*[a-z]+\s*[:(]/.test(src.slice(j, j + 40)))) break;
    else if (prof === 0 && (d === '=' || d === '&' || d === '|') && src[j + 1] !== '>') break;
    j++;
  }
  if (j === ini) return null;
  return { ini, fim: j, literal: null };
}

function operandoParaTras(src, i) {
  /* i aponta para depois do operando (logo antes do "+") */
  let j = i - 1;
  while (j >= 0 && /\s/.test(src[j])) j--;
  if (j < 0) return null;
  const c = src[j];
  if (c === '\'' || c === '"') {
    let k = j - 1;
    while (k >= 0 && !(src[k] === c && src[k - 1] !== '\\')) k--;
    return { ini: k, fim: j + 1, literal: desescapar(src.slice(k + 1, j)) };
  }
  if (c === '`') return null;                     // template antes de "+": raro, fica sem padrão
  /* termina em ")" ou "]" ou palavra: volta pela cadeia a.b(c)[d] */
  let k = j;
  for (;;) {
    if (src[k] === ')' || src[k] === ']') {
      const abre = src[k] === ')' ? '(' : '[', fecha = src[k];
      let prof = 0;
      for (; k >= 0; k--) {
        if (src[k] === fecha) prof++;
        else if (src[k] === abre) { prof--; if (prof === 0) break; }
      }
      k--;
      continue;
    }
    if (/[\w$]/.test(src[k])) { while (k >= 0 && /[\w$]/.test(src[k])) k--; }
    if (src[k] === '.') { k--; continue; }
    if ((src[k] === ')' || src[k] === ']')) continue;
    break;
  }
  if (k + 1 > j) return null;
  return { ini: k + 1, fim: j + 1, literal: null };
}

function cadeiaDeSoma(src, lit) {
  /* volta até o começo da soma */
  const operandos = [{ ini: lit.ini, fim: lit.fim, literal: lit.valor }];
  let ini = lit.ini;
  for (let guarda = 0; guarda < 20; guarda++) {
    let j = ini - 1;
    while (j >= 0 && /\s/.test(src[j])) j--;
    if (src[j] !== '+' || src[j - 1] === '+') break;
    const op = operandoParaTras(src, j);
    if (!op) break;
    operandos.unshift(op); ini = op.ini;
  }
  let fim = lit.fim;
  for (let guarda = 0; guarda < 20; guarda++) {
    let j = fim;
    while (j < src.length && /\s/.test(src[j])) j++;
    if (src[j] !== '+' || src[j + 1] === '+' || src[j + 1] === '=') break;
    const op = operandoParaFrente(src, j + 1);
    if (!op) break;
    operandos.push(op); fim = op.fim;
  }
  if (operandos.length < 2) return null;
  let k = 0;
  const texto = operandos.map((o) => o.literal !== null && o.literal !== undefined ? o.literal : '{' + (k++) + '}').join('');
  return { ini, fim, texto };
}

/* Numera de novo os {n} de um pedaço: cada pedaço começa em {0}. */
function renumerar(s) {
  let k = 0; const mapa = {};
  return s.replace(/\{(\d+)\}/g, (t, d) => '{' + (mapa[d] ?? (mapa[d] = k++)) + '}');
}

function entradasDoJS(arquivo) {
  const src = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
  const lits = varrerJS(src);
  const out = [];
  const add = (pt, tipo) => {
    const valor = tipo === 'fragmento' ? pt.replace(/\u00a0/g, ' ') : norm(pt);
    /* "hero-trend is-{0}" é classe montada, não frase. Mas "{0} meses"
       e "{0} de {1}" são frase: num padrão, o texto fixo só é julgado
       como código se tiver sinal de código (hífen, barra, ponto...). */
    const semMarcas = valor.replace(/\{\d+\}/g, '');
    if (!temLetra(valor) || pareceCodigo(valor)) return;
    const sinalDeCodigo = /[-_/=|#@\\]|\.\w/.test(semMarcas);
    if ((tipo !== 'padrao' || sinalDeCodigo) && pareceCodigo(semMarcas.trim() || 'x')) return;
    /* padrão que é só marcador e pontuação não tem o que traduzir */
    if (tipo === 'padrao' && !temLetra(valor.replace(/\{\d+\}/g, ''))) return;
    out.push({ pt: valor, tipo });
  };

  const cadeiasVistas = new Set();
  /* Texto com etiqueta HTML: cada pedaço entre etiquetas é um nó de
     texto inteiro na tela — frase exata, mesmo que a string esteja
     colada com + numa vizinha que começa com <strong>. */
  const temHTML = (s) => /<[a-z/!]/i.test(s);
  const emitir = (texto, fragSemPadrao) => {
    if (temHTML(texto)) fragSemPadrao = false;
    for (const p of pedacosDeHTML(texto)) {
      if (!p.valor.trim()) continue;
      const v = renumerar(p.valor);
      const temMarca = /\{\d+\}/.test(v);
      if (p.tipo === 'attr') { add(v, temMarca ? 'padrao' : 'exato'); continue; }
      if (temMarca) add(v, 'padrao');
      else add(v, fragSemPadrao ? 'fragmento' : 'exato');
    }
  };

  for (const l of lits) {
    const frag = l.antes === '+' || l.depois === '+';
    if (l.tipo === 'str') {
      if (frag) {
        const cadeia = cadeiaDeSoma(src, l);
        if (cadeia) {
          if (!cadeiasVistas.has(cadeia.ini)) { cadeiasVistas.add(cadeia.ini); emitir(cadeia.texto, false); }
          continue;
        }
      }
      emitir(l.valor, frag);
      continue;
    }
    /* template: ${expr} vira {n}; com HTML, cada pedaço é uma entrada */
    let comMarcas = '';
    l.partes.forEach((p, k) => { comMarcas += p; if (k < l.exprs.length) comMarcas += '{' + k + '}'; });
    for (const p of pedacosDeHTML(comMarcas)) {
      if (!p.valor.trim()) continue;
      const v = renumerar(p.valor);
      const temMarca = /\{\d+\}/.test(v);
      if (p.tipo === 'attr') { add(v, temMarca ? 'padrao' : 'exato'); continue; }
      if (temMarca) {
        /* Só o padrão inteiro. Os pedaços fixos dele NÃO viram
           fragmento: fragmento trocado no meio do texto é o que
           traduziria uma descrição digitada pela pessoa. Quando um ${}
           desenha um ícone no meio e o texto se parte em dois nós, a
           varredura do app em inglês (CDP) mostra o que sobrou, e a
           correção vai para padroes-manuais.json. */
        add(v, 'padrao');
      } else {
        add(v, frag && !temHTML(comMarcas) ? 'fragmento' : 'exato');
      }
    }
  }
  return out;
}

/* app.html: a mesma leitura do site. Bloco com etiqueta dentro vira
   'bloco'; texto solto e atributo viram 'exato'. */
function entradasDoHTML(arquivo) {
  const html = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
  const out = [];
  for (const t of trechos(html)) {
    if (t.tipo === 'jsonld') continue;
    if (t.tipo === 'js') {
      const v = norm(t.bruto);
      if (temLetra(v) && !pareceCodigo(v)) out.push({ pt: v, tipo: 'exato' });
      continue;
    }
    const { chave } = paraChave(t.bruto);
    if (t.tipo === 'bloco' && /<[a-z]/i.test(chave.replace(/⟦s\d+⟧/g, ''))) {
      out.push({ pt: chave, tipo: 'bloco' });
    } else {
      const v = norm(decodificar(chave.replace(/⟦s\d+⟧/g, ' ')));
      if (temLetra(v)) out.push({ pt: v, tipo: 'exato' });
    }
  }
  return out;
}

function decodificar(s) {
  return s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&middot;/g, '·').replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–').replace(/&hellip;/g, '…').replace(/&rarr;/g, '→').replace(/&larr;/g, '←')
    .replace(/&times;/g, '×').replace(/&minus;/g, '−').replace(/&#(\d+);/g, (t, d) => String.fromCharCode(+d));
}

/** O texto que o navegador vai mostrar num bloco — é por ele que o
    tradutor acha o elemento em tempo de execução. */
function textoDoBloco(chave) {
  return norm(decodificar(chave.replace(/⟦s\d+⟧/g, ' ').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '')));
}

/* ---------------------------------------------------------------
   3 · dicionários
   --------------------------------------------------------------- */
const arquivoDic = (nome) => path.join(DIC, nome + '.json');
function lerDic(nome) {
  const f = arquivoDic(nome);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : [];
}

/* Traduções escritas à mão para textos montados de um jeito que a
   varredura não reconstrói ("desde o fim de " + mês). Ficam num
   arquivo próprio, que --extrair nunca apaga. */
const EXTRAS = 'padroes-manuais';

function extrair() {
  fs.mkdirSync(DIC, { recursive: true });
  const vistos = new Set();
  let total = 0, faltam = 0;
  const velho = new Map();
  for (const f of fs.readdirSync(DIC)) {
    if (!f.endsWith('.json')) continue;
    for (const e of JSON.parse(fs.readFileSync(path.join(DIC, f), 'utf8'))) {
      velho.set(e.tipo + '\u0000' + e.pt, e);
    }
  }
  for (const arquivo of arquivosDoApp()) {
    const brutas = arquivo.endsWith('.html') ? entradasDoHTML(arquivo) : entradasDoJS(arquivo);
    const lista = [];
    for (const e of brutas) {
      const chave = e.tipo + '\u0000' + e.pt;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      const antigo = velho.get(chave) || {};
      const nova = { pt: e.pt, tipo: e.tipo };
      if (antigo.ignorar) nova.ignorar = true;
      else LINGUAS.forEach((l) => { nova[l] = antigo[l] || ''; });
      lista.push(nova);
    }
    const nome = nomeDoDic(arquivo);
    if (!lista.length) { if (fs.existsSync(arquivoDic(nome))) fs.unlinkSync(arquivoDic(nome)); continue; }
    fs.writeFileSync(arquivoDic(nome), JSON.stringify(lista, null, 1) + '\n');
    const sem = lista.filter((e) => !e.ignorar && LINGUAS.some((l) => !e[l])).length;
    total += lista.length; faltam += sem;
    console.log(nome.padEnd(26) + String(lista.length).padStart(5) + ' trechos, ' + sem + ' sem tradução');
  }
  if (!fs.existsSync(arquivoDic(EXTRAS))) fs.writeFileSync(arquivoDic(EXTRAS), '[]\n');
  console.log('\n' + total + ' trechos no app; ' + faltam + ' ainda sem tradução completa.');
}

/* ---------------------------------------------------------------
   4 · geração dos arquivos que o navegador carrega
   --------------------------------------------------------------- */
function montar(lang) {
  const exato = {}, blocos = {}, padroes = [], fragmentos = [];
  const faltas = [];
  for (const f of fs.readdirSync(DIC).sort()) {
    if (!f.endsWith('.json')) continue;
    for (const e of JSON.parse(fs.readFileSync(path.join(DIC, f), 'utf8'))) {
      if (e.ignorar) continue;
      const tr = e[lang];
      if (!tr) { faltas.push(f + ' [' + lang + ']: ' + e.pt.slice(0, 80)); continue; }
      if (e.tipo === 'bloco') blocos[textoDoBloco(e.pt)] = tr;
      else if (e.tipo === 'padrao') padroes.push([e.pt, tr]);
      else if (e.tipo === 'fragmento') fragmentos.push([e.pt, tr]);
      else if (!(norm(e.pt) in exato)) exato[norm(e.pt)] = tr;
    }
  }
  /* o padrão mais específico (mais texto fixo) testa primeiro */
  const fixo = (p) => p.replace(/\{\d+\}/g, '').length;
  padroes.sort((a, b) => fixo(b[0]) - fixo(a[0]));
  fragmentos.sort((a, b) => b[0].length - a[0].length);
  const corpo = JSON.stringify({ exato, blocos, padroes, fragmentos });
  const js = '/* GERADO por tools/gen-idiomas-app.js — não edite à mão; edite i18n/app/*.json */\n'
    + 'window.I18n && I18n.carregar(' + JSON.stringify(lang) + ', ' + corpo + ');\n';
  return { js, faltas };
}

function gerar(soConferir) {
  const faltas = [], velhos = [];
  fs.mkdirSync(SAIDA, { recursive: true });
  for (const lang of LINGUAS) {
    const r = montar(lang);
    faltas.push(...r.faltas);
    const destino = path.join(SAIDA, 'app-' + lang + '.js');
    const atual = fs.existsSync(destino) ? fs.readFileSync(destino, 'utf8') : null;
    if (atual !== r.js) {
      if (soConferir) velhos.push(path.relative(RAIZ, destino));
      else fs.writeFileSync(destino, r.js);
    }
  }
  return { faltas, velhos };
}

/* Conferência: o que o código diz hoje tem de estar no dicionário. */
function naoExtraidos() {
  const noDic = new Set();
  for (const f of fs.readdirSync(DIC)) {
    if (!f.endsWith('.json')) continue;
    JSON.parse(fs.readFileSync(path.join(DIC, f), 'utf8')).forEach((e) => noDic.add(e.tipo + '\u0000' + e.pt));
  }
  const faltam = [];
  for (const arquivo of arquivosDoApp()) {
    const brutas = arquivo.endsWith('.html') ? entradasDoHTML(arquivo) : entradasDoJS(arquivo);
    for (const e of brutas) if (!noDic.has(e.tipo + '\u0000' + e.pt)) faltam.push(arquivo + ': ' + e.pt.slice(0, 80));
  }
  return [...new Set(faltam)];
}

const arg = process.argv[2];
if (require.main === module) {
  if (arg === '--extrair') {
    extrair();
  } else if (arg === '--conferir') {
    const novos = naoExtraidos();
    const r = gerar(true);
    if (novos.length) {
      console.log('\n  ' + novos.length + ' texto(s) novo(s) no app, fora do dicionário (rode --extrair):');
      novos.slice(0, 30).forEach((f) => console.log('    - ' + f));
    }
    if (r.faltas.length) {
      console.log('\n  ' + r.faltas.length + ' trecho(s) do app sem tradução:');
      r.faltas.slice(0, 30).forEach((f) => console.log('    - ' + f));
    }
    if (r.velhos.length) {
      console.log('\n  gerado desatualizado (rode node tools/gen-idiomas-app.js):');
      r.velhos.forEach((f) => console.log('    - ' + f));
    }
    if (novos.length || r.faltas.length || r.velhos.length) process.exit(1);
    console.log('OK — o app fala en, fr e es em tudo o que o código escreve hoje.');
  } else {
    const r = gerar(false);
    console.log('gerado: assets/js/i18n/app-{' + LINGUAS.join(',') + '}.js'
      + (r.faltas.length ? ' — ' + r.faltas.length + ' trecho(s) ainda em português' : ''));
  }
}

module.exports = { varrerJS, entradasDoJS, entradasDoHTML, textoDoBloco, pareceCodigo };
