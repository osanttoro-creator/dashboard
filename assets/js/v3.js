/* =============================================================
   site.js — o pouco de comportamento que a página precisa
   -------------------------------------------------------------
   Quatro coisas: o menu do celular, a linha do cabeçalho ao rolar,
   a revelação dos blocos e o alternador mensal/anual dos planos.

   Sem JavaScript a página continua inteira e legível — a classe
   `anima` no <html> é escrita no <head> justamente para que o CSS
   só esconda o que este arquivo sabe revelar. O preço mensal é o
   que está no HTML, então quem chega sem script vê um preço certo,
   não um espaço vazio.
   ============================================================= */
(function () {
  'use strict';

  /* ---------------- menu do celular ---------------- */

  var topo = document.getElementById('topo');
  var botao = topo && topo.querySelector('.hamburguer');

  if (topo && botao) {
    var fechar = function () {
      topo.classList.remove('aberto');
      botao.setAttribute('aria-expanded', 'false');
      botao.setAttribute('aria-label', 'Abrir menu');
    };

    botao.addEventListener('click', function () {
      var aberto = topo.classList.toggle('aberto');
      botao.setAttribute('aria-expanded', aberto ? 'true' : 'false');
      botao.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
    });

    /* Escolher um destino fecha o menu: ele cobre o topo da página,
       e ficar aberto sobre a seção recém-aberta é uma porta que não
       se fecha sozinha. */
    topo.addEventListener('click', function (ev) {
      if (ev.target.closest && ev.target.closest('.menu a') && topo.classList.contains('aberto')) fechar();
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && topo.classList.contains('aberto')) { fechar(); botao.focus(); }
    });
  }

  /* ---------------- a linha do cabeçalho ---------------- */

  /* O cabeçalho é de vidro e nasce sem borda: a linha só entra
     quando há conteúdo passando por baixo. Antes disso ela seria um
     traço separando o nada. */
  if (topo) {
    var marcar = function () { topo.classList.toggle('rolou', window.scrollY > 8); };
    marcar();
    window.addEventListener('scroll', marcar, { passive: true });
  }

  /* ---------------- mensal × anual ----------------
     Os dois preços moram no HTML, em data-mensal e data-anual. O
     script só troca qual está à mostra: assim não existe um preço
     que só o JavaScript conhece, e o que aparece sem script é o
     mensal, que é o principal. */

  var ciclo = document.querySelector('.ciclo');
  if (ciclo) {
    var botoes = ciclo.querySelectorAll('button[data-ciclo]');
    ciclo.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('button[data-ciclo]');
      if (!b) return;
      var qual = b.dataset.ciclo;
      Array.prototype.forEach.call(botoes, function (x) {
        x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
      });
      document.querySelectorAll('[data-mensal][data-anual]').forEach(function (n) {
        n.textContent = qual === 'anual' ? n.dataset.anual : n.dataset.mensal;
      });
    });
  }

  /* ---------------- revelar ao rolar ---------------- */

  var alvos = document.querySelectorAll('.revela');
  if (!alvos.length) return;

  var querMenos = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!('IntersectionObserver' in window) || querMenos) {
    Array.prototype.forEach.call(alvos, function (n) { n.classList.add('visivel'); });
    return;
  }

  var observador = new IntersectionObserver(function (entradas) {
    entradas.forEach(function (e) {
      if (!e.isIntersecting) return;
      /* Escalonamento curto entre irmãos: o bloco inteiro entrando
         de uma vez lê como salto, não como chegada. */
      var irmaos = e.target.parentElement ? e.target.parentElement.children : [e.target];
      var i = Array.prototype.indexOf.call(irmaos, e.target);
      e.target.style.transitionDelay = Math.min(i, 4) * 70 + 'ms';
      e.target.classList.add('visivel');
      observador.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });

  Array.prototype.forEach.call(alvos, function (n) { observador.observe(n); });
})();

/* =============================================================
   MOTION
   -------------------------------------------------------------
   O CSS desenha; este trecho só entrega números e troca classes.
   Tudo aqui é opcional: sem JavaScript, ou com "menos movimento"
   ligado, a página fica na composição final e continua completa.
   ============================================================= */
