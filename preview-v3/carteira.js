/* =============================================================
   carteira.js — a carteira aberta mostra UM cartão, e ele anda
   -------------------------------------------------------------
   A V3 abria a carteira num leque vertical: seis cartões espiando
   ao mesmo tempo, o que é um índice, não uma carteira. Carteira
   aberta mostra UM cartão, inteiro, com os vizinhos nas bordas para
   você saber que existem e de que lado estão.

   Trocar é pelo lado, como no objeto: arrastando no celular, pelas
   setas (ou pelas flechas do teclado) no computador. O arrasto é
   1:1 — o cartão acompanha o dedo pixel por pixel, porque qualquer
   atraso ali transforma "estou segurando uma coisa" em "pedi para o
   programa fazer algo". Depois do último, vem o primeiro — e vice-versa.

   O módulo vive à parte do app.js porque a V3 redesenha a tela
   inteira por innerHTML a cada render: quem segura gesto e
   animação precisa ser remontável sem carregar estado velho junto.
   ============================================================= */
(function (global) {
  'use strict';

  const Carteira = {};

  /* ---------------------------------------------------------------
     QUAL CARTÃO ESTAVA ABERTO
     Uma carteira de verdade abre no cartão que você usou por último
     — é por isso que você sabe onde ele está sem procurar. Guardar
     só em memória não bastava: recarregar devolvia sempre o
     primeiro. A chave é a MESMA do painel anterior, para os dois não
     discordarem sobre qual era o último.
     --------------------------------------------------------------- */
  const CHAVE = 'oaze.carteira.ultimo';
  function lerTodos() {
    try { return JSON.parse(localStorage.getItem(CHAVE)) || {}; } catch (e) { return {}; }
  }
  Carteira.ultimo = (superficie) => lerTodos()[superficie] || null;
  Carteira.guardar = function (superficie, id) {
    try {
      const todos = lerTodos();
      todos[superficie] = id;
      localStorage.setItem(CHAVE, JSON.stringify(todos));
    } catch (e) { /* navegação privada: perde só o hábito */ }
  };

  /* ---------------------------------------------------------------
     A MOLA
     Uma transição CSS não serve: ela não pode ser interrompida no
     meio sem saltar. Quem agarra o cartão de novo enquanto ele ainda
     volta precisa pegá-lo ONDE ELE ESTÁ — é isso que faz um gesto
     parecer um objeto em vez de uma animação.

     k = 340, criticamente amortecida: ~0,25 s num lance e ~0,42 s
     numa seta, sem passar do ponto. Depois de um lance forte o
     amortecimento afrouxa para 0,8, que é quando um resto de inércia
     é esperado.
     --------------------------------------------------------------- */
  function mola(aoMover) {
    let pos = 0, alvo = 0, v = 0, amort = 1, quadro = null, ultimoT = 0;

    function passo(t) {
      const dt = Math.min(0.032, (t - ultimoT) / 1000 || 0.016);
      ultimoT = t;
      const k = 340;
      const c = 2 * Math.sqrt(k) * amort;
      v += (-k * (pos - alvo) - c * v) * dt;
      pos += v * dt;
      if (Math.abs(pos - alvo) < 0.0005 && Math.abs(v) < 0.01) {
        pos = alvo; v = 0; quadro = null;
        aoMover(pos, true);
        return;
      }
      aoMover(pos, false);
      quadro = requestAnimationFrame(passo);
    }

    return {
      get pos() { return pos; },
      /* Parar devolve a posição ATUAL: é o valor que o dedo assume. */
      parar() {
        if (quadro) cancelAnimationFrame(quadro);
        quadro = null; v = 0;
        return pos;
      },
      definir(p) { this.parar(); pos = alvo = p; aoMover(pos, true); },
      arrastar(p) { pos = p; aoMover(pos, false); },
      lancar(destino, velocidade, solta) {
        alvo = destino;
        if (global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) {
          this.definir(destino);
          return;
        }
        v = velocidade || 0;
        amort = solta ? 0.8 : 1;
        /* A trava é o quadro pendente, e não uma bandeira à parte:
           com a aba escondida o quadro fica agendado sem disparar, e
           uma bandeira solta deixaria a mola trancada para sempre. */
        if (quadro !== null) return;
        ultimoT = performance.now();
        quadro = requestAnimationFrame(passo);
      }
    };
  }

  /* ---------------------------------------------------------------
     MONTAR
     `raiz` é a .v3-wallet recém-desenhada. `aoTrocar(id)` avisa o app
     que o cartão do meio mudou, para o bolso acompanhar — sem
     redesenhar a tela, que mataria o gesto no meio.
     --------------------------------------------------------------- */
  Carteira.montar = function (raiz, opcoes) {
    const o = opcoes || {};
    const palco = raiz.querySelector('.v3-wallet-list');
    if (!palco) return null;
    const nos = Array.from(palco.querySelectorAll('.v3-wallet-item'));
    if (!nos.length) return null;

    const superficie = o.superficie || 'v3';
    let indice = nos.findIndex((n) => n.dataset.select === o.inicial);
    if (indice < 0) indice = nos.findIndex((n) => n.dataset.select === Carteira.ultimo(superficie));
    if (indice < 0) indice = 0;

    const setaAnt = raiz.querySelector('[data-carteira-ant]');
    const setaProx = raiz.querySelector('[data-carteira-prox]');
    const pontos = Array.from(raiz.querySelectorAll('[data-carteira-ponto]'));

    /* =============================================================
       O DISCRETO NÃO ESPERA O CONTÍNUO
       -------------------------------------------------------------
       Qual cartão está no meio — e portanto o pontinho aceso, o
       z-index e o número no bolso — é uma
       decisão que já foi tomada no instante do gesto. A posição
       animada é só onde o cartão ESTÁ a caminho dali.

       Amarrar os dois foi um erro que apareceu com a aba em segundo
       plano: sem requestAnimationFrame a mola não anda, o "centro"
       nunca atualizava e a seta ficava desabilitada apontando para um
       cartão que o índice interno já tinha deixado. Qualquer
       engasgo de quadro produziria o mesmo desencontro.
       ============================================================= */
    const quantidade = nos.length;
    const circular = (i) => ((i % quantidade) + quantidade) % quantidade;
    let centro = -1;
    function aplicarCentro(i) {
      const novo = circular(i);
      if (novo === centro) return;
      centro = novo;
      /* z-index é inteiro: não dá para derivá-lo em CSS de um número
         fracionário. Só muda quando o cartão do meio muda. */
      nos.forEach((n, k) => {
        const distancia = Math.abs(k - centro);
        n.style.zIndex = String(quantidade - Math.min(distancia, quantidade - distancia));
        n.classList.toggle('esta-no-centro', k === centro);
        n.setAttribute('aria-pressed', k === centro ? 'true' : 'false');
        n.tabIndex = k === centro ? 0 : -1;
      });
      pontos.forEach((n, k) => n.classList.toggle('e-agora', k === centro));
      if (o.aoTrocar) o.aoTrocar(nos[centro].dataset.select);
    }

    let indiceVirtual = indice;
    let m;
    function pintar(p, pronto) {
      /* Cada cartão ocupa a cópia mais próxima de seu lugar no anel.
         Assim o primeiro já está à direita do último antes da troca;
         não há viagem de volta por todos os cartões. */
      nos.forEach((n, k) => n.style.setProperty('--deck-i', String(k + quantidade * Math.round((p - k) / quantidade))));
      raiz.style.setProperty('--carta-pos', p.toFixed(4));
      if (pronto && (p < 0 || p >= quantidade)) {
        indiceVirtual = circular(Math.round(p));
        m.definir(indiceVirtual);
      }
    }

    m = mola(pintar);
    m.definir(indice);
    aplicarCentro(indice);

    function irPara(posicao, solta, velocidade) {
      if (quantidade < 2) return;
      indiceVirtual = posicao;
      indice = circular(posicao);
      Carteira.guardar(superficie, nos[indice].dataset.select);
      aplicarCentro(indice);
      m.lancar(posicao, velocidade || 0, !!solta);
    }

    /* ---- geometria ---- */
    let passo = 1;
    function medir() {
      const r = nos[0].getBoundingClientRect();
      /* Passo = cartão + um vão. Maior que o cartão, e não menor: o
         vizinho encosta na borda do palco em vez de montar em cima
         do do meio. Medido, e não escrito duas vezes — o CSS usa o
         mesmo número que o arrasto usa para converter pixels de dedo
         em cartões andados. */
      passo = Math.max(1, r.width + 14);
      raiz.style.setProperty('--carta-salto', passo + 'px');
      /* A altura do palco também é medida: o cartão tem proporção
         fixa sobre uma largura em porcentagem, então só ele sabe
         quanto ocupa. Chutar isso no CSS punha os pontinhos em cima
         do cartão. */
      if (r.height) raiz.style.setProperty('--carta-altura', Math.round(r.height) + 'px');
      return passo;
    }
    medir();
    const observador = global.ResizeObserver ? new ResizeObserver(medir) : null;
    if (observador) observador.observe(palco);

    /* ---- o arrasto ---- */
    let ponteiro = null, x0 = 0, y0 = 0, pos0 = 0, partiuDe = 0;
    let xUlt = 0, tUlt = 0, vx = 0, arrastando = false, decidiu = false;

    function aoDescer(ev) {
      if (quantidade < 2 || ponteiro !== null || ev.button > 0) return;
      ponteiro = ev.pointerId;
      x0 = xUlt = ev.clientX; y0 = ev.clientY;
      tUlt = ev.timeStamp;
      vx = 0; arrastando = false; decidiu = false;
      medir();
      pos0 = m.parar();
      partiuDe = Math.round(pos0);
    }

    function aoMover(ev) {
      if (ev.pointerId !== ponteiro) return;
      const dx = ev.clientX - x0;
      const dy = ev.clientY - y0;
      if (!decidiu) {
        /* Até saber se o gesto é horizontal, não roubar a rolagem da
           página: quem desce a tela com o dedo em cima da carteira
           está lendo, não trocando de cartão. */
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        decidiu = true;
        arrastando = Math.abs(dx) > Math.abs(dy);
        if (!arrastando) { ponteiro = null; return; }
        try { palco.setPointerCapture(ev.pointerId); } catch (e) { /* segue sem captura */ }
        raiz.classList.add('esta-arrastando');
      }
      ev.preventDefault();
      const dt = ev.timeStamp - tUlt;
      if (dt > 0) {
        const inst = ((ev.clientX - xUlt) / dt) * 1000;
        vx = vx * 0.7 + inst * 0.3;   // média móvel: um quadro solto não decide o lance
        xUlt = ev.clientX; tUlt = ev.timeStamp;
      }
      const p = Math.max(partiuDe - 1.15, Math.min(partiuDe + 1.15, pos0 - dx / passo));
      m.arrastar(p);
      /* O bolso acompanha o dedo: ao passar do meio do caminho, o
         número já é o do cartão que está chegando. */
      aplicarCentro(Math.round(p));
    }

    function aoSoltar(ev) {
      if (ev.pointerId !== ponteiro) return;
      ponteiro = null;
      if (!arrastando) return;
      arrastando = false;
      raiz.classList.remove('esta-arrastando');
      try {
        if (palco.hasPointerCapture(ev.pointerId)) palco.releasePointerCapture(ev.pointerId);
      } catch (e) { /* já solto */ }

      const vPaginas = -vx / passo;
      /* UM CARTÃO POR GESTO: a projeção decide a DIREÇÃO e se o lance
         foi forte o bastante; não decide a distância. Carteira não é
         rolagem — passar três de uma vez é perder o lugar. */
      const destino = Math.max(partiuDe - 1, Math.min(partiuDe + 1, Math.round(m.pos + vPaginas * 0.35)));
      /* Teto na velocidade herdada: um lance muito forte com um
         cartão só de distância passaria direto do destino. */
      irPara(destino, Math.abs(vPaginas) > 0.4, Math.max(-6, Math.min(6, vPaginas)));
    }

    palco.addEventListener('pointerdown', aoDescer);
    palco.addEventListener('pointermove', aoMover);
    palco.addEventListener('pointerup', aoSoltar);
    palco.addEventListener('pointercancel', aoSoltar);

    /* Um arrasto não é um clique: sem isto, soltar o dedo em cima de
       um cartão abriria a tela dele. */
    palco.addEventListener('click', (ev) => {
      const cartao = ev.target.closest('.v3-wallet-item');
      if (!cartao) return;
      if (decidiu && Math.abs(ev.clientX - x0) > 6) { ev.stopPropagation(); ev.preventDefault(); return; }
      const i = nos.indexOf(cartao);
      if (i < 0 || i === centro) return;   // o do meio segue para a ação dele
      ev.stopPropagation(); ev.preventDefault();
      const visual = Number(cartao.style.getPropertyValue('--deck-i'));
      irPara(Number.isFinite(visual) ? visual : i, true);
    }, true);

    palco.addEventListener('keydown', (ev) => {
      const passos = { ArrowLeft: -1, ArrowRight: 1 };
      if (!passos[ev.key]) return;
      ev.preventDefault();
      irPara(indiceVirtual + passos[ev.key], true);
      if (nos[indice]) nos[indice].focus();
    });

    if (setaAnt) setaAnt.addEventListener('click', (ev) => { ev.stopPropagation(); irPara(indiceVirtual - 1, true); });
    if (setaProx) setaProx.addEventListener('click', (ev) => { ev.stopPropagation(); irPara(indiceVirtual + 1, true); });

    return {
      destruir() {
        m.parar();
        if (observador) observador.disconnect();
      }
    };
  };

  global.V3Carteira = Carteira;
})(window);
