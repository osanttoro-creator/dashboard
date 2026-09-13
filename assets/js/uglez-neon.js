/* =============================================================
   uglez-neon.js — a borda neon do balão do UGLEZ
   -------------------------------------------------------------
   Porte do NeonBorder (Originkit) para JavaScript sem framework.
   A matemática é a do componente original, sem mudança: dois arcos
   opostos correm o PERÍMETRO do retângulo — não um ângulo fixo —,
   então a velocidade na borda é a mesma no lado curto e no longo, e
   o arco não estica nas quinas. Cada arco é um conic-gradient
   amostrado em 24 pontos, recalculado por quadro, recortado em anel
   por máscara e somado a três camadas de brilho desfocado.

   O QUE MUDOU NA ADAPTAÇÃO
     · Cor: o token --uglez do elemento, lido ao montar. No claro é
       o royal escuro, no escuro o royal claro — a borda acompanha o
       tema sem regra nova. Na identidade v1, o UGLEZ é o único que
       pode emitir luz; por isso esta borda existe só no balão dele.
     · Raio: o border-radius real do balão, e não uma porcentagem do
       menor lado. O anel precisa abraçar a quina que está desenhada.
     · Velocidade: segue o estado do UGLEZ. Em repouso o arco dá uma
       volta a cada ~20 s; pensando, a cada 4 s — o preset original.
       O movimento conta o que está acontecendo, como as partículas.
     · No claro, o brilho soma por mistura normal: plus-lighter sobre
       fundo claro estoura para branco e o arco some.
     · Só anima com o balão aberto e a aba visível. Com menos
       movimento, desenha os arcos parados, uma vez.
   ============================================================= */
