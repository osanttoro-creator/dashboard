/* =============================================================
   idioma.js — o app em inglês, francês e espanhol
   -------------------------------------------------------------
   O app continua escrevendo em português. Este arquivo traduz o que
   chega à tela, com o dicionário gerado por tools/gen-idiomas-app.js
   (assets/js/i18n/app-<língua>.js).

   ORDEM DE CARGA — ela é o que evita a tela piscar em português
     1. <head>: o script do tema decide a língua, grava em <html lang>
        e, se não for português, esconde o corpo (data-traduzindo).
     2. Fim do <body>, ANTES de qualquer outro script: este arquivo.
        Ele escreve a tag do dicionário logo em seguida (document.write
        de arquivo da mesma origem — o mesmo recurso que o app já usa
        como reserva do Chart.js), e o dicionário chama I18n.carregar.
     3. carregar() traduz o HTML fixo inteiro, liga o observador e
        mostra o corpo. Só então utils.js, store.js e o resto rodam.

   TRÊS CAMADAS, NESTA ORDEM
     exato    o nó inteiro é uma frase conhecida       "Salvar"
     padrão   o nó é uma frase com valores             "{0} recebidos"
     bloco    parágrafo fixo do app.html com negrito ou link dentro,
              trocado inteiro na abertura (só na abertura: depois
              disso, trocar innerHTML apagaria eventos já ligados)

   O QUE NUNCA SE TRADUZ
   Qualquer coisa dentro de translate="no" — é como o app marca o que a
   pessoa digitou (nome de conta, descrição, categoria) —, campos de
   formulário, código e o que não tem letra.
   ============================================================= */
