/* =============================================================
   coco-pet.js — a Coco minimizada, viva (31/10/2026)
   Troca a imagem parada do botão flutuante pelos estados animados
   (WebP transparente feito a partir dos GIFs de 02_COCO/PET E GIF).

   Comportamento:
   - parada: respira; de tempos em tempos olha em volta ou dá um
     pulinho (a "dança"), nunca enquanto a pessoa interage;
   - mouse longe: anda um pouco na direção do cursor e volta;
   - mouse em cima: acena; apertar: pula (e o botão abre a Coco);
   - sem internet: fica triste até voltar;
   - movimento reduzido no sistema: fica parada, sem andar.
   O botão continua sendo o mesmo <button data-action="coco">.
   ============================================================= */
(function (global) {
  'use strict';

  const BASE = '/assets/coco/pets/coco-';
  /* duração de um ciclo (quadros × atraso), para saber quando voltar */
  const CICLO = { idle: 720, 'running-left': 960, 'running-right': 960, running: 720, waving: 480, jumping: 600,
    failed: 960, waiting: 720, review: 720, 'look-loop': 2880, 'idle-jump-idle': 1360 };
  const DANCA = ['look-loop', 'idle-jump-idle', 'idle-jump-idle', 'waving'];
  const reduzido = global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mouse = global.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;

  let fab = null, img = null, atual = '', ate = 0, voltarT = 0, dancaT = 0, desvioX = 0, andarT = 0, ocioso = 0, emCima = false;

  function src(estado) { return reduzido ? BASE + 'parada.webp' : BASE + estado + '.webp'; }
  function mostrar(estado, ms) {
    if (!img) return;
    if (atual !== estado) { img.src = src(estado); atual = estado; }
    clearTimeout(voltarT);
    ate = ms ? Date.now() + ms : 0;
    if (ms) voltarT = setTimeout(() => { ate = 0; if (!emCima) mostrar(desvioX ? 'idle' : 'idle'); }, ms);
  }
  const ocupado = () => ate > Date.now() || emCima;

  function agendarDanca() {
    clearTimeout(dancaT);
    if (reduzido) return;
    dancaT = setTimeout(() => {
      if (!document.hidden && !ocupado() && navigator.onLine !== false) {
        const e = DANCA[Math.floor(Math.random() * DANCA.length)];
        mostrar(e, CICLO[e] * (e === 'waving' ? 3 : 1));
      }
      agendarDanca();
    }, 9000 + Math.random() * 8000);
  }

  /* Andar: o botão fica preso no canto direito, então ela só anda
     para a esquerda (até 90 px) e volta quando o mouse some. */
  function andarPara(alvo) {
    alvo = Math.max(-90, Math.min(0, Math.round(alvo)));
    if (Math.abs(alvo - desvioX) < 12) return;
    const indo = alvo < desvioX ? 'running-left' : 'running-right';
    desvioX = alvo;
    fab.style.setProperty('--coco-x', alvo + 'px');
    mostrar(indo, 700);
  }
  function aoMover(ev) {
    if (!fab || reduzido || emCima || fab.classList.contains('esta-recolhida')) return;
    ocioso = Date.now();
    if (andarT) return;
    andarT = requestAnimationFrame(() => {
      andarT = 0;
      const r = fab.getBoundingClientRect();
      const cx = r.left + r.width / 2 - desvioX, cy = r.top + r.height / 2;
      const dx = ev.clientX - cx, dy = ev.clientY - cy;
      if (Math.abs(dy) > 420) return;                 // longe demais na vertical: ignora
      if (dx < -200) andarPara(dx * 0.18);
      else if (dx > -120) andarPara(0);
    });
  }
  function voltarAoCanto() { if (desvioX) andarPara(0); }

  function ligar() {
    const f = document.querySelector('.v3-coco-fab');
    if (!f || f === fab) return;
    fab = f;
    img = fab.querySelector('.v3-coco-pet img');
    if (!img) return;
    fab.classList.add('coco-viva');
    img.width = 372; img.height = 314;
    img.decoding = 'async';
    mostrar('idle');
    agendarDanca();

    fab.addEventListener('pointerenter', (ev) => { if (ev.pointerType !== 'mouse') return; emCima = true; mostrar('waving'); });
    fab.addEventListener('pointerleave', (ev) => { if (ev.pointerType !== 'mouse') return; emCima = false; mostrar('idle'); });
    fab.addEventListener('pointerdown', () => { mostrar('jumping', CICLO.jumping); });
    fab.addEventListener('focus', () => { if (!emCima) mostrar('waving', CICLO.waving * 3); });

    /* carrega os outros estados depois, sem disputar com o painel */
    if (!reduzido) {
      const pre = () => Object.keys(CICLO).forEach((e) => { const i = new Image(); i.decoding = 'async'; i.src = src(e); });
      'requestIdleCallback' in global ? requestIdleCallback(pre, { timeout: 4000 }) : setTimeout(pre, 2500);
    }
  }

  if (mouse && !reduzido) {
    document.addEventListener('pointermove', aoMover, { passive: true });
    document.documentElement.addEventListener('pointerleave', voltarAoCanto);
    setInterval(() => { if (desvioX && Date.now() - ocioso > 6000) voltarAoCanto(); }, 2000);
  }
  global.addEventListener('offline', () => mostrar('failed'));
  global.addEventListener('online', () => mostrar('jumping', CICLO.jumping));
  document.addEventListener('visibilitychange', () => { if (!document.hidden && atual !== 'failed') mostrar('idle'); });
  document.addEventListener('oaze:render', (ev) => {
    ligar();
    const n = document.getElementById('v3-coco-count');
    if (ev.detail && ev.detail.page === 'home' && n && !n.hidden && !ocupado()) mostrar('waving', CICLO.waving * 3);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ligar); else ligar();

  /* Outras partes do app podem pedir um estado: lendo, esperando, erro. */
  global.OazeCocoPet = {
    estado(nome, ms) { if (CICLO[nome]) mostrar(nome, ms || CICLO[nome] * 2); },
    pensando(sim) { sim ? mostrar('review') : mostrar('idle'); }
  };
})(window);