(function (global) {
  'use strict';

  const N = {};

  const EDGE_COPIES = 2;
  const GLOW_LAYERS = [
    { blur: 8, opacity: 0.5, reach: 0.3 },
    { blur: 15, opacity: 0.3, reach: 0.6 },
    { blur: 57, opacity: 0.18, reach: 1 }
  ];
  const MAX_GLOW_BLUR = 57;
  const MAX_GLOW_REACH = 36;
  const ARC_SAMPLES = 24;
  const MIN_ARC = 0.015;
  const SLOWEST_CYCLE = 30;
  const FASTEST_CYCLE = 4;
  const SLOWEST_STEP = 3;
  const FASTEST_STEP = 0.35;

  /* Velocidade (1–20, a escala do componente) por estado do UGLEZ. */
  const VELOCIDADE = {
    repouso: 8, foco: 10, recebendo: 18, pensando: 20,
    respondendo: 14, sucesso: 12, erro: 4
  };

  function withAlpha(input, alpha) {
    const a = Math.max(0, Math.min(1, alpha));
    const s = String(input || '').trim();
    const hex = s.match(/^#([0-9a-f]{3,8})$/i);
    if (hex) {
      let h = hex[1];
      if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
      const n = parseInt(h.slice(0, 6), 16);
      if (!Number.isFinite(n)) return 'rgba(0,0,0,' + a + ')';
      return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }
    const rgb = s.match(/^rgba?\(([^)]+)\)/i);
    if (rgb) {
      const p = rgb[1].split(',').map((v) => parseFloat(v));
      if (p.length >= 3 && p.slice(0, 3).every(Number.isFinite)) return 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + a + ')';
    }
    return 'rgba(0,0,0,' + a + ')';
  }

  function perimeterPoint(u, w, h) {
    const d = (((u % 1) + 1) % 1) * 2 * (w + h);
    if (d < w) return [d, 0];
    if (d < w + h) return [w, d - w];
    if (d < w * 2 + h) return [w - (d - w - h), h];
    return [0, h - (d - w * 2 - h)];
  }

  function cornerLap(k, w, h) {
    const p = 2 * (w + h);
    const at = [0, w / p, (w + h) / p, (w * 2 + h) / p];
    return Math.floor(k / 4) + at[((k % 4) + 4) % 4];
  }

  function perimeterAngle(u, w, h) {
    const pt = perimeterPoint(u, w, h);
    return (Math.atan2(pt[0] - w / 2, h / 2 - pt[1]) * 180) / Math.PI;
  }

  function buildArc(lap, lengthPct, w, h, color) {
    const fw = w > 0 ? w : 100;
    const fh = h > 0 ? h : 100;
    const len = Math.max(0, Math.min(100, lengthPct));
    const span = Math.max(MIN_ARC, (len / 100) * 0.5);
    const solidT = len / 100;
    const stops = [];
    let base = 0, prev = 0, acc = 0;

    for (let i = 0; i <= ARC_SAMPLES; i++) {
      const f = i / ARC_SAMPLES;
      const angle = perimeterAngle(lap + (f - 0.5) * span, fw, fh);
      if (i === 0) {
        base = angle;
      } else {
        let d = angle - prev;
        while (d > 180) d -= 360;
        while (d < -180) d += 360;
        acc += d;
      }
      prev = angle;
      const t = Math.abs(f - 0.5) * 2;
      const k = solidT >= 1 ? 1 : t <= solidT ? 1 : 1 - (t - solidT) / (1 - solidT);
      stops.push(withAlpha(color, k * k * (3 - 2 * k)) + ' ' + acc.toFixed(2) + 'deg');
    }
    stops.push(withAlpha(color, 0) + ' ' + acc.toFixed(2) + 'deg');
    stops.push(withAlpha(color, 0) + ' 360deg');
    return 'conic-gradient(from ' + base.toFixed(2) + 'deg at 50% 50%, ' + stops.join(', ') + ')';
  }

  function makeEase(pts) {
    const x1 = pts[0], y1 = pts[1], x2 = pts[2], y2 = pts[3];
    if (x1 === y1 && x2 === y2) return (t) => t;
    const bez = (a, b, t) => { const u = 1 - t; return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t; };
    return (t) => {
      const x = Math.max(0, Math.min(1, t));
      let s = x;
      for (let i = 0; i < 8; i++) {
        const cx = bez(x1, x2, s) - x;
        const u = 1 - s;
        const dx = 3 * u * u * x1 + 6 * u * s * (x2 - x1) + 3 * s * s * (1 - x2);
        if (Math.abs(dx) < 1e-6) break;
        s = Math.max(0, Math.min(1, s - cx / dx));
      }
      return bez(y1, y2, s);
    };
  }
  const stepEase = makeEase([0.72, 0.16, 0.18, 1.05]);
  const glideEase = makeEase([0.65, 0, 0.35, 1]);

  /* A máscara que transforma um retângulo cheio num anel. */
  function mascaraDeAnel(el) {
    const m = 'linear-gradient(#fff 0 0), linear-gradient(#fff 0 0)';
    el.style.webkitMaskImage = m;
    el.style.webkitMaskClip = 'content-box, border-box';
    el.style.webkitMaskComposite = 'xor';
    el.style.maskImage = m;
    el.style.maskClip = 'content-box, border-box';
    el.style.maskComposite = 'exclude';
  }

  const inerte = { velocidade() { return inerte; }, estado() { return inerte; }, ligar() { return inerte; }, desligar() { return inerte; }, destruir() {} };

  /**
   * Monta a borda dentro de `alvo`. O alvo precisa ser posicionado e
   * NÃO pode ter overflow:hidden — o brilho vaza para fora dele.
   * Devolve { estado(nome), velocidade(1–20), ligar(), desligar(), destruir() }.
   */
  N.montar = function (alvo, opcoes) {
    if (!alvo || !global.CSS || !CSS.supports || !CSS.supports('background', 'conic-gradient(red, blue)')) return inerte;

    const op = Object.assign({ espessura: 2, tamanho: 43, brilho: 70, movimento: 'continuous' }, opcoes);
    const reduzido = !!(global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    /* No toque, a camada de 57 px sai: é a mais cara de redesenhar por
       quadro, e numa tela pequena o halo dela quase não aparece. */
    const toque = !!(global.matchMedia && matchMedia('(pointer: coarse)').matches);
    const camadasDeBrilho = toque ? GLOW_LAYERS.slice(0, 2) : GLOW_LAYERS;
    const claro = () => document.documentElement.getAttribute('data-theme') !== 'dark';

    let cor = (op.cor || getComputedStyle(alvo).getPropertyValue('--uglez') || '#4669F0').trim();
    let velocidade = VELOCIDADE.repouso;
    let raio = 0;
    let largura = 0, altura = 0;

    const raiz = document.createElement('div');
    raiz.className = 'uglez-neon';
    raiz.setAttribute('aria-hidden', 'true');

    const thick = Math.max(1, Math.min(10, op.espessura));
    const amount = Math.max(0, Math.min(100, op.brilho)) / 100;
    const ringAt = (share) => thick + amount * MAX_GLOW_REACH * share;
    const glowOuter = 10 + MAX_GLOW_REACH + MAX_GLOW_BLUR * 2;

    const bandas = [];     // [elemento, deslocamento] — o raio muda com o tamanho
    const camadas = [];    // camadas de brilho, para trocar a mistura com o tema

    function banda(r, offset) {
      const b = document.createElement('div');
      b.style.cssText = 'position:absolute;box-sizing:border-box;background:var(--arc);';
      b.style.inset = (offset - r) + 'px';
      b.style.padding = r + 'px';
      mascaraDeAnel(b);
      bandas.push([b, r]);
      return b;
    }

    function grupo() {
      const g = document.createElement('div');
      g.style.cssText = 'position:absolute;inset:0;overflow:visible;pointer-events:none;';
      if (amount > 0) {
        camadasDeBrilho.forEach((l) => {
          const c = document.createElement('div');
          c.style.cssText = 'position:absolute;box-sizing:border-box;';
          c.style.inset = (-glowOuter) + 'px';
          c.style.padding = glowOuter + 'px';
          c.style.opacity = String(l.opacity);
          c.style.filter = 'blur(' + l.blur + 'px)';
          mascaraDeAnel(c);
          c.appendChild(banda(ringAt(l.reach), glowOuter));
          c.dataset.fora = String(glowOuter);
          camadas.push(c);
          g.appendChild(c);
        });
      }
      for (let i = 0; i < EDGE_COPIES; i++) {
        const e = document.createElement('div');
        e.style.cssText = 'position:absolute;inset:0;';
        e.appendChild(banda(thick, 0));
        camadas.push(e);
        g.appendChild(e);
      }
      raiz.appendChild(g);
      return g;
    }

    const grupoA = grupo();
    const grupoB = grupo();
    alvo.appendChild(raiz);

    function medir() {
      const r = alvo.getBoundingClientRect();
      largura = r.width; altura = r.height;
      raio = parseFloat(getComputedStyle(alvo).borderTopLeftRadius) || 0;
      bandas.forEach(([b, r2]) => { b.style.borderRadius = raio > 0 ? (raio + r2) + 'px' : '0'; });
      camadas.forEach((c) => {
        const fora = parseFloat(c.dataset.fora || '0');
        c.style.borderRadius = raio > 0 ? (raio + fora) + 'px' : '0';
        /* plus-lighter soma luz: lindo no escuro, estoura no claro. */
        c.style.mixBlendMode = claro() ? 'normal' : 'plus-lighter';
      });
    }

    let lap = 0, corner = 0, stepT = 0, ultimo = 0, raf = 0, ligado = false;
    let lapPintado = -1;

    function pintar() {
      lapPintado = lap;
      grupoA.style.setProperty('--arc', buildArc(lap, op.tamanho, largura, altura, cor));
      grupoB.style.setProperty('--arc', buildArc(lap + 0.5, op.tamanho, largura, altura, cor));
    }

    function quadro(agora) {
      if (!ligado) return;
      const dt = Math.min(0.05, Math.max(0, (agora - (ultimo || agora)) / 1000));
      ultimo = agora;
      const s = Math.max(0, Math.min(20, velocidade));
      if (s > 0) {
        const step = op.movimento === 'step';
        const beat = step
          ? SLOWEST_STEP + ((FASTEST_STEP - SLOWEST_STEP) * (s - 1)) / 19
          : (SLOWEST_CYCLE + ((FASTEST_CYCLE - SLOWEST_CYCLE) * (s - 1)) / 19) / 4;
        stepT += dt / beat;
        while (stepT >= 1) { stepT -= 1; corner += 1; }
        const eased = step ? stepEase(Math.min(1, stepT * 2)) : glideEase(stepT);
        const fw = largura > 0 ? largura : 100;
        const fh = altura > 0 ? altura : 100;
        const from = cornerLap(corner, fw, fh);
        const to = cornerLap(corner + 1, fw, fh);
        lap = from + (to - from) * eased;
        /* Cada pintura redesenha as camadas desfocadas. Em repouso o arco
           anda menos de 2 px por quadro; só se pinta quando ele de fato
           se moveu na tela (0,15% do perímetro). */
        const perimetro = 2 * (fw + fh);
        if (Math.abs(lap - lapPintado) * perimetro >= 1.5) pintar();
      }
      raf = requestAnimationFrame(quadro);
    }

    const ro = global.ResizeObserver ? new ResizeObserver(() => { medir(); pintar(); }) : null;
    if (ro) ro.observe(alvo);

    function aoVisibilidade() {
      if (document.hidden) controle.desligar();
      else if (controle._querLigado) controle.ligar();
    }
    document.addEventListener('visibilitychange', aoVisibilidade);

    const controle = {
      _querLigado: false,
      estado(nome) {
        velocidade = VELOCIDADE[nome] !== undefined ? VELOCIDADE[nome] : VELOCIDADE.repouso;
        return controle;
      },
      velocidade(v) { velocidade = Math.max(0, Math.min(20, +v || 0)); return controle; },
      ligar() {
        controle._querLigado = true;
        cor = (op.cor || getComputedStyle(alvo).getPropertyValue('--uglez') || cor).trim();
        medir();
        pintar();
        if (reduzido || ligado || document.hidden) return controle;
        ligado = true; ultimo = 0;
        raf = requestAnimationFrame(quadro);
        return controle;
      },
      desligar() {
        ligado = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        return controle;
      },
      destruir() {
        controle._querLigado = false;
        controle.desligar();
        document.removeEventListener('visibilitychange', aoVisibilidade);
        if (ro) ro.disconnect();
        raiz.remove();
      }
    };
    return controle;
  };

  global.UglezNeon = N;
})(window);