(function (global) {
  'use strict';

  const LOCALES = { pt: 'pt-BR', en: 'en-US', fr: 'fr-FR', es: 'es-ES' };
  const doc = document.documentElement;
  const escolhida = doc.getAttribute('data-idioma');
  const lang = LOCALES[escolhida] ? escolhida : 'pt';

  const I18n = {
    lang,
    locale: LOCALES[lang],
    NOMES: { pt: 'Português', en: 'English', fr: 'Français', es: 'Español' },
    pronto: lang === 'pt'
  };

  /* ---------------- estado do dicionário ---------------- */
  let exato = new Map();
  let blocos = new Map();
  let padroes = [];          // [{ re, tr, fixo }]
  const cache = new Map();
  let revisaoCache = -1;

  const norm = (s) => String(s).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const temLetra = (s) => /[A-Za-zÀ-ÿ]{2,}/.test(s);
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function compilarPadrao(pt) {
    /* espaço no padrão casa com espaço comum ou não quebrável: o
       Intl.NumberFormat de pt-BR escreve "R$ 1,00" com U+00A0 */
    const partes = pt.split(/(\{\d+\})/);
    const ordem = [];
    let fonte = '^';
    let anterior = '';
    for (const p of partes) {
      const m = /^\{(\d+)\}$/.exec(p);
      /* colado numa palavra ("categoria{1}"), o valor é sufixo de
         plural e pode vir vazio; solto, precisa ter conteúdo */
      if (m) { ordem.push(+m[1]); fonte += /[A-Za-zÀ-ÿ)]$/.test(anterior) ? '([\\s\\S]*?)' : '([\\s\\S]+?)'; }
      else fonte += escRe(p).replace(/ /g, '[\\s\\u00a0]+');
      anterior = p;
    }
    const fixo = partes.filter((p) => !/^\{\d+\}$/.test(p));
    return {
      re: new RegExp(fonte + '$'),
      ordem,
      pista: fixo.slice().sort((a, b) => b.length - a.length)[0] || '',
      /* Padrão de pouco texto fixo ("Fatura {0}", "{0} de {1}") casaria
         com o que a pessoa digitou — "Fatura Nubank", "Pagamento de
         luz". Nesses, cada valor precisa ter cara de valor. */
      curto: fixo.join('').replace(/[^A-Za-zÀ-ÿ]/g, '').length < 7
    };
  }

  /* Os nomes que a PESSOA cadastrou — contas, cartões, categorias,
     metas, investimentos e descrições de lançamento. Num padrão curto
     ("Fatura {0}"), um valor desses é legítimo: "Fatura Nubank" é o app
     falando do cartão Nubank. O que NÃO está aqui é texto livre, e é
     por isso que "Pagamento de luz" digitado nunca vira inglês. Refeito
     só quando o Store muda (revisão). */
  let nomes = new Set();
  let revisaoNomes = -1;
  function nomesCadastrados() {
    const S = global.Store;
    if (!S || typeof S.revisao !== 'function' || typeof S.profile !== 'function') return nomes;
    const rev = S.revisao();
    if (rev === revisaoNomes) return nomes;
    revisaoNomes = rev;
    nomes = new Set();
    try {
      const p = S.profile() || {};
      const add = (v) => { if (v) nomes.add(norm(v)); };
      (p.accounts || []).forEach((a) => add(a.name));
      (p.cards || []).forEach((c) => add(c.name));
      (p.categories || []).forEach((c) => add(c.name));
      (p.goals || []).forEach((g) => add(g.name));
      (p.investments || []).forEach((i) => add(i.name));
      (p.transactions || []).forEach((t) => add(t.description));
      add(p.name);
    } catch (e) { /* sem perfil ainda: conjunto vazio */ }
    return nomes;
  }

  /** O valor capturado é número, data, dinheiro, mês, dia da semana,
      uma frase que o dicionário conhece ou um nome cadastrado? */
  function pareceValor(v) {
    const t = norm(v);
    if (!t) return false;
    if (/\d/.test(t) || exato.has(t) || exato.has(maiuscula(t))) return true;
    const U = global.U;
    if (U) {
      const baixo = t.toLowerCase();
      const listas = [U.MONTHS, U.MONTHS_SHORT, U.WEEKDAYS_SHORT];
      for (const l of listas) if (l && l.some((x) => String(x).toLowerCase() === baixo)) return true;
    }
    return nomesCadastrados().has(t);
  }

  const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  /* um valor capturado não pode atravessar fim de frase: "{0} com
     despesa em {1}." não pode engolir a frase seguinte inteira */
  /* ...nem um separador de lista: "no fim de {0}" não pode levar junto
     " · − R$ 890 a pagar"; cada pedaço da lista se traduz sozinho */
  const FIM_DE_FRASE = /[.!?]\s+[A-ZÀ-Ý]|\s·\s/;

  /** O valor de um padrão, traduzido se ele mesmo for texto do app. */
  function traduzirValor(v, confiavel, prof) {
    const t = norm(v);
    if (!t || !temLetra(t)) return v;
    const lead = (v.match(/^\s*/) || [''])[0];
    const trail = (v.match(/\s*$/) || [''])[0];
    const embrulha = (r) => lead + r + trail;
    if (exato.has(t)) return embrulha(exato.get(t));
    /* "recebido" no meio da frase, quando o dicionário só tem "Recebido" */
    if (exato.has(maiuscula(t))) {
      const tr = exato.get(maiuscula(t));
      return embrulha(tr.charAt(0).toLowerCase() + tr.slice(1));
    }
    if (prof < 2) {
      const r = casarPadrao(v, confiavel, prof + 1);
      if (r !== null) return embrulha(r);
    }
    return v;
  }

  /* Mês no meio da frase: minúsculo em francês e espanhol ("de
     septiembre de 2026"), e com elisão em francês ("d'octobre"). O
     rótulo "Octobre 2026" do cabeçalho continua com maiúscula: só o
     valor que entra DEPOIS de algum texto é que muda. */
  function mesNoMeio(valor, antes) {
    if ((lang !== 'fr' && lang !== 'es') || !antes || !/\S/.test(antes)) return valor;
    const U = global.U;
    if (!U || !U.MONTHS) return valor;
    const t = valor.replace(/^\s+/, '');
    const mes = U.MONTHS.find((m) => t.indexOf(m) === 0);
    if (!mes) return valor;
    return valor.replace(mes, mes.toLowerCase());
  }
  function elisao(frase) {
    if (lang !== 'fr') return frase;
    return frase.replace(/\b([dD])e (avril|août|octobre)/g, "$1'$2");
  }

  function casarPadrao(texto, confiavel, prof) {
    const chave = norm(texto);
    const bruto = texto.replace(/\s+/g, ' ').trim();
    for (const p of padroes) {
      if (p.pista && bruto.indexOf(p.pista.trim()) < 0 && chave.indexOf(p.pista.trim()) < 0) continue;
      const m = p.re.exec(bruto) || p.re.exec(chave);
      if (!m) continue;
      const capturas = m.slice(1);
      if (capturas.some((v) => FIM_DE_FRASE.test(v))) continue;
      if (p.curto && !confiavel && capturas.some((v) => !pareceValor(v))) continue;
      const valores = {};
      p.ordem.forEach((n, k) => { valores[n] = capturas[k]; });
      return elisao(p.tr.replace(/\{(\d+)\}/g, (t, n, pos) => {
        const v = valores[n];
        return v === undefined ? t : mesNoMeio(traduzirValor(v, confiavel, prof), p.tr.slice(0, pos));
      }));
    }
    return null;
  }

  /* Último recurso: texto montado com várias frases ("1 categoria com
     despesa. A maior é Moradia, com R$ 2.686,30 — 100% do total.") ou
     uma lista com " · ". Cada pedaço é traduzido sozinho; o que não
     tiver tradução fica como está. Só entra quando ao menos um pedaço
     casou — senão o nó volta intacto. */
  const SEPARADORES = /((?<=[.!?:])\s+(?=[A-ZÀ-Ý0-9"“(])|\s+·\s+|(?<=—)\s+)/;
  function porSegmentos(texto, confiavel) {
    const partes = texto.split(SEPARADORES);
    if (partes.length < 3) return null;
    let algum = false;
    const out = partes.map((pedaco, i) => {
      if (i % 2 === 1) return pedaco;                  // o próprio separador
      const t = norm(pedaco);
      if (!t || !temLetra(t)) return pedaco;
      let r = exato.has(t) ? exato.get(t) : null;
      if (r === null) r = casarPadrao(pedaco, confiavel, 1);
      if (r === null) return pedaco;
      algum = true;
      return r;
    });
    return algum ? out.join('') : null;
  }

  /** A tradução de um texto, ou null se ele não for conhecido. */
  function traduzir(texto, confiavel) {
    if (lang === 'pt' || !texto) return null;
    const chave = norm(texto);
    if (!chave || !temLetra(chave)) return null;
    /* o Store mudou (conta nova, cartão renomeado): o que foi recusado
       antes pode passar agora, porque os nomes cadastrados mudaram */
    const S = global.Store;
    if (S && typeof S.revisao === 'function') {
      const rev = S.revisao();
      if (rev !== revisaoCache) { revisaoCache = rev; cache.clear(); }
    }
    const chaveCache = (confiavel ? '!' : '') + chave;
    if (cache.has(chaveCache)) return cache.get(chaveCache);
    let r = exato.has(chave) ? exato.get(chave) : null;
    if (r === null) r = casarPadrao(texto, confiavel, 0);
    if (r === null) r = porSegmentos(texto, confiavel);
    /* nomes cadastrados mudam o resultado: só guarda o que não usou
       a lista (o cache é zerado quando o Store muda, logo abaixo) */
    if (cache.size > 6000) cache.clear();
    cache.set(chaveCache, r);
    return r;
  }

  /** Só a frase inteira, sem padrão: para rótulo que pode ser um nome
      dado pela pessoa (eixo de gráfico com categorias). */
  I18n.exato = function (texto) {
    if (lang === 'pt' || typeof texto !== 'string') return texto;
    const t = norm(texto);
    return exato.has(t) ? exato.get(t) : texto;
  };

  /** Para o que não passa pela tela: rótulo de gráfico, confirm(), título. */
  I18n.t = function (texto) {
    const r = traduzir(texto, true);
    return r === null ? texto : r;
  };

  /* ---------------- aplicar na página ---------------- */
  const ATRIBUTOS = ['placeholder', 'title', 'aria-label', 'alt', 'data-dica', 'aria-description'];
  const PULAR = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'NOSCRIPT', 'TEMPLATE']);
  const escritos = new WeakMap();      // nó → texto que NÓS escrevemos (evita laço)

  function protegido(el) {
    for (let e = el; e && e !== document.body && e.nodeType === 1; e = e.parentElement) {
      if (PULAR.has(e.tagName) || e.getAttribute('translate') === 'no' || e.isContentEditable) return true;
    }
    return false;
  }

  /* Para atributo, o próprio <textarea> não conta como proteção: o
     placeholder e o aria-label dele são do app; o que se escreve
     dentro é da pessoa, e esse nunca passa por aqui. */
  function atributoProtegido(el) {
    if (el.getAttribute('translate') === 'no') return true;
    return el.parentElement ? protegido(el.parentElement) : false;
  }

  function traduzirTexto(no) {
    const atual = no.nodeValue;
    if (!atual || escritos.get(no) === atual) return;
    const tr = traduzir(atual);
    if (tr === null) return;
    const lead = (atual.match(/^\s*/) || [''])[0];
    const trail = (atual.match(/\s*$/) || [''])[0];
    const novo = lead + tr + trail;
    escritos.set(no, novo);
    if (novo !== atual) no.nodeValue = novo;
  }

  function traduzirAtributos(el) {
    for (const a of ATRIBUTOS) {
      const v = el.getAttribute(a);
      if (!v) continue;
      /* escrever o atributo dispara o observador de novo; na segunda
         volta o texto já é inglês, não casa com nada, e o laço acaba */
      const tr = traduzir(v);
      if (tr !== null && tr !== v) el.setAttribute(a, tr);
    }
    if (el.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(el.type) && el.value) {
      const tr = traduzir(el.value);
      if (tr !== null && tr !== el.value) el.value = tr;
    }
  }

  function traduzirArvore(raiz) {
    if (!raiz) return;
    if (raiz.nodeType === 3) {
      if (raiz.parentElement && !protegido(raiz.parentElement)) traduzirTexto(raiz);
      return;
    }
    if (raiz.nodeType !== 1) return;
    if (protegido(raiz)) {
      /* o <textarea> recém-criado: rótulo e placeholder, sim */
      if (raiz.tagName === 'TEXTAREA' && !atributoProtegido(raiz)) traduzirAtributos(raiz);
      return;
    }
    traduzirAtributos(raiz);
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (n.nodeType === 1) {
          if (n.getAttribute('translate') === 'no') return NodeFilter.FILTER_REJECT;
          if (PULAR.has(n.tagName)) {
            if (n.tagName === 'TEXTAREA') traduzirAtributos(n);
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n = w.nextNode();
    while (n) {
      if (n.nodeType === 3) traduzirTexto(n);
      else traduzirAtributos(n);
      n = w.nextNode();
    }
  }

  /* Blocos do HTML fixo: parágrafo com <strong>, <a>, ícone dentro.
     Achado pelo texto que o navegador mostra; trocado pelo HTML
     traduzido, com os <svg> originais devolvidos no lugar dos ⟦sN⟧. */
  function traduzirBlocos() {
    if (!blocos.size) return;
    const candidatos = document.body.querySelectorAll('p, li, h1, h2, h3, h4, label, span, div, small, td, th, button, a, dd, dt, figcaption, legend, summary');
    for (const el of candidatos) {
      if (protegido(el)) continue;
      const chave = norm(el.textContent);
      if (!chave || !blocos.has(chave)) continue;
      /* só o elemento mais externo com esse texto */
      if (el.parentElement && norm(el.parentElement.textContent) === chave && blocos.has(chave)
          && el.parentElement !== document.body && !protegido(el.parentElement)) continue;
      const svgs = [...el.querySelectorAll('svg')].map((s) => s.outerHTML);
      el.innerHTML = blocos.get(chave).replace(/⟦s(\d+)⟧/g, (t, k) => svgs[+k] || '');
    }
  }

  /* ---------------- observador ---------------- */
  let observador = null;
  function ligarObservador() {
    if (observador || !global.MutationObserver) return;
    observador = new MutationObserver((lista) => {
      for (const m of lista) {
        if (m.type === 'childList') {
          m.addedNodes.forEach((n) => {
            if (n.nodeType === 3) { if (n.parentElement && !protegido(n.parentElement)) traduzirTexto(n); }
            else if (n.nodeType === 1 && !protegido(n)) traduzirArvore(n);
          });
        } else if (m.type === 'characterData') {
          const n = m.target;
          if (n.parentElement && !protegido(n.parentElement)) traduzirTexto(n);
        } else if (m.type === 'attributes') {
          const el = m.target;
          if (!atributoProtegido(el)) traduzirAtributos(el);
        }
      }
    });
    observador.observe(document.body, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ATRIBUTOS.concat(['value'])
    });
    /* o título da aba vive no <head>, fora do corpo */
    const titulo = document.querySelector('title');
    if (titulo) {
      const trocarTitulo = () => { const tr = traduzir(document.title); if (tr !== null && tr !== document.title) document.title = tr; };
      new MutationObserver(trocarTitulo).observe(titulo, { childList: true, characterData: true, subtree: true });
      trocarTitulo();
    }
  }

  /* confirm(), alert() e prompt() não passam pela tela */
  function traduzirDialogos() {
    ['alert', 'confirm', 'prompt'].forEach((nome) => {
      const original = global[nome];
      if (typeof original !== 'function') return;
      global[nome] = function (msg, ...resto) {
        return original.call(global, typeof msg === 'string' ? I18n.t(msg) : msg, ...resto);
      };
    });
  }

  function mostrar() { doc.removeAttribute('data-traduzindo'); }

  /** Chamado pelo dicionário (assets/js/i18n/app-<língua>.js). */
  I18n.carregar = function (qual, dic) {
    if (qual !== lang || !dic) { mostrar(); return; }
    exato = new Map(Object.entries(dic.exato || {}));
    blocos = new Map(Object.entries(dic.blocos || {}));
    padroes = (dic.padroes || []).map(([pt, tr]) => Object.assign(compilarPadrao(pt), { tr }));
    cache.clear();
    try {
      traduzirBlocos();
      traduzirArvore(document.body);
      ligarObservador();
      traduzirDialogos();
    } catch (e) {
      console.error('Idioma: não foi possível traduzir a tela —', e);
    }
    I18n.pronto = true;
    mostrar();
  };

  /** Troca de língua: grava a escolha e recarrega — o app inteiro nasce
      de novo na língua nova, sem meia tela em cada idioma. */
  I18n.escolher = function (nova) {
    if (!LOCALES[nova]) return;
    try { localStorage.setItem('oaze.idioma', nova); } catch (e) { /* recarrega do mesmo jeito */ }
    location.reload();
  };

  global.I18n = I18n;

  if (lang !== 'pt') {
    /* mesma origem, síncrono: o dicionário roda antes de utils.js */
    document.write('<script src="/assets/js/i18n/app-' + lang + '.js"><\/script>');
  }
})(window);