(function () {
  'use strict';

  var querMenos = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* O hello passou a ser escrito pela lente, no fim deste arquivo. */

  if (querMenos) return;

  /* ---------------------------------------------------------------
     2 · as telas que se revezam
     ---------------------------------------------------------------
     Um relógio só para todos os conjuntos de quadros, e ele só anda
     enquanto o conjunto está na tela: revezar quadro fora de vista é
     trabalho jogado fora, e em celular é bateria. */
  function revezar(raiz, ms) {
    if (!raiz) return;
    var quadros = raiz.querySelectorAll('.quadro');
    if (quadros.length < 2) return;
    var i = 0;

    /* A primeira versão só ligava o relógio quando um
       IntersectionObserver dissesse que o conjunto estava visível — e
       o observador dispara antes de as capturas carregarem, com a
       figura ainda de altura zero, então ele dizia "não está" e nunca
       mais voltava atrás. O relógio agora anda sempre; quem decide se
       troca de quadro é a posição medida na hora, que não depende de
       quando a imagem chegou. */
    var naTela = function () {
      var r = raiz.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight;
    };

    setInterval(function () {
      if (document.hidden || !naTela()) return;
      i = (i + 1) % quadros.length;
      Array.prototype.forEach.call(quadros, function (q, k) {
        q.classList.toggle('is-ativo', k === i);
      });
    }, ms);
  }

  var heroi = document.querySelector('[data-quadros]');
  if (heroi) revezar(heroi, 3200);

  /* ---------------------------------------------------------------
     3 · a cena dos aparelhos
     ---------------------------------------------------------------
     O quanto a cena já subiu na tela vira dois números, e o CSS abre
     o notebook e traz o celular a partir deles. As duas fases se
     sobrepõem de propósito: o celular começa a chegar antes de a
     tampa terminar de abrir, senão a cena para num quadro morto no
     meio do caminho.

     Calcula só enquanto a cena está visível, e sempre dentro de um
     requestAnimationFrame: ler getBoundingClientRect a cada evento
     de rolagem é o jeito clássico de travar a página no celular. */
  var cena = document.querySelector('[data-cena]');
  if (!cena) return;

  var fase = function (p, de, ate) { return Math.max(0, Math.min(1, (p - de) / (ate - de))); };
  var suave = function (t) { return 1 - Math.pow(1 - t, 3); };

  var pedido = 0;
  var naTela = false;

  var desenhar = function () {
    pedido = 0;
    var r = cena.getBoundingClientRect();
    /* 0 quando a cena encosta na base da janela, 1 quando já subiu o
       suficiente para estar inteira em cena. */
    var curso = window.innerHeight + r.height;
    var p = curso > 0 ? Math.max(0, Math.min(1, (window.innerHeight - r.top) / curso)) : 1;
    cena.style.setProperty('--a', suave(fase(p, 0.12, 0.46)).toFixed(4));
    cena.style.setProperty('--b', suave(fase(p, 0.3, 0.62)).toFixed(4));
  };

  var pedir = function () {
    if (naTela && !pedido) pedido = requestAnimationFrame(desenhar);
  };

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (e) {
      naTela = e[0].isIntersecting;
      pedir();
    }).observe(cena);
  } else {
    naTela = true;
  }

  window.addEventListener('scroll', pedir, { passive: true });
  window.addEventListener('resize', pedir);
  desenhar();

  revezar(cena.querySelector('.celular'), 2800);
})();

/* =============================================================
   A LENTE
   -------------------------------------------------------------
   Duas coisas, e só: escrever o hello e converter a rolagem em raio.
   Quem desenha é o CSS.
   ============================================================= */
(function () {
  'use strict';

  var lente = document.querySelector('[data-lente]');
  if (!lente) return;

  var palco = lente.querySelector('.lente-palco');
  var saudacao = lente.querySelector('.lente-saudacao');
  var traco = lente.querySelector('.lente-saudacao .hello-traco');
  var menos = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (menos) return;

  /* Avisa o CSS que há script vivo. Sem este aviso a cortina se
     recolhe sozinha em 4 s — uma tela preta presa por um script que
     não carregou deixaria o site inacessível. */
  document.documentElement.classList.add('lente-viva');

  /* ---- 1 · o hello, escrito à mão ----
     Usa o comprimento REAL do caminho, e não pathLength="1": o Safari
     levou anos para respeitar pathLength no tracejado, e sem isso o
     hello viraria uma linha pontilhada. O tracejado entra antes da
     primeira pintura, então o traço não pisca inteiro e some. */
  if (traco && traco.getTotalLength) {
    var comprimento = traco.getTotalLength();
    traco.style.strokeDasharray = comprimento + ' ' + comprimento * 2;
    traco.style.strokeDashoffset = String(comprimento);

    var ATRASO = 320;
    var DURACAO = 2400;
    var inicio = null;

    var escrever = function (agora) {
      if (inicio === null) inicio = agora;
      var t = Math.max(0, Math.min(1, (agora - inicio - ATRASO) / DURACAO));
      /* ease-in-out: a caneta arranca devagar, corre no meio e pousa
         devagar — o ritmo de quem escreve, não o de uma máquina. */
      var e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      traco.style.strokeDashoffset = (comprimento * (1 - e)).toFixed(2);
      if (t < 1) requestAnimationFrame(escrever);
      else if (saudacao) saudacao.classList.add('escrito');
    };
    requestAnimationFrame(escrever);
  } else if (saudacao) {
    saudacao.classList.add('escrito');
  }

  /* ---- 2 · a rolagem vira raio ---- */
  var pendente = false;

  var desenhar = function () {
    pendente = false;
    var curso = Math.max(1, lente.offsetHeight - window.innerHeight);
    var andado = window.scrollY - lente.offsetTop;
    var p = Math.max(0, Math.min(1, andado / curso));
    var suave = 1 - Math.pow(1 - p, 4);
    /* 1.5x a maior dimensão: o furo precisa passar dos cantos, senão
       sobra uma moldura preta quando a abertura termina. */
    var raio = Math.max(window.innerWidth, window.innerHeight) * 1.5 * suave;

    /* O hello some nos primeiros 12% da rolagem. Com mais que isso a
       lente — que abre rápido no começo — já mostraria a página
       enquanto ainda sobra um pedaço dele na tela. A máscara garante
       que ele nunca fica POR CIMA; este prazo curto garante que ele
       nem divide a tela com ela. */
    var passagem = Math.min(1, p / 0.12);

    palco.style.setProperty('--lente-raio', raio.toFixed(1) + 'px');
    palco.style.setProperty('--lente-progresso', suave.toFixed(4));
    palco.style.setProperty('--hello-opacidade', (1 - passagem).toFixed(3));
    palco.style.setProperty('--hello-escala', (1 + passagem * 0.16).toFixed(4));
  };

  var pedir = function () {
    if (pendente) return;
    pendente = true;
    requestAnimationFrame(desenhar);
  };

  window.addEventListener('scroll', pedir, { passive: true });
  window.addEventListener('resize', pedir);

  /* Alguém que chega pelo teclado e tabula para dentro do herói não
     pode ficar preso atrás da cortina. */
  lente.addEventListener('focusin', function () {
    palco.style.setProperty('--lente-raio', '220vmax');
    palco.style.setProperty('--hello-opacidade', '0');
  });

  desenhar();
})();
