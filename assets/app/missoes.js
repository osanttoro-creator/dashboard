/* =============================================================
   missoes.js — constância de registro (31/10/2026)
   Uma linha discreta no Início. Sem missões, pontos ou celebração
   (decisão do Jonatham: gamificado demais).

   A sequência vem dos próprios lançamentos (createdAt = quando a
   pessoa registrou), então vale em qualquer aparelho e não depende
   de nada guardado aqui.
   ============================================================= */
(function (global) {
  'use strict';

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const contexto = () => { try { return global.OAZE_REPORT_CONTEXT ? global.OAZE_REPORT_CONTEXT() : null; } catch { return null; } };

  function diaLocal(isoData) {
    const d = new Date(isoData);
    return Number.isFinite(d.getTime()) ? iso(d) : null;
  }
  function segunda(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dia = (x.getDay() + 6) % 7;
    x.setDate(x.getDate() - dia);
    return x;
  }

  /** Dias (AAAA-MM-DD, no fuso do aparelho) em que houve registro. */
  function diasComRegistro(perfil) {
    const dias = new Set();
    (perfil.transactions || []).forEach((t) => { const d = t.createdAt && diaLocal(t.createdAt); if (d) dias.add(d); });
    return dias;
  }

  /** Dias seguidos até hoje (ou até ontem, se hoje ainda não registrou). */
  function sequencia(dias, hoje) {
    const cursor = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    if (!dias.has(iso(cursor))) cursor.setDate(cursor.getDate() - 1);
    let n = 0;
    while (dias.has(iso(cursor))) { n++; cursor.setDate(cursor.getDate() - 1); }
    return n;
  }

  function estado() {
    const c = contexto();
    if (!c || !c.profile) return null;
    const hoje = new Date();
    const dias = diasComRegistro(c.profile);
    const iniISO = iso(segunda(hoje)), hojeISO = iso(hoje);
    const diasSemana = [...dias].filter((d) => d >= iniISO && d <= hojeISO).length;
    return { sequencia: sequencia(dias, hoje), registrouHoje: dias.has(hojeISO), diasSemana };
  }

  /** Uma linha só, sem metas nem pontos: a constância aparece e pronto. */
  function bloco() {
    const e = estado();
    if (!e || (!e.sequencia && !e.diasSemana)) return '';
    const seq = e.sequencia > 1 ? e.sequencia + ' dias seguidos registrando'
      : e.sequencia === 1 ? 'Registrou ' + (e.registrouHoje ? 'hoje' : 'ontem')
      : 'Nenhum registro hoje nem ontem';
    const semana = e.diasSemana + (e.diasSemana === 1 ? ' dia' : ' dias') + ' com registro nesta semana';
    return '<p class="oz-constancia" data-oz-missoes>' + esc(seq) + ' · ' + esc(semana) + '</p>';
  }

  document.addEventListener('oaze:render', (ev) => {
    if (!ev.detail || ev.detail.page !== 'home') return;
    const view = document.getElementById('v3-view');
    if (!view || view.querySelector('[data-oz-missoes]')) return;
    const html = bloco();
    if (!html) return;
    const ancora = view.querySelector('[data-oz-inicio]') || view.querySelector('.v3-home-identity');
    if (ancora) ancora.insertAdjacentHTML('afterend', html); else view.insertAdjacentHTML('beforeend', html);
  });

  global.OazeMissoes = { estado, sequencia, diasComRegistro };
})(window);
