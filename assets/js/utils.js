/* =============================================================
   utils.js — formatação, datas e helpers de DOM
   Datas trafegam sempre como string 'YYYY-MM-DD' e meses como
   'YYYY-MM'. Nunca usamos new Date('2026-08-11') (vira UTC e
   escorrega um dia); sempre parseISO().
   ============================================================= */
(function (global) {
  'use strict';

  const U = {};

  /* ---------------- números / moeda ---------------- */

  const nfBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const nfNum = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nfInt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

  U.fmtBRL = (n) => nfBRL.format(Number.isFinite(+n) ? +n : 0);
  U.fmtNum = (n) => nfNum.format(Number.isFinite(+n) ? +n : 0);
  U.fmtInt = (n) => nfInt.format(Number.isFinite(+n) ? +n : 0);
  U.fmtPct = (n, d = 1) => (Number.isFinite(+n) ? (+n).toFixed(d).replace('.', ',') : '0,0') + '%';

  /** Valor compacto para eixos e rótulos: 12,3 mil / 4,2 mi */
  U.fmtCompact = function (n) {
    const v = Math.abs(+n || 0);
    const s = n < 0 ? '-' : '';
    if (v >= 1e9) return s + nfNum.format(v / 1e9).replace(',00', '') + ' bi';
    if (v >= 1e6) return s + nfNum.format(v / 1e6).replace(',00', '') + ' mi';
    if (v >= 1e3) return s + nfInt.format(v / 1e3) + ' mil';
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

  U.round2 = (n) => Math.round((+n + Number.EPSILON) * 100) / 100;

  /* ---------------- datas ---------------- */

  const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  U.MONTHS = MONTHS;
  U.MONTHS_SHORT = MONTHS_SHORT;

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

  U.monthLabel = (ym, short) => {
    const p = U.ymParts(ym);
    return short ? `${MONTHS_SHORT[p.m]}/${String(p.y).slice(2)}` : `${MONTHS[p.m]} de ${p.y}`;
  };
  U.fmtDateBR = (iso) => {
    const d = U.parseISO(iso);
    return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '—';
  };
  U.fmtDayMonth = (iso) => {
    const d = U.parseISO(iso);
    return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}` : '—';
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
