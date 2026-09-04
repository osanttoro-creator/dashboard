/* =============================================================
   ui.js — modal, toasts e pedaços de UI reutilizados
   ============================================================= */
(function (global) {
  'use strict';

  const UI = {};
  const el = U.el;

  /* ---------------- toasts ---------------- */

  UI.toast = function (message, type, ms) {
    const box = document.getElementById('toasts');
    if (!box) return;
    const node = el('div', { class: 'toast' + (type ? ' is-' + type : ''), text: message });
    box.appendChild(node);
    setTimeout(() => {
      node.style.transition = 'opacity .2s, transform .2s';
      node.style.opacity = '0';
      node.style.transform = 'translateX(12px)';
      setTimeout(() => node.remove(), 220);
    }, ms || 3200);
  };

  /* ---------------- modal ---------------- */

  const root = () => document.getElementById('modalRoot');
  let onCloseCb = null;

  UI.openModal = function (opts) {
    const r = root();
    const modal = r.querySelector('.modal');
    r.querySelector('#modalTitle').textContent = opts.title || '';
    modal.classList.toggle('modal-wide', !!opts.wide);

    const body = U.clear(r.querySelector('#modalBody'));
    if (typeof opts.body === 'string') body.innerHTML = opts.body;
    else if (opts.body) body.appendChild(opts.body);

    const foot = U.clear(r.querySelector('#modalFoot'));
    (opts.buttons || []).forEach((b) => {
      if (!b) return;
      foot.appendChild(el('button', {
        class: 'btn ' + (b.class || 'btn-outline') + (b.align === 'left' ? ' left' : ''),
        type: 'button',
        text: b.label,
        onclick: b.onClick
      }));
    });

    onCloseCb = opts.onClose || null;
    r.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      const first = body.querySelector('input:not([type=hidden]):not([disabled]), select, textarea');
      if (first && !opts.noAutofocus) first.focus();
    }, 40);
  };

  UI.closeModal = function () {
    const r = root();
    if (r.hidden) return;
    r.hidden = true;
    document.body.style.overflow = '';
    const cb = onCloseCb; onCloseCb = null;
    if (cb) cb();
  };

  UI.confirm = function (opts) {
    return new Promise((resolve) => {
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      UI.openModal({
        title: opts.title || 'Confirmar',
        body: el('p', { style: { fontSize: '13.5px', lineHeight: '1.6' }, html: opts.message || '' }),
        buttons: [
          { label: opts.cancelLabel || 'Cancelar', class: 'btn-outline', onClick: () => { done(false); UI.closeModal(); } },
          { label: opts.confirmLabel || 'Confirmar', class: opts.danger ? 'btn-danger' : 'btn-primary', onClick: () => { done(true); UI.closeModal(); } }
        ],
        noAutofocus: true,
        onClose: () => done(false)
      });
    });
  };

  document.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-close-modal]')) UI.closeModal();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !root().hidden) UI.closeModal();
  });

  /* ---------------- blocos de UI ---------------- */

  /**
   * Cartão de KPI. Todo KPI carrega um valor de comparação —
   * um número sem referência não diz nada.
   */
  UI.kpi = function (o) {
    return el('div', {
      class: 'kpi' + (o.hero ? ' kpi-hero' : ''),
      style: { '--accent': o.accent || 'var(--axis)' }
    }, [
      el('span', { class: 'kpi-label', text: o.label }),
      el('span', { class: 'kpi-value ' + (o.valueClass || ''), text: o.value }),
      el('span', { class: 'kpi-delta', html: o.delta || '&nbsp;' })
    ]);
  };

  UI.renderKpis = function (containerId, items) {
    const box = U.clear(document.getElementById(containerId));
    items.forEach((i) => box.appendChild(UI.kpi(i)));
  };

  /**
   * Escreve um valor e, se ele mudou, anima a entrada.
   * Reescrever o mesmo texto não anima — piscar sem motivo é ruído,
   * e o objetivo aqui é justamente marcar a mudança.
   */
  UI.setValue = function (id, texto) {
    const n = typeof id === 'string' ? document.getElementById(id) : id;
    if (!n) return;
    if (n.textContent === texto) return;
    n.textContent = texto;
    n.classList.remove('num-anim');
    void n.offsetWidth;          // reinicia a animação
    n.classList.add('num-anim');
  };

  UI.empty = function (message) {
    return el('p', { class: 'empty-note', text: message });
  };

  /**
   * Estado vazio com saída. Uma tela sem dados que só diz "nada aqui"
   * parece quebrada; a mesma tela dizendo o que fazer em seguida
   * ensina o produto. Por isso a ação não é opcional na prática:
   * quase todo lugar sem dado tem um próximo passo óbvio.
   *
   * @param {object} o { ico, titulo, sub, acao: {texto, onClick}, secundaria }
   */
  UI.emptyState = function (o) {
    return el('div', { class: 'card empty-state' }, [
      o.ico ? el('span', { class: 'empty-ico' }, Icons.lucide(o.ico, 26)) : null,
      el('p', { class: 'empty-title', text: o.titulo }),
      o.sub ? el('p', { class: 'empty-sub', text: o.sub }) : null,
      o.acao
        ? el('button', {
          class: 'btn btn-primary btn-sm', type: 'button',
          text: o.acao.texto, onclick: o.acao.onClick
        })
        : null,
      o.secundaria
        ? el('button', {
          class: 'btn btn-ghost btn-sm', type: 'button',
          text: o.secundaria.texto, onclick: o.secundaria.onClick
        })
        : null
    ].filter(Boolean));
  };

  UI.emptyRow = function (colspan, message) {
    return el('tr', { class: 'empty-row' }, el('td', { colspan, text: message }));
  };

  UI.catDot = function (color) {
    return el('span', { class: 'cat-dot', style: { background: color } });
  };

  UI.badge = function (text, kind) {
    return el('span', { class: 'badge ' + (kind ? 'badge-' + kind : ''), text });
  };

  /** Mostra/oculta a mensagem de "sem dados" sobre um canvas. */
  UI.toggleEmptyOverlay = function (id, show) {
    const n = document.getElementById(id);
    if (n) n.hidden = !show;
  };

  /** Preenche um <select> preservando o valor quando possível. */
  UI.fillSelect = function (select, options, value, placeholder) {
    if (!select) return;
    const keep = value !== undefined ? value : select.value;
    U.clear(select);
    if (placeholder) select.appendChild(el('option', { value: '', text: placeholder }));
    options.forEach((o) => select.appendChild(el('option', { value: o.value, text: o.label })));
    if (keep != null && options.some((o) => String(o.value) === String(keep))) select.value = keep;
    else if (placeholder) select.value = '';
    else if (options.length) select.value = options[0].value;
  };

  /** Seletor de cor a partir da paleta validada. */
  UI.colorPicker = function (initial, onPick) {
    const wrap = el('div', { class: 'color-picker' });
    const colors = Store.ALL_COLORS.slice();
    let current = initial || colors[0];
    if (current && !colors.includes(current)) colors.push(current); // cor herdada de dados antigos
    colors.forEach((c) => {
      const b = el('button', {
        type: 'button', class: 'color-opt' + (c === current ? ' is-active' : ''),
        style: { background: c }, 'aria-label': 'Cor ' + c,
        onclick: () => {
          current = c;
          U.$$('.color-opt', wrap).forEach((n) => n.classList.remove('is-active'));
          b.classList.add('is-active');
          if (onPick) onPick(c);
        }
      });
      wrap.appendChild(b);
    });
    wrap.getValue = () => current;
    return wrap;
  };

  /** Controle segmentado (duas ou três opções). */
  UI.segmented = function (options, value, onChange) {
    const wrap = el('div', { class: 'seg' });
    let current = value;
    options.forEach((o) => {
      const b = el('button', {
        type: 'button', class: current === o.value ? 'is-active' : '', text: o.label,
        onclick: () => {
          current = o.value;
          U.$$('button', wrap).forEach((n) => n.classList.remove('is-active'));
          b.classList.add('is-active');
          if (onChange) onChange(o.value);
        }
      });
      wrap.appendChild(b);
    });
    wrap.getValue = () => current;
    return wrap;
  };

  global.UI = UI;
})(window);
