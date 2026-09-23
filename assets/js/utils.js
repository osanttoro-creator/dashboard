/* =============================================================
   utils.js — formatação, datas e helpers de DOM
   Datas trafegam sempre como string 'YYYY-MM-DD' e meses como
   'YYYY-MM'. Nunca usamos new Date('2026-08-11') (vira UTC e
   escorrega um dia); sempre parseISO().
   ============================================================= */
(function (global) {
  'use strict';

  const U = {};

  /* ---------------- língua ----------------
     idioma.js carrega antes deste arquivo e decide a língua da tela.
     Em português nada muda — cada ramo abaixo que não é 'pt' existe só
     para as outras três. O dinheiro continua em real: o que muda é a
     pontuação (R$1,234.56 em inglês), não a moeda do espaço. */
  const LANG = (global.I18n && global.I18n.lang) || 'pt';
  const LOCALE = (global.I18n && global.I18n.locale) || 'pt-BR';
  U.LANG = LANG;
  U.LOCALE = LOCALE;

  /* ---------------- números / moeda ---------------- */

  /* Fora do português, o símbolo curto: o espanhol escreveria "BRL" em
     vez de "R$", e quem lê a tela reconhece o símbolo, não o código. */
  const EXIBICAO = LANG === 'pt' ? {} : { currencyDisplay: 'narrowSymbol' };
  const nfBRL = new Intl.NumberFormat(LOCALE, Object.assign({ style: 'currency', currency: 'BRL' }, EXIBICAO));
  const nfNum = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nfInt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

  U.fmtBRL = (n) => nfBRL.format(Number.isFinite(+n) ? +n : 0);
  /* Moeda do cartão internacional. O formato continua o brasileiro
     (vírgula nos centavos): quem lê é a mesma pessoa, só o símbolo
     muda. Um formatador por moeda, guardado. */
  const nfMoeda = {};
  U.fmtMoeda = function (n, moeda) {
    const m = /^[A-Z]{3}$/.test(moeda || '') ? moeda : 'BRL';
    if (m === 'BRL') return U.fmtBRL(n);
    if (!nfMoeda[m]) {
      try { nfMoeda[m] = new Intl.NumberFormat(LOCALE, Object.assign({ style: 'currency', currency: m }, EXIBICAO)); }
      catch (e) { nfMoeda[m] = { format: (v) => m + ' ' + nfNum.format(v) }; }
    }
    return nfMoeda[m].format(Number.isFinite(+n) ? +n : 0);
  };
  U.fmtNum = (n) => nfNum.format(Number.isFinite(+n) ? +n : 0);
  U.fmtInt = (n) => nfInt.format(Number.isFinite(+n) ? +n : 0);
  const VIRGULA = LANG !== 'en';
  U.fmtPct = (n, d = 1) => {
    const t = Number.isFinite(+n) ? (+n).toFixed(d) : (0).toFixed(d);
    return (VIRGULA ? t.replace('.', ',') : t) + (LANG === 'fr' ? '\u00a0%' : '%');
  };

  /** Valor compacto para eixos e rótulos: 12,3 mil / 4,2 mi */
  const SUFIXOS = {
    pt: [' bi', ' mi', ' mil'], en: ['B', 'M', 'K'],
    fr: ['\u00a0Md', '\u00a0M', '\u00a0k'], es: [' mil M', ' M', ' mil']
  }[LANG] || [' bi', ' mi', ' mil'];
  U.fmtCompact = function (n) {
    const v = Math.abs(+n || 0);
    const s = n < 0 ? '-' : '';
    const semZeros = (t) => t.replace(/[.,]00$/, '');
    if (v >= 1e9) return s + semZeros(nfNum.format(v / 1e9)) + SUFIXOS[0];
    if (v >= 1e6) return s + semZeros(nfNum.format(v / 1e6)) + SUFIXOS[1];
    if (v >= 1e3) return s + nfInt.format(v / 1e3) + SUFIXOS[2];
    return s + nfInt.format(v);
  };
  U.fmtBRLCompact = (n) => 'R$ ' + U.fmtCompact(n);

  /** Aceita "1.234,56", "1234.56", "R$ 1.234,56", "-1.234,56", "(1.234,56)" */
  U.parseMoney = function (raw) {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    if (raw == null) return null;
    let s = String(raw).trim();
    if (!s) return null;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (/^-/.test(s) || /-$/.test(s)) neg = true;
    if (/\b[DC]$/i.test(s) && /D$/i.test(s)) neg = true;
    s = s.replace(/R\$|\s|[A-Za-z()]/g, '').replace(/-/g, '');
    if (!s) return null;
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > -1 && lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.');           // 1.234,56
    } else if (lastDot > -1 && lastComma > -1) {
      s = s.replace(/,/g, '');                               // 1,234.56
    } else if (lastComma > -1) {
      s = s.replace(',', '.');                               // 1234,56
    }
    const n = parseFloat(s);
    if (!Number.isFinite(n)) return null;
    return neg ? -Math.abs(n) : n;
  };

  /* Digitação monetária como uma sequência única de algarismos. Os
     dois últimos são sempre os centavos: 1 → 0,01; 12 → 0,12;
     123 → 1,23. Assim reais e centavos avançam juntos, sem dois
     editores escondidos no mesmo campo. Estas funções são puras para
     que o comportamento possa ser testado sem navegador. */
  const SEPARADOR_DECIMAL = nfNum.formatToParts(1.1)
    .find((p) => p.type === 'decimal').value;
  U.moneyDecimalSeparator = SEPARADOR_DECIMAL;

  U.moneyParts = function (raw) {
    const n = Math.abs(U.parseMoney(raw) || 0);
    const total = Math.round(n * 100);
    return {
      inteiro: String(Math.floor(total / 100)),
      centavos: String(total % 100).padStart(2, '0')
    };
  };

  U.moneyFormatParts = function (inteiro, centavos) {
    const i = (String(inteiro == null ? '' : inteiro).replace(/\D/g, '')
      .replace(/^0+(?=\d)/, '') || '0').slice(0, 15);
    const c = (String(centavos == null ? '' : centavos).replace(/\D/g, '') + '00').slice(0, 2);
    return nfNum.format(Number(i) + Number(c) / 100);
  };

  U.moneyDigits = function (raw) {
    const p = U.moneyParts(raw);
    return (p.inteiro + p.centavos).replace(/^0+/, '') || '0';
  };

  U.moneyGrow = function (raw, digito, substituir) {
    const novo = String(digito).replace(/\D/g, '').slice(-1);
    if (!novo) return U.moneyFormatParts(U.moneyParts(raw).inteiro, U.moneyParts(raw).centavos);
    const base = substituir ? '' : U.moneyDigits(raw).replace(/^0+/, '');
    const todos = (base + novo).replace(/^0+/, '').slice(-17) || '0';
    return U.moneyFormatParts(todos.slice(0, -2) || '0', todos.slice(-2).padStart(2, '0'));
  };

  U.moneyShrink = function (raw) {
    const todos = U.moneyDigits(raw).slice(0, -1) || '0';
    return U.moneyFormatParts(todos.slice(0, -2) || '0', todos.slice(-2).padStart(2, '0'));
  };

  U.moneySetCent = function (raw, digito, posicao) {
    const p = U.moneyParts(raw);
    const pos = Math.max(0, Math.min(1, +posicao || 0));
    const c = p.centavos.split('');
    c[pos] = String(digito).replace(/\D/g, '').slice(-1) || '0';
    return U.moneyFormatParts(p.inteiro, c.join(''));
  };

  U.round2 = (n) => Math.round((+n + Number.EPSILON) * 100) / 100;

  /* ---------------- datas ---------------- */

  /* Escritos à mão, não pedidos ao Intl: o app usa os nomes como
     rótulo ("Setembro"), no meio de frase (.toLowerCase()) e na
     referência curta da fatura ("set/26"), e o Intl de cada navegador
     devolve abreviação diferente ("sept." num, "sep" noutro). */
  const MESES = {
    pt: [['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
      ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']],
    en: [['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
      ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']],
    fr: [['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'],
      ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc']],
    es: [['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
      ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']]
  };
  const MONTHS = (MESES[LANG] || MESES.pt)[0];
  const MONTHS_SHORT = (MESES[LANG] || MESES.pt)[1];
  /* de domingo a sábado, como Date.getDay() */
  U.WEEKDAYS_SHORT = {
    pt: ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'],
    en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    fr: ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'],
    es: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
  }[LANG] || ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  U.MONTHS = MONTHS;
  U.MONTHS_SHORT = MONTHS_SHORT;
  /* No meio da frase o mês vai em minúscula ("no fim de setembro") —
     em português, francês e espanhol. Em inglês, mês é nome próprio. */
  U.frase = (s) => (LANG === 'en' ? String(s) : String(s).toLowerCase());
  U.mesNaFrase = (i) => U.frase(MONTHS[i]);

  const pad = (n) => String(n).padStart(2, '0');
  U.pad = pad;

  /** 'YYYY-MM-DD' -> Date local (meia-noite) */
  U.parseISO = function (iso) {
    if (iso instanceof Date) return iso;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3]);
  };
  U.toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  U.todayISO = () => U.toISO(new Date());
  U.isoOf = (y, mIdx, day) => U.toISO(new Date(y, mIdx, day));

  U.daysInMonth = (y, mIdx) => new Date(y, mIdx + 1, 0).getDate();
  U.clampDay = (y, mIdx, day) => Math.min(Math.max(1, day | 0), U.daysInMonth(y, mIdx));

  /** 'YYYY-MM' */
  U.ymOf = (iso) => String(iso || '').slice(0, 7);
  U.ymKey = (y, mIdx) => {
    const d = new Date(y, mIdx, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  };
  U.todayYM = () => U.ymOf(U.todayISO());
  U.ymParts = (ym) => {
    const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
    return m ? { y: +m[1], m: +m[2] - 1 } : { y: new Date().getFullYear(), m: new Date().getMonth() };
  };
  U.addMonths = (ym, n) => {
    const p = U.ymParts(ym);
    return U.ymKey(p.y, p.m + n);
  };
  U.monthsBetween = (ymA, ymB) => {
    const a = U.ymParts(ymA), b = U.ymParts(ymB);
    return (b.y - a.y) * 12 + (b.m - a.m);
  };
  /** lista de 'YYYY-MM' inclusiva */
  U.monthRange = function (fromYM, toYM) {
    const out = [];
    let cur = fromYM;
    let guard = 0;
    while (U.monthsBetween(cur, toYM) >= 0 && guard++ < 1200) {
      out.push(cur);
      cur = U.addMonths(cur, 1);
    }
    return out;
  };
  U.monthStart = (ym) => { const p = U.ymParts(ym); return U.isoOf(p.y, p.m, 1); };
  U.monthEnd = (ym) => { const p = U.ymParts(ym); return U.isoOf(p.y, p.m, U.daysInMonth(p.y, p.m)); };

  /* "Setembro de 2026" · "September 2026" · "Septembre 2026" · "Septiembre de 2026" */
  const LIGA_ANO = { pt: ' de ', es: ' de ' }[LANG] || ' ';
  U.monthLabel = (ym, short) => {
    const p = U.ymParts(ym);
    return short ? `${MONTHS_SHORT[p.m]}/${String(p.y).slice(2)}` : `${MONTHS[p.m]}${LIGA_ANO}${p.y}`;
  };
  /* O nome ficou (fmtDateBR) porque 60 lugares o chamam; o formato
     segue a língua: dia primeiro em todas, menos em inglês americano. */
  const MES_PRIMEIRO = LANG === 'en';
  U.fmtDateBR = (iso) => {
    const d = U.parseISO(iso);
    if (!d) return '—';
    return MES_PRIMEIRO
      ? `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`
      : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  };
  U.fmtDayMonth = (iso) => {
    const d = U.parseISO(iso);
    if (!d) return '—';
    return MES_PRIMEIRO ? `${pad(d.getMonth() + 1)}/${pad(d.getDate())}` : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  };
  U.addDaysISO = (iso, n) => {
    const d = U.parseISO(iso);
    if (!d) return iso;
    d.setDate(d.getDate() + n);
    return U.toISO(d);
  };
  U.isValidISO = (iso) => !!/^\d{4}-\d{2}-\d{2}$/.test(String(iso)) && !!U.parseISO(iso) &&
    U.toISO(U.parseISO(iso)) === iso;

  /** diferença em anos fracionários (para juros compostos) */
  U.yearsBetween = function (isoA, isoB) {
    const a = U.parseISO(isoA), b = U.parseISO(isoB);
    if (!a || !b) return 0;
    return (b - a) / (365.25 * 24 * 3600 * 1000);
  };

  /* ---------------- strings & misc ---------------- */

  U.uid = function (prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };

  U.escape = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  /** minúsculo sem acento — usado nas heurísticas de categoria */
  U.norm = function (s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  };

  /**
   * Capitalização respeitosa: preserva acentos, siglas (S.A., BB) e
   * palavras que já vêm com minúsculas. Usada em nomes de instituições.
   */
  U.smartCase = function (s) {
    const low = ['de', 'da', 'do', 'das', 'dos', 'e', 'em'];
    return String(s || '').trim().replace(/\s{2,}/g, ' ').split(' ').map((w, i) => {
      if (!w) return w;
      if (/\./.test(w) || w.length <= 3 && w === w.toUpperCase() && /[A-Z]/.test(w)) return w;
      if (w !== w.toUpperCase()) return w;
      const lw = w.toLowerCase();
      if (i > 0 && low.includes(lw)) return lw;
      return lw.charAt(0).toUpperCase() + lw.slice(1);
    }).join(' ');
  };

  U.titleCase = function (s) {
    const low = ['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'a', 'o'];
    return U.norm(s).split(/\s+/).filter(Boolean)
      .map((w, i) => (i > 0 && low.includes(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  };

  U.debounce = function (fn, ms) {
    let t;
    return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms || 220); };
  };

  U.sum = (arr, pick) => arr.reduce((acc, x) => acc + (pick ? (+pick(x) || 0) : (+x || 0)), 0);

  U.groupBy = function (arr, keyFn) {
    const map = new Map();
    arr.forEach((it) => {
      const k = keyFn(it);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(it);
    });
    return map;
  };

  U.download = function (filename, text, mime) {
    const blob = new Blob([text], { type: (mime || 'application/json') + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  /* ---------------- DOM ---------------- */

  U.$ = (sel, root) => (root || document).querySelector(sel);
  U.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /**
   * Irmão de U.el para SVG.
   *
   * createElement('circle') cria um elemento HTML chamado "circle" — que
   * o navegador aceita, insere no DOM e simplesmente NÃO desenha. O
   * elemento existe, mede zero e não dá erro nenhum: some em silêncio.
   * SVG exige createElementNS.
   *
   * Também não dá para usar node.className aqui: em SVG ele é um
   * SVGAnimatedString somente-leitura. Vai por setAttribute.
   */
  const NS_SVG = 'http://www.w3.org/2000/svg';
  U.svg = function (tag, attrs, children) {
    const node = document.createElementNS(NS_SVG, tag);
    if (attrs) {
      Object.keys(attrs).forEach((k) => {
        const v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'style' && typeof v === 'object') {
          Object.keys(v).forEach((prop) => {
            if (prop.indexOf('--') === 0) node.style.setProperty(prop, v[prop]);
            else node.style[prop] = v[prop];
          });
        } else if (k === 'text') {
          node.textContent = v;
        } else if (k.startsWith('on') && typeof v === 'function') {
          node.addEventListener(k.slice(2), v);
        } else {
          node.setAttribute(k, v === true ? '' : v);
        }
      });
    }
    (Array.isArray(children) ? children : (children != null ? [children] : []))
      .forEach((c) => { if (c != null && c !== false) node.appendChild(c); });
    return node;
  };

  U.el = function (tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach((k) => {
        const v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'text') node.textContent = v;
        // Object.assign NÃO define custom properties (--x): elas não são
        // propriedades reais do CSSStyleDeclaration. Precisa de setProperty.
        else if (k === 'style' && typeof v === 'object') {
          Object.keys(v).forEach((prop) => {
            if (prop.indexOf('--') === 0) node.style.setProperty(prop, v[prop]);
            else node.style[prop] = v[prop];
          });
        }
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else node.setAttribute(k, v === true ? '' : v);
      });
    }
    (Array.isArray(children) ? children : (children != null ? [children] : []))
      .forEach((c) => {
        if (c == null || c === false) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    return node;
  };

  U.clear = function (node) { while (node && node.firstChild) node.removeChild(node.firstChild); return node; };

  /** classe de cor conforme o sinal do valor */
  U.signClass = (n) => (n > 0.005 ? 'val-pos' : n < -0.005 ? 'val-neg' : '');

  /** Tinta legível sobre uma cor de fundo: escura em fundos claros, branca nos escuros. */
  U.inkFor = function (hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '').trim());
    if (!m) return '#fff';
    const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const L = 0.2126 * lin(parseInt(m[1], 16)) + 0.7152 * lin(parseInt(m[2], 16)) + 0.0722 * lin(parseInt(m[3], 16));
    return L > 0.36 ? '#0A0B0F' : '#fff';
  };

  /** Sinal + seta para deltas percentuais. upIsGood inverte a cor. */
  U.deltaHtml = function (pct, upIsGood) {
    if (pct == null || !Number.isFinite(pct)) return '<span class="muted">—</span>';
    const up = pct >= 0;
    const good = upIsGood === false ? !up : up;
    const cls = Math.abs(pct) < 0.05 ? '' : (good ? 'up' : 'down');
    const arrow = Math.abs(pct) < 0.05 ? '→' : (up ? '▲' : '▼');
    return `<span class="${cls}">${arrow} ${U.fmtPct(Math.abs(pct))}</span>`;
  };

  global.U = U;
})(window);
